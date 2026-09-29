import type { VercelRequest,VercelResponse } from '@vercel/node';
import type { TeamMember } from '../src/types.js';
import { mapRowToTeamMember,mapTeamMemberToRow } from '../server/utils/mappers.js';
import { readSheetRows,findSheetRowById,appendSheetRow,updateSheetRowById } from '../server/utils/sheets.js';
import { authenticateRequest,isStaff } from '../server/utils/permissions.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';

const SHEET='Team'; const clean=(v:unknown)=>String(v??'').trim();
export default async function handler(req:VercelRequest,res:VercelResponse){try{
  if(req.method==='GET')return res.status(200).json({team:(await readSheetRows(SHEET)).map(mapRowToTeamMember).sort((a,b)=>a.order-b.order)});
  const a=authenticateRequest(req.headers.authorization);if(!a.authorized||!a.session)return res.status(a.statusCode).json({error:a.errorMessage});if(!isStaff(a.session))return res.status(403).json({error:'Only staff can manage team.'});
  const action=clean(req.query.action||req.body?.action).toLowerCase();
  if(req.method==='POST'&&(action===''||action==='create')){const b=req.body||{};const m:TeamMember={id:`TEAM-${Date.now()}`,fullName:clean(b.fullName),position:clean(b.position),photoUrl:clean(b.photoUrl),languages:Array.isArray(b.languages)?b.languages.map(clean).filter(Boolean):clean(b.languages).split(',').map(clean).filter(Boolean),bio:clean(b.bio),order:Number(b.order)||0};if(!m.fullName||!m.position)return res.status(400).json({error:'Full name and position are required.'});await appendSheetRow(SHEET,mapTeamMemberToRow(m));await recordSafeAuditLog({actorUserId:a.session.userId,action:'TEAM_CREATE',targetEntity:'TEAM',targetEntityId:m.id});return res.status(201).json({member:m});}
  if(req.method==='PATCH'){const id=clean(req.body?.memberId);const row=await findSheetRowById(SHEET,id);if(!row)return res.status(404).json({error:'Team member not found.'});const old=mapRowToTeamMember(row),b=req.body||{};const m={...old,fullName:b.fullName!==undefined?clean(b.fullName):old.fullName,position:b.position!==undefined?clean(b.position):old.position,photoUrl:b.photoUrl!==undefined?clean(b.photoUrl):old.photoUrl,languages:b.languages!==undefined?(Array.isArray(b.languages)?b.languages.map(clean).filter(Boolean):clean(b.languages).split(',').map(clean).filter(Boolean)):old.languages,bio:b.bio!==undefined?clean(b.bio):old.bio,order:b.order!==undefined?Number(b.order)||0:old.order};await updateSheetRowById(SHEET,id,mapTeamMemberToRow(m));await recordSafeAuditLog({actorUserId:a.session.userId,action:'TEAM_UPDATE',targetEntity:'TEAM',targetEntityId:id});return res.status(200).json({member:m});}
  return res.status(405).json({error:'Method not allowed.'});
}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
