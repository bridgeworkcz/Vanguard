import type {ProcessingOption,VisaProduct,Vacancy} from '../types';
export const processingLabels:Record<ProcessingOption,string>={STANDARD:'Standard',PRIORITY:'Priority',EXPRESS:'Express'};
const raw:[string,string,string,number,number,number,ProcessingOption[]][]=[
['Slovakia','Work permit','2 years',1125,2,8,['STANDARD','PRIORITY','EXPRESS']],
['Czech Republic','Work permit','2 years',1200,2,8,['STANDARD','PRIORITY','EXPRESS']],
['Czech Republic','Work permit','9 months',900,2,8,['STANDARD','PRIORITY']],
['Germany','Work permit','1 year',1800,2,8,['STANDARD','PRIORITY']],
['Portugal','Work permit','1 year',1650,2,8,['STANDARD','PRIORITY']],
['Bulgaria','Work permit','1 year',1500,2,8,['STANDARD','PRIORITY']],
['Italy','NULLA OSTA / work permit','1 year',2250,2,8,['STANDARD','PRIORITY']],
['Norway','Work permit','1 year',1650,2,8,['STANDARD','PRIORITY']],
['Serbia','Work permit','1 year',1200,1,3,['STANDARD','PRIORITY','EXPRESS']],
['Canada','Work permit','2 years',3150,3,8,['STANDARD','PRIORITY']],
['Hungary','Work permit','2 years',1950,2,8,['STANDARD','PRIORITY']],
['Poland','Work permit','2 years',1050,2,8,['STANDARD','PRIORITY','EXPRESS']],
['New Zealand','Work permit','2 years',3200,2,8,['STANDARD','PRIORITY']],
['Belarus','Work permit','2 years',1300,2,5,['STANDARD','PRIORITY']]];
export const visaProducts:VisaProduct[]=raw.map((x,i)=>({id:`VP-${String(i+1).padStart(3,'0')}`,country:x[0],name:x[1],duration:x[2],description:'Configured service catalogue item. Final eligibility and government processing remain subject to the applicable authority.',basePrice:Math.round(x[3]*1.25),currency:'EUR',productionMinWeeks:x[4],productionMaxWeeks:x[5],allowedProcessing:x[6],active:true}));
export const countries=Array.from(new Set(visaProducts.map(v=>v.country)));
export const citizenships=['Ukraine','Georgia','Moldova','Armenia','Azerbaijan','Kazakhstan','Uzbekistan','Kyrgyzstan','Tajikistan','India','Pakistan','Bangladesh','Nepal','Philippines','Türkiye','Egypt','Morocco','Other'];
export function priceFor(v:VisaProduct,p:ProcessingOption){return Math.round(v.basePrice*(p==='EXPRESS'?1.2:p==='PRIORITY'?1.1:1));}
export function seedVacancies():Vacancy[]{const roles=['Production operator','Warehouse operative','Machine operator','Logistics worker','Assembler','Quality control operator','Packaging specialist','Maintenance assistant'];return visaProducts.flatMap(v=>roles.map((role,i)=>({id:`SEED-${v.id}-${i+1}`,title:`${role} — ${v.country}`,category:role,country:v.country,salaryNet:'To be confirmed by employer',salaryGross:'To be confirmed by employer',accommodation:'According to employer offer',workingHours:'According to employment contract',description:`Illustrative vacancy catalogue entry for ${v.country}. Employer identity and final terms must be confirmed before publication.`,quotaRemaining:5+(i%5),isActive:true,visaProductId:v.id,visaDuration:v.duration,processingOptions:v.allowedProcessing,employerLabel:`Employer profile ${v.country.replace(/\s/g,'-')}-${String(i+1).padStart(2,'0')}`,requirements:'Passport, clean document set and job-specific requirements after screening'})));}
