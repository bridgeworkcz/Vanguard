import crypto from 'crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import type { Vacancy } from '../src/types.js';
import { mapRowToVacancy,mapVacancyToRow } from '../server/utils/mappers.js';
import { readSheetRows,findSheetRowById,appendSheetRow,updateSheetRowById } from '../server/utils/sheets.js';
import { authenticateRequest,isStaff } from '../server/utils/permissions.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';
import { seedVacancies } from '../src/config/catalog.js';

const SHEET='Vacancies';
const clean=(v:unknown)=>String(v??'').trim();
function auth(req:VercelRequest,res:VercelResponse){const a=authenticateRequest(req.headers.authorization);if(!a.authorized||!a.session){res.status(a.statusCode).json({error:a.errorMessage});return null;}return a.session;}

export default async function handler(req:VercelRequest,res:VercelResponse){try{
  if(req.method==='GET'){
    const rows=(await readSheetRows(SHEET)).map(mapRowToVacancy); const s=authenticateRequest(req.headers.authorization);
    if(s.authorized&&s.session&&isStaff(s.session))return res.status(200).json({vacancies:rows});
    return res.status(200).json({vacancies:rows.filter(v=>v.isActive&&v.quotaRemaining>0)});
  }
  const session=auth(req,res); if(!session)return;
  if(!isStaff(session))return res.status(403).json({error:'Only staff can manage vacancies.'});
  const action=clean(req.query.action||req.body?.action).toLowerCase();
  if(req.method==='POST'&&action==='seedcatalog'){
    const existing=await readSheetRows(SHEET);let created=0;for(const v of seedVacancies()){if(!existing.some(r=>r.id===v.id)){await appendSheetRow(SHEET,mapVacancyToRow(v));created++}}await recordSafeAuditLog({actorUserId:session.userId,action:'VACANCY_CATALOG_SEED',targetEntity:'VACANCY',targetEntityId:'CATALOG',details:`Created ${created} catalogue vacancies`});return res.status(200).json({created});
  }
  if(req.method==='POST'&&(action===''||action==='create')){
    const b=req.body||{}; const title=clean(b.title),category=clean(b.category),country=clean(b.country); if(!title||!category||!country)return res.status(400).json({error:'Title, category and country are required.'});
const vacancy:Vacancy={id:`VAC-${new Date().getUTCFullYear()}-${crypto.randomInt(100000,1000000)}`,title,category,country,salaryNet:clean(b.salaryNet),salaryGross:clean(b.salaryGross),accommodation:clean(b.accommodation),workingHours:clean(b.workingHours),description:clean(b.description),quotaRemaining:Math.max(0,Number(b.quotaRemaining)||0),isActive:b.isActive===undefined?true:Boolean(b.isActive)};
    await appendSheetRow(SHEET,mapVacancyToRow(vacancy)); await recordSafeAuditLog({actorUserId:session.userId,action:'VACANCY_CREATE',targetEntity:'VACANCY',targetEntityId:vacancy.id,details:`${vacancy.title} / ${vacancy.country}`}); return res.status(201).json({vacancy});
  }
  if(req.method==='PATCH'&&action==='update'){
    const id=clean(req.body?.vacancyId); const row=await findSheetRowById(SHEET,id); if(!row)return res.status(404).json({error:'Vacancy not found.'}); const old=mapRowToVacancy(row); const b=req.body||{};
    const updated:Vacancy={...old,title:b.title!==undefined?clean(b.title):old.title,category:b.category!==undefined?clean(b.category):old.category,country:b.country!==undefined?clean(b.country):old.country,salaryNet:b.salaryNet!==undefined?clean(b.salaryNet):old.salaryNet,salaryGross:b.salaryGross!==undefined?clean(b.salaryGross):old.salaryGross,accommodation:b.accommodation!==undefined?clean(b.accommodation):old.accommodation,workingHours:b.workingHours!==undefined?clean(b.workingHours):old.workingHours,description:b.description!==undefined?clean(b.description):old.description,quotaRemaining:b.quotaRemaining!==undefined?Math.max(0,Number(b.quotaRemaining)||0):old.quotaRemaining,isActive:b.isActive!==undefined?Boolean(b.isActive):old.isActive};
    await updateSheetRowById(SHEET,id,mapVacancyToRow(updated)); await recordSafeAuditLog({actorUserId:session.userId,action:'VACANCY_UPDATE',targetEntity:'VACANCY',targetEntityId:id,details:`Updated ${updated.title}`}); return res.status(200).json({vacancy:updated});
  }
  if(req.method==='DELETE'){
    // Google Sheets Values API has no safe row-delete primitive here; archive by deactivating.
    const id=clean(req.query.id||req.body?.vacancyId); const row=await findSheetRowById(SHEET,id); if(!row)return res.status(404).json({error:'Vacancy not found.'}); const old=mapRowToVacancy(row); const updated={...old,isActive:false,quotaRemaining:0}; await updateSheetRowById(SHEET,id,mapVacancyToRow(updated)); await recordSafeAuditLog({actorUserId:session.userId,action:'VACANCY_ARCHIVE',targetEntity:'VACANCY',targetEntityId:id,details:`Archived ${old.title}`}); return res.status(200).json({vacancy:updated});
  }
  return res.status(405).json({error:'Method not allowed.'});
}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
