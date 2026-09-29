import crypto from 'crypto';
import type {VercelRequest,VercelResponse} from '@vercel/node';
import type {Application,ApplicationStage,ApplicationStatus,ProcessingOption,ProcessStage} from '../src/types.js';
import {mapRowToApplication,mapApplicationToRow,mapRowToVacancy,mapRowToDossier,mapDossierToRow} from '../server/utils/mappers.js';
import {readSheetRows,findSheetRowById,appendSheetRow,updateSheetRowById} from '../server/utils/sheets.js';
import {authenticateRequest,isStaff} from '../server/utils/permissions.js';
import {recordSafeAuditLog} from '../server/utils/audit.js';
import {sendSafeTelegramAlert,escapeTelegramHtml} from '../server/utils/telegram.js';
import {visaProducts,priceFor} from '../src/config/catalog.js';
const A='Applications',V='Vacancies',D='Dossiers';
const clean=(v:unknown)=>String(v??'').trim();
function auth(req:VercelRequest,res:VercelResponse){const a=authenticateRequest(req.headers.authorization);if(!a.authorized||!a.session){res.status(a.statusCode).json({error:a.errorMessage});return null}return a.session}
const statusForStage=(s:ApplicationStage):ApplicationStatus=>s===1?'SUBMITTED':s===2?'APPROVED':s===3?'PROCESSING':'FINAL_PAYMENT';
const daysFromNow=(n:number)=>new Date(Date.now()+n*86400000).toISOString();
export default async function handler(req:VercelRequest,res:VercelResponse){try{
 const session=auth(req,res);if(!session)return;
 if(req.method==='GET'){const rows=(await readSheetRows(A)).map(mapRowToApplication);return res.status(200).json({applications:isStaff(session)?rows:rows.filter(x=>x.userId===session.userId)})}
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 const action=clean(req.body?.action||'create').toLowerCase();
 if(action==='create'){
   const vacancyId=clean(req.body?.vacancyId);const row=await findSheetRowById(V,vacancyId);if(!row)return res.status(404).json({error:'Vacancy not found.'});const vacancy=mapRowToVacancy(row);if(!vacancy.isActive||vacancy.quotaRemaining<=0)return res.status(409).json({error:'Vacancy is not accepting applications.'});
   const product=visaProducts.find(x=>x.id===clean(req.body?.visaProductId||vacancy.visaProductId));if(!product)return res.status(400).json({error:'Visa product is not configured for this vacancy.'});const processing=clean(req.body?.processingOption||'STANDARD') as ProcessingOption;if(!product.allowedProcessing.includes(processing))return res.status(400).json({error:'Selected processing option is unavailable for this country/product.'});
   const active=(await readSheetRows(A)).map(mapRowToApplication).find(x=>x.userId===session.userId&&x.vacancyId===vacancyId&&!["REJECTED","CANCELLED"].includes(x.status));if(active)return res.status(409).json({error:'You already have an active application for this vacancy.'});
   const now=new Date().toISOString();const totalCost=priceFor(product,processing);const app:Application={id:`APP-${new Date().getUTCFullYear()}-${crypto.randomInt(100000,1000000)}`,userId:session.userId,vacancyId,applicantData:JSON.stringify(req.body?.applicantData||{}),status:'SUBMITTED',stage:1,visaProductId:product.id,country:vacancy.country,processingOption:processing,totalCost,currency:'EUR',createdAt:now,updatedAt:now};
   await appendSheetRow(A,mapApplicationToRow(app));await updateSheetRowById(V,vacancy.id,mapRowToVacancy(row) as any).catch(()=>{});await recordSafeAuditLog({actorUserId:session.userId,action:'APPLICATION_CREATE',targetEntity:'APPLICATION',targetEntityId:app.id,details:`${vacancy.title} / ${vacancy.country}`});await sendSafeTelegramAlert(`<b>New application</b> <code>${app.id}</code>\n${escapeTelegramHtml(vacancy.title)}`);return res.status(201).json({application:app});
 }
 if(action==='updateStage'){
   if(!isStaff(session))return res.status(403).json({error:'Staff access required.'});const id=clean(req.body?.applicationId);const row=await findSheetRowById(A,id);if(!row)return res.status(404).json({error:'Application not found.'});const old=mapRowToApplication(row);const next=Number(req.body?.stage) as ApplicationStage;if(![1,2,3,4].includes(next))return res.status(400).json({error:'Stage must be 1, 2, 3 or 4.'});
   if(next>old.stage+1)return res.status(409).json({error:'Application stages must advance sequentially.'});
   if(next<old.stage)return res.status(409).json({error:'Stage cannot move backwards through this endpoint.'});
   if(next===old.stage)return res.status(200).json({application:old});
   const now=new Date().toISOString();let updated:Application={...old,stage:next,status:statusForStage(next),updatedAt:now};
   if(next===2){updated.approvedAt=now;updated.paymentDeadlineAt=daysFromNow(5);if(!updated.totalCost||updated.totalCost<=0)return res.status(409).json({error:'Application has no valid approved price.'});
     const existingD=(await readSheetRows(D)).map(mapRowToDossier).find(d=>d.userId===old.userId&&d.vacancyId===old.vacancyId&&d.createdAt>=old.createdAt);if(!existingD){const dossier={id:`BW-${new Date().getUTCFullYear()}-${crypto.randomInt(100000,1000000)}`,userId:old.userId,fullName:clean((JSON.parse(old.applicantData||'{}') as any).firstName)+' '+clean((JSON.parse(old.applicantData||'{}') as any).lastName),passportNumber:'PENDING',citizenship:clean((JSON.parse(old.applicantData||'{}') as any).citizenship),targetCountry:old.country||'',vacancyId:old.vacancyId,vacancyTitle:(await findSheetRowById(V,old.vacancyId))?.title||'',processStatus:'DOCUMENTS_REQUIRED' as const,paymentStatus:'NOT_DUE' as const,currency:old.currency,totalCost:old.totalCost,paidAmount:0,remainingAmount:old.totalCost,createdAt:now,updatedAt:now};await appendSheetRow(D,mapDossierToRow(dossier));}}
   if(next===3){const dossier=(await readSheetRows(D)).map(mapRowToDossier).find(d=>d.userId===old.userId&&d.vacancyId===old.vacancyId&&d.totalCost===old.totalCost);if(!dossier)return res.status(409).json({error:'Dossier must exist before stage 3.'});const pays=(await readSheetRows('PaymentTransactions')).filter(r=>r.dossierId===dossier.id&&r.status==='CONFIRMED');const first=pays.reduce((n,r)=>n+Number(r.amount||0),0);if(first+0.01<old.totalCost*0.3)return res.status(409).json({error:'Stage 3 requires confirmed 30% first payment.'});updated.documentDeadlineAt=daysFromNow((Number(req.body?.documentDays)||56));updated.processStage='IN_PROCESS';}
   if(next===4){const dossier=(await readSheetRows(D)).map(mapRowToDossier).find(d=>d.userId===old.userId&&d.vacancyId===old.vacancyId&&d.totalCost===old.totalCost);if(!dossier)return res.status(409).json({error:'Dossier not found.'});}
   await updateSheetRowById(A,id,mapApplicationToRow(updated));await recordSafeAuditLog({actorUserId:session.userId,action:'APPLICATION_STAGE_CHANGE',targetEntity:'APPLICATION',targetEntityId:id,details:`${old.stage} -> ${next}`});return res.status(200).json({application:updated});
 }
 if(action==='updateProcessStage'){
   if(!isStaff(session))return res.status(403).json({error:'Staff access required.'});const id=clean(req.body?.applicationId);const row=await findSheetRowById(A,id);if(!row)return res.status(404).json({error:'Application not found.'});const old=mapRowToApplication(row);if(old.stage!==3)return res.status(409).json({error:'Document process stages are available only in stage 3.'});const ps=clean(req.body?.processStage) as ProcessStage;const allowed=['IN_PROCESS','EMPLOYER_SUBMITTED','EMPLOYER_APPROVED_FOR_MINISTRY','LEGAL_SERVICE','MINISTRY_SUBMITTED','MINISTRY_REVIEW','MINISTRY_APPROVED','FINAL_LEGAL_SERVICE'];if(!allowed.includes(ps))return res.status(400).json({error:'Invalid process stage.'});const updated={...old,processStage:ps,updatedAt:new Date().toISOString()};await updateSheetRowById(A,id,mapApplicationToRow(updated));return res.status(200).json({application:updated});
 }
 if(action==='updateApplicant'){
   if(session.userId!==clean(req.body?.userId)&&!isStaff(session))return res.status(403).json({error:'Forbidden.'});const id=clean(req.body?.applicationId);const row=await findSheetRowById(A,id);if(!row)return res.status(404).json({error:'Application not found.'});const old=mapRowToApplication(row);if(old.userId!==session.userId&&!isStaff(session))return res.status(403).json({error:'Forbidden.'});if(old.stage!==1)return res.status(409).json({error:'Applicant details can only be completed in stage 1.'});const data=req.body?.applicantData||{};const required=['firstName','lastName','birthDate','gender','citizenship','criminalRecord','phone','previousVisa','travelWithFamily'];if(!Boolean(data.middleNameAbsent)&&!clean(data.middleName))return res.status(400).json({error:'Middle name is required unless marked absent in passport.'});for(const k of required)if(!clean(data[k]))return res.status(400).json({error:`Missing applicant field: ${k}`});const updated={...old,applicantData:JSON.stringify(data),updatedAt:new Date().toISOString()};await updateSheetRowById(A,id,mapApplicationToRow(updated));return res.status(200).json({application:updated});
 }
 if(action==='seed'){
   if(!isStaff(session))return res.status(403).json({error:'Staff access required.'});return res.status(200).json({message:'Vacancies are seeded by the catalog script; no implicit application records are created.'});
 }
 return res.status(400).json({error:'Unknown application action.'});
}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
