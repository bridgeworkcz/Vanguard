import type { ProcessingOption, VisaProduct, Vacancy } from '../types';

export const processingLabels: Record<ProcessingOption, string> = {
  STANDARD: 'Standard',
  PRIORITY: 'Priority',
  EXPRESS: 'Express'
};

// [Країна, Назва, Термін, Базова ціна (+20-35%), Min тижнів, Max тижнів, Дозволена швидкість]
const raw: [string, string, string, number, number, number, ProcessingOption[]][] = [
  ['Slovakia', 'Work permit', '2 years', 1400, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Czech Republic', 'Work permit', '2 years', 1500, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Czech Republic', 'Work permit', '9 months', 1150, 2, 8, ['STANDARD']],
  ['Germany', 'Work permit', '1 year', 2250, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Portugal', 'Work permit', '1 year', 2100, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Bulgaria', 'Work permit', '1 year', 1900, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Italy', 'NULLA OSTA / work permit', '1 year', 2850, 2, 8, ['STANDARD']],
  ['Norway', 'Work permit', '1 year', 2100, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Serbia', 'Work permit', '1 year', 1500, 1, 3, ['STANDARD', 'PRIORITY', 'EXPRESS']],
  ['Canada', 'Work permit', '2 years', 3950, 3, 8, ['STANDARD', 'PRIORITY']],
  ['Hungary', 'Work permit', '2 years', 2450, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Poland', 'Work permit', '2 years', 1350, 2, 8, ['STANDARD', 'PRIORITY']],
  ['New Zealand', 'Work permit', '2 years', 4000, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Belarus', 'Work permit', '2 years', 1650, 2, 5, ['STANDARD', 'PRIORITY']]
];

export const visaProducts: VisaProduct[] = raw.map((x, i) => ({
  id: `VP-${String(i + 1).padStart(3, '0')}`,
  country: x[0],
  name: x[1],
  duration: x[2],
  description: 'Configured verified service catalogue entry. Legal representation and processing managed in accordance with local employment authority regulations.',
  basePrice: x[3],
  currency: 'EUR',
  productionMinWeeks: x[4],
  productionMaxWeeks: x[5],
  allowedProcessing: x[6],
  active: true
}));

export const countries = Array.from(new Set(visaProducts.map(v => v.country)));

export const citizenships = [
  'Ukraine', 'Georgia', 'Moldova', 'Armenia', 'Azerbaijan',
  'Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan',
  'India', 'Pakistan', 'Bangladesh', 'Nepal', 'Philippines',
  'Türkiye', 'Egypt', 'Morocco', 'Other'
];

export function priceFor(v: VisaProduct, p: ProcessingOption) {
  return Math.round(v.basePrice * (p === 'EXPRESS' ? 1.2 : p === 'PRIORITY' ? 1.1 : 1));
}

export function seedVacancies(): Vacancy[] {
  const roles = [
    'Production operator', 'Warehouse operative', 'Machine operator',
    'Logistics worker', 'Assembler', 'Quality control operator',
    'Packaging specialist', 'Maintenance assistant'
  ];
  return visaProducts.flatMap(v =>
    roles.map((role, i) => ({
      id: `SEED-${v.id}-${i + 1}`,
      title: `${role} — ${v.country}`,
      category: role,
      country: v.country,
      salaryNet: 'To be confirmed by employer offer',
      salaryGross: 'To be confirmed by employer offer',
      accommodation: 'Provided or subsidized by employer',
      workingHours: 'According to employment agreement (40h/week)',
      description: `Official verified vacancy profile for ${v.country}. Direct placement with licensed local industrial or logistical partner.`,
      quotaRemaining: 5 + (i % 5),
      isActive: true,
      visaProductId: v.id,
      visaDuration: v.duration,
      processingOptions: v.allowedProcessing,
      employerLabel: `Verified Employer ${v.country.replace(/\s/g, '-')}-${String(i + 1).padStart(2, '0')}`,
      requirements: 'Valid passport, police clearance certificate, clean medical set and standard eligibility check.'
    }))
  );
}
