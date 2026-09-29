import type { VercelRequest,VercelResponse } from '@vercel/node';
import type { PaymentTransaction,Dossier,DossierPaymentStatus } from '../src/types.js';
import { mapRowToPayment,mapPaymentToRow,mapRowToDossier,mapDossierToRow } from '../server/utils/mappers.js';
import { readSheetRows,findSheetRowById,appendSheetRow,updateSheetRowById } from '../server/utils/sheets.js';
import { authenticateRequest,validateOwnership,isStaff } from '../server/utils/permissions.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';
import { sendSafeTelegramAlert } from '../server/utils/telegram.js';

const P='PaymentTransactions',D='Dossiers'; const tranches=[20,50,30] as const;
function auth(req:VercelRequest,res:VercelResponse){const a=authenticateRequest(req.headers.authorization);if(!a.authorized||!a.session){res.status(a.statusCode).json({error:a.errorMessage});return null;}return a.session;}
function recalcStatus(d:Dossier,confirmed:PaymentTransaction[]):DossierPaymentStatus{const paid=Math.round(confirmed.filter(p=>p.dossierId===d.id).reduce((s,p)=>s+p.amount,0)*100)/100;if(paid<=0)return 'NOT_DUE';if(paid+0.01>=d.totalCost)return 'PAID';return 'PARTIALLY_PAID';}
export default async function handler(req:VercelRequest,res:VercelResponse){try{
 const session=auth(req,res);if(!session)return; const action=String(req.query.action||req.body?.action||'').trim().toLowerCase();
 if(req.method==='GET'){
   const rows=(await readSheetRows(P)).map(mapRowToPayment);const dossierId=String(req.query.dossierId||'').trim();if(dossierId){const drow=await findSheetRowById(D,dossierId);if(!drow)return res.status(404).json({error:'Dossier not found.'});const d=mapRowToDossier(drow);const own=validateOwnership(session,d.userId);if(!own.authorized)return res.status(own.statusCode).json({error:own.errorMessage});return res.status(200).json({payments:rows.filter(x=>x.dossierId===dossierId)});}if(!isStaff(session))return res.status(403).json({error:'dossierId is required.'});return res.status(200).json({payments:rows});
 }
 if(req.method==='POST'&&(!action||action==='submit')){
   const dossierId=String(req.body?.dossierId||'').trim(),amount=Number(req.body?.amount),currency=String(req.body?.currency||'').trim().toUpperCase(),network=String(req.body?.network||'').trim().toUpperCase(),txHash=String(req.body?.txHash||'').trim(),tranche=Number(req.body?.tranchePercent);
   if(!dossierId||!Number.isFinite(amount)||amount<=0||!txHash||!tranches.includes(tranche as any))return res.status(400).json({error:'Valid dossier, amount, txHash and tranche are required.'});
   const drow=await findSheetRowById(D,dossierId);if(!drow)return res.status(404).json({error:'Dossier not found.'});const d=mapRowToDossier(drow);const own=validateOwnership(session,d.userId);if(!own.authorized)return res.status(own.statusCode).json({error:own.errorMessage});if(currency!==d.currency)return res.status(400).json({error:`Currency must be ${d.currency}.`});
   const all=(await readSheetRows(P)).map(mapRowToPayment);if(all.some(x=>x.txHash.toLowerCase()===txHash.toLowerCase()))return res.status(409).json({error:'This transaction hash is already submitted.'});
   const confirmed=all.filter(x=>x.dossierId===dossierId&&x.status==='CONFIRMED');const confirmedPct=confirmed.reduce((s,x)=>s+x.tranchePercent,0);if(confirmedPct+tranche>100)return res.status(409).json({error:'This tranche exceeds the remaining payment schedule.'});
   const expected=Math.round(d.totalCost*(tranche/100)*100)/100;if(Math.abs(amount-expected)>0.01)return res.status(400).json({error:`Expected ${expected.toFixed(2)} ${d.currency} for ${tranche}%.`});
   const payment:PaymentTransaction={id:`PAY-${Date.now()}-${Math.floor(1000+Math.random()*9000)}`,dossierId,userId:session.userId,amount,currency,network,txHash,tranchePercent:tranche as 20|50|30,status:'PENDING_REVIEW',submittedAt:new Date().toISOString()};await appendSheetRow(P,mapPaymentToRow(payment));await recordSafeAuditLog({actorUserId:session.userId,action:'PAYMENT_SUBMIT',targetEntity:'PAYMENT',targetEntityId:payment.id,details:`${amount} ${currency} / ${tranche}%`});await sendSafeTelegramAlert(`<b>💳 Payment submitted</b>\n<b>Dossier:</b> <code>${dossierId}</code>\n<b>Amount:</b> ${amount} ${currency}`);return res.status(201).json({payment});
 }
 if(req.method==='POST'&&action==='review'){
   if(!isStaff(session))return res.status(403).json({error:'Only staff can review payments.'});const id=String(req.body?.paymentId||'').trim(),status=String(req.body?.status||'').trim().toUpperCase();if(!id||!['CONFIRMED','REJECTED','REFUNDED'].includes(status))return res.status(400).json({error:'Valid paymentId and review status are required.'});const row=await findSheetRowById(P,id);if(!row)return res.status(404).json({error:'Payment not found.'});const payment=mapRowToPayment(row);const updated:PaymentTransaction={...payment,status:status as PaymentTransaction['status'],verifiedAt:new Date().toISOString(),verifiedBy:session.userId};await updateSheetRowById(P,id,mapPaymentToRow(updated));
   const drow=await findSheetRowById(D,payment.dossierId);if(drow){const d=mapRowToDossier(drow);const payments=(await readSheetRows(P)).map(mapRowToPayment).map(x=>x.id===id?updated:x);const confirmed=payments.filter(x=>x.status==='CONFIRMED');const paid=Math.round(confirmed.filter(x=>x.dossierId===d.id).reduce((s,x)=>s+x.amount,0)*100)/100;const updatedD:Dossier={...d,paidAmount:paid,remainingAmount:Math.max(0,Math.round((d.totalCost-paid)*100)/100),paymentStatus:recalcStatus(d,confirmed),updatedAt:new Date().toISOString()};await updateSheetRowById(D,d.id,mapDossierToRow(updatedD));}
   await recordSafeAuditLog({actorUserId:session.userId,action:'PAYMENT_REVIEW',targetEntity:'PAYMENT',targetEntityId:id,details:`status=${status}`});return res.status(200).json({payment:updated});
 }
 return res.status(405).json({error:'Method not allowed.'});
}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
