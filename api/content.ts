import type { VercelRequest,VercelResponse } from '@vercel/node';
import { readSheetRows } from '../server/utils/sheets.js';
import { mapRowToSetting,mapRowToGallery } from '../server/utils/mappers.js';
export default async function handler(_req:VercelRequest,res:VercelResponse){try{const settings=(await readSheetRows('SystemSettings')).map(mapRowToSetting);const gallery=(await readSheetRows('Gallery')).map(mapRowToGallery).filter(x=>x.isActive).sort((a,b)=>a.order-b.order);return res.status(200).json({settings:Object.fromEntries(settings.map(x=>[x.key,x.value])),gallery});}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
