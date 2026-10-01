import crypto from 'crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import type { UserRecord, Role, PricingItem, SystemSetting, GalleryItem, SupportTicket, SupportTicketStatus, BackupRecord } from '../src/types.js';
import { mapRowToUserRecord,mapUserToRow,mapRowToAuditLog,mapRowToPricing,mapPricingToRow,mapRowToSetting,mapSettingToRow,mapRowToGallery,mapGalleryToRow,mapRowToSupportTicket,mapSupportTicketToRow,mapBackupToRow } from '../server/utils/mappers.js';
import { readSheetRows,findSheetRowById,appendSheetRow,updateSheetRowById,SHEET_SCHEMAS } from '../server/utils/sheets.js';
import { authenticateRequest,hasRole,isStaff } from '../server/utils/permissions.js';
import { uploadFileToDrive } from '../server/utils/drive.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';

const clean=(v:unknown)=>String(v??'').trim();
function getSession(req:VercelRequest,res:VercelResponse){const a=authenticateRequest(req.headers.authorization);if(!a.authorized||!a.session){res.status(a.statusCode).json({error:a.errorMessage});return null;}return a.session;}
function requireAdmin(session:any,res:VercelResponse){if(!hasRole(session,['ADMIN'])){res.status(403).json({error:'Admin role required.'});return false;}return true;}

