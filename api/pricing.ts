import type { VercelRequest,VercelResponse } from '@vercel/node';
import { readSheetRows } from '../server/utils/sheets.js';
import { mapRowToPricing } from '../server/utils/mappers.js';
export default async function handler(_req:VercelRequest,res:VercelResponse){try{return res.status(200).json({items:(await readSheetRows('Pricing')).map(mapRowToPricing).filter(x=>x.active)});}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Internal Server Error'});}}
