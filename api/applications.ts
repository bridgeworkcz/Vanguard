import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Application, ApplicationStatus } from '../src/types.js';
import { mapRowToApplication, mapApplicationToRow, mapRowToVacancy } from '../server/utils/mappers.js';
import { readSheetRows, findSheetRowById, appendSheetRow, updateSheetRowById } from '../server/utils/sheets.js';
import { authenticateRequest, isStaff } from '../server/utils/permissions.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';
import { sendSafeTelegramAlert, escapeTelegramHtml } from '../server/utils/telegram.js';

const SHEET='Applications'; const VAC='Vacancies';
const allowed: ApplicationStatus[]=['SUBMITTED','UNDER_REVIEW','SHORTLISTED','REJECTED','ACCEPTED','WITHDRAWN'];

async function getAuth(req: VercelRequest,res:VercelResponse){const a=authenticateRequest(req.headers.authorization);if(!a.authorized||!a.session){res.status(a.statusCode).json({error:a.errorMessage});return null;}return a.session;}

export default async function handler(req:VercelRequest,res:VercelResponse){
  try{
    const session=await getAuth(req,res); if(!session)return;
    if(req.method==='GET'){
      const rows=(await readSheetRows(SHEET)).map(mapRowToApplication);
      return res.status(200).json({applications:isStaff(session)?rows:rows.filter(x=>x.userId===session.userId)});
    }
    if(req.method==='POST'){
      const action=String(req.body?.action||'create').toLowerCase();
      if(action==='create'){
        const vacancyId=String(req.body?.vacancyId||'').trim();
        const vacancyRow=await findSheetRowById(VAC,vacancyId);
        if(!vacancyRow)return res.status(404).json({error:'Vacancy not found.'});
        const vacancy=mapRowToVacancy(vacancyRow);
        if(!vacancy.isActive || vacancy.quotaRemaining<=0)return res.status(409).json({error:'This vacancy is not currently accepting applications.'});
        const existing=(await readSheetRows(SHEET)).map(mapRowToApplication).find(x=>x.userId===session.userId&&x.vacancyId===vacancyId&&['SUBMITTED','UNDER_REVIEW','SHORTLISTED','ACCEPTED'].includes(x.status));
        if(existing)return res.status(409).json({error:'You already have an active application for this vacancy.'});
        const now=new Date().toISOString();
        const app:Application={id:`APP-${Date.now()}-${Math.floor(1000+Math.random()*9000)}`,userId:session.userId,vacancyId,applicantData:JSON.stringify(req.body?.applicantData||{}),status:'SUBMITTED',createdAt:now,updatedAt:now};
        await appendSheetRow(SHEET,mapApplicationToRow(app));
        await recordSafeAuditLog({actorUserId:session.userId,action:'APPLICATION_CREATE',targetEntity:'APPLICATION',targetEntityId:app.id,details:`Application submitted for ${vacancy.title}`});
        await sendSafeTelegramAlert(`<b>📝 New application</b>\n<b>ID:</b> <code>${app.id}</code>\n<b>Vacancy:</b> ${escapeTelegramHtml(vacancy.title)}`);
        return res.status(201).json({application:app});
      }
      if(action==='update'){
        if(!isStaff(session))return res.status(403).json({error:'Only staff can update applications.'});
        const id=String(req.body?.applicationId||'').trim(); const status=String(req.body?.status||'').trim().toUpperCase() as ApplicationStatus;
        if(!id||!allowed.includes(status))return res.status(400).json({error:'applicationId and valid status are required.'});
        const row=await findSheetRowById(SHEET,id); if(!row)return res.status(404).json({error:'Application not found.'});
        const existing=mapRowToApplication(row); const updated={...existing,status,assignedManagerId:req.body?.assignedManagerId!==undefined?String(req.body.assignedManagerId||'').trim():existing.assignedManagerId,updatedAt:new Date().toISOString()};
        await updateSheetRowById(SHEET,id,mapApplicationToRow(updated));
        await recordSafeAuditLog({actorUserId:session.userId,action:'APPLICATION_UPDATE',targetEntity:'APPLICATION',targetEntityId:id,details:`Status ${status}`});
        return res.status(200).json({application:updated});
      }
    }
    return res.status(405).json({error:'Method not allowed.'});
  }catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}
}