export default async function handler(req:VercelRequest,res:VercelResponse){try{
 const session=getSession(req,res);if(!session)return; const action=clean(req.query.action||req.body?.action).toLowerCase();
 if(action==='support'){
   if(req.method==='GET'){const rows=(await readSheetRows('SupportTickets')).map(mapRowToSupportTicket);return res.status(200).json({tickets:isStaff(session)?rows:rows.filter(x=>x.userId===session.userId)});}
   if(req.method==='POST'){
     const b=req.body||{};
     if(b.ticketId){if(!isStaff(session))return res.status(403).json({error:'Staff only.'});const row=await findSheetRowById('SupportTickets',clean(b.ticketId));if(!row)return res.status(404).json({error:'Ticket not found.'});const old=mapRowToSupportTicket(row),status=clean(b.status).toUpperCase() as SupportTicketStatus;const allowed=['OPEN','IN_PROGRESS','RESOLVED','CLOSED'];if(!allowed.includes(status))return res.status(400).json({error:'Invalid ticket status.'});const updated={...old,status,assignedManagerId:b.assignedManagerId!==undefined?clean(b.assignedManagerId):old.assignedManagerId,updatedAt:new Date().toISOString()};await updateSheetRowById('SupportTickets',old.id,mapSupportTicketToRow(updated));return res.status(200).json({ticket:updated});}
     const ticket:SupportTicket={id:`TKT-${Date.now()}`,userId:session.userId,dossierId:b.dossierId?clean(b.dossierId):undefined,subject:clean(b.subject),message:clean(b.message),status:'OPEN',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(!ticket.subject||!ticket.message)return res.status(400).json({error:'Subject and message are required.'});await appendSheetRow('SupportTickets',mapSupportTicketToRow(ticket));await recordSafeAuditLog({actorUserId:session.userId,action:'SUPPORT_CREATE',targetEntity:'TICKET',targetEntityId:ticket.id});return res.status(201).json({ticket});
   }
 }
 if(!isStaff(session))return res.status(403).json({error:'Staff access required.'});
 if(req.method==='GET'&&action==='dashboard'){
   const [users,dossiers,apps,payments,docs,vacancies,team]=await Promise.all([readSheetRows('Users'),readSheetRows('Dossiers'),readSheetRows('Applications'),readSheetRows('PaymentTransactions'),readSheetRows('DossierDocuments'),readSheetRows('Vacancies'),readSheetRows('Team')]);
   return res.status(200).json({counts:{users:users.length,dossiers:dossiers.length,applications:apps.length,payments:payments.length,documents:docs.length,activeVacancies:vacancies.filter(r=>String(r.isActive)==='true').length,team:team.length},pendingPayments:payments.filter(r=>r.status==='PENDING_REVIEW').length,pendingDocuments:docs.filter(r=>r.status==='UPLOADED').length,openApplications:apps.filter(r=>!['REJECTED','WITHDRAWN'].includes(r.status)).length});
 }
 if(req.method==='GET'&&action==='users'){
   if(!requireAdmin(session,res))return; return res.status(200).json({users:(await readSheetRows('Users')).map(mapRowToUserRecord).map(u=>{const {passwordHash:_,...publicUser}=u;return publicUser;})});
 }
 if(req.method==='GET'&&action==='audit'){
   if(!requireAdmin(session,res))return; const logs=(await readSheetRows('AuditLog')).map(mapRowToAuditLog).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)); return res.status(200).json({logs:logs.slice(0,300)});
 }
 if(req.method==='POST'&&action==='users'){
   if(!requireAdmin(session,res))return; const id=clean(req.body?.userId),row=await findSheetRowById('Users',id);if(!row)return res.status(404).json({error:'User not found.'});const old=mapRowToUserRecord(row);const roles=Array.isArray(req.body?.roles)?req.body.roles.filter((x:string)=>['CLIENT','MANAGER','ADMIN'].includes(x)) as Role[]:old.roles;if(!roles.length)return res.status(400).json({error:'At least one valid role is required.'});const updated:UserRecord={...old,roles,isActive:req.body?.isActive===undefined?old.isActive:Boolean(req.body.isActive)};await updateSheetRowById('Users',id,mapUserToRow(updated));await recordSafeAuditLog({actorUserId:session.userId,action:'USER_ROLE_UPDATE',targetEntity:'USER',targetEntityId:id,details:`roles=${roles.join(',')} active=${updated.isActive}`});const {passwordHash:_,...publicUser}=updated;return res.status(200).json({user:publicUser});
 }
 if(req.method==='GET'&&action==='pricing')return res.status(200).json({items:(await readSheetRows('Pricing')).map(mapRowToPricing)});
 if(req.method==='POST'&&action==='pricing'){
   if(!requireAdmin(session,res))return;const b=req.body||{},id=clean(b.id);const now=new Date().toISOString();const item:PricingItem={id:id||`PRICE-${Date.now()}`,name:clean(b.name),description:clean(b.description),amount:Number(b.amount),currency:clean(b.currency||'EUR').toUpperCase(),active:b.active===undefined?true:Boolean(b.active),updatedAt:now,updatedBy:session.userId};if(!item.name||!Number.isFinite(item.amount)||item.amount<0)return res.status(400).json({error:'Valid pricing name and amount are required.'});if(id&&await findSheetRowById('Pricing',id))await updateSheetRowById('Pricing',id,mapPricingToRow(item));else await appendSheetRow('Pricing',mapPricingToRow(item));await recordSafeAuditLog({actorUserId:session.userId,action:'PRICING_SAVE',targetEntity:'PRICING',targetEntityId:item.id});return res.status(200).json({item});
 }
 if(req.method==='GET'&&action==='settings')return res.status(200).json({settings:(await readSheetRows('SystemSettings')).map(mapRowToSetting)});
 if(req.method==='POST'&&action==='settings'){
   if(!requireAdmin(session,res))return;const b=req.body||{},key=clean(b.key);if(!key)return res.status(400).json({error:'Setting key is required.'});const rows=await readSheetRows('SystemSettings');const old=rows.map(mapRowToSetting).find(x=>x.key===key);const item:SystemSetting={id:old?.id||`SET-${Date.now()}`,key,value:clean(b.value),updatedAt:new Date().toISOString(),updatedBy:session.userId};if(old)await updateSheetRowById('SystemSettings',old.id,mapSettingToRow(item));else await appendSheetRow('SystemSettings',mapSettingToRow(item));await recordSafeAuditLog({actorUserId:session.userId,action:'SETTING_SAVE',targetEntity:'SETTING',targetEntityId:item.id,details:key});return res.status(200).json({setting:item});
 }
 if(req.method==='GET'&&action==='gallery')return res.status(200).json({items:(await readSheetRows('Gallery')).map(mapRowToGallery).sort((a,b)=>a.order-b.order)});
 if(req.method==='POST'&&action==='gallery'){
   if(!requireAdmin(session,res))return;const b=req.body||{},id=clean(b.id);const item:GalleryItem={id:id||`GAL-${Date.now()}`,title:clean(b.title),imageUrl:clean(b.imageUrl),caption:clean(b.caption),order:Number(b.order)||0,isActive:b.isActive===undefined?true:Boolean(b.isActive)};if(!item.title||!item.imageUrl)return res.status(400).json({error:'Gallery title and image URL are required.'});if(id&&await findSheetRowById('Gallery',id))await updateSheetRowById('Gallery',id,mapGalleryToRow(item));else await appendSheetRow('Gallery',mapGalleryToRow(item));await recordSafeAuditLog({actorUserId:session.userId,action:'GALLERY_SAVE',targetEntity:'GALLERY',targetEntityId:item.id});return res.status(200).json({item});
 }
 if(req.method==='POST'&&action==='backup'){
   if(!requireAdmin(session,res))return; const data:Record<string,unknown>={generatedAt:new Date().toISOString(),generatedBy:session.userId,schema:SHEET_SCHEMAS};for(const name of Object.keys(SHEET_SCHEMAS)){data[name]=await readSheetRows(name);}
   const fileName=`Vanguard-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;const root=clean(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);if(!root)throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is missing.');const upload=await uploadFileToDrive(root,'backups-'+fileName,'application/json',Buffer.from(JSON.stringify(data,null,2),'utf8'));const backup:BackupRecord={id:`BKP-${Date.now()}-${crypto.randomInt(1000,9999)}`,createdBy:session.userId,driveFileId:upload.fileId,fileName,createdAt:new Date().toISOString()};await appendSheetRow('Backups',mapBackupToRow(backup));await recordSafeAuditLog({actorUserId:session.userId,action:'BACKUP_CREATE',targetEntity:'BACKUP',targetEntityId:backup.id,details:fileName});return res.status(201).json({backup});
 }
 return res.status(400).json({error:'Unknown admin action.'});
}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
