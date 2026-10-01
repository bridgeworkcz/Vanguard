import type { ProcessingOption, VisaProduct, Vacancy } from '../types';

export const processingLabels: Record<ProcessingOption, string> = {
  STANDARD: 'Standard',
  PRIORITY: 'Priority',
  EXPRESS: 'Express'
};

const raw: [string, string, string, number, number, number, ProcessingOption[]][] = [
  ['Slovakia', 'Work permit', '2 years', 1460, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Czech Republic', 'Work permit', '2 years', 1560, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Czech Republic', 'Work permit', '9 months', 1170, 2, 8, ['STANDARD']],
  ['Germany', 'Work permit', '1 year', 2340, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Portugal', 'Work permit', '1 year', 2145, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Bulgaria', 'Work permit', '1 year', 1950, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Italy', 'NULLA OSTA / work permit', '1 year', 2925, 2, 8, ['STANDARD']],
  ['Norway', 'Work permit', '1 year', 2145, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Serbia', 'Work permit', '1 year', 1560, 1, 3, ['STANDARD', 'PRIORITY', 'EXPRESS']],
  ['Canada', 'Work permit', '2 years', 4095, 3, 8, ['STANDARD', 'PRIORITY']],
  ['Hungary', 'Work permit', '2 years', 2535, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Poland', 'Work permit', '2 years', 1365, 2, 8, ['STANDARD', 'PRIORITY']],
  ['New Zealand', 'Work permit', '2 years', 4160, 2, 8, ['STANDARD', 'PRIORITY']],
  ['Belarus', 'Work permit', '2 years', 1690, 2, 5, ['STANDARD', 'PRIORITY']]
];

export const visaProducts: VisaProduct[] = raw.map((x, i) => ({
  id: `VP-${String(i + 1).padStart(3, '0')}`,
  country: x[0],
  name: x[1],
  duration: x[2],
  description: 'Fixed service catalogue. Legal preparation, employer coordination and filing support for the selected permit.',
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

export function productsFor(country: string) {
  return visaProducts.filter(v => v.country === country && v.active);
}

export function priceFor(v: VisaProduct, p: ProcessingOption) {
  const factor = p === 'EXPRESS' ? 1.2 : p === 'PRIORITY' ? 1.1 : 1;
  return Math.round(v.basePrice * factor);
}

const roles = [
  ['Production operator', 'Line assembly, visual checks, shift handover.'],
  ['Warehouse operative', 'Picking, packing and inbound scanning.'],
  ['Machine operator', 'Set-up support on supervised industrial equipment.'],
  ['Logistics worker', 'Dock loading and route preparation.'],
  ['Assembler', 'Component assembly to a written work instruction.'],
  ['Quality inspector', 'In-process checks and defect logging.'],
  ['Packaging specialist', 'Final pack, label and pallet build.'],
  ['Maintenance assistant', 'Basic upkeep under a site technician.'],
  ['Food process worker', 'Hygiene-controlled preparation or packing.'],
  ['CNC helper', 'Material feed and finished-part handling.'],
  ['Forklift support', 'Ground support beside licensed drivers.'],
  ['Cleanroom assistant', 'Gowning discipline and tray handling.']
];

const employers: Record<string, string[]> = {
  Slovakia: ['Volkswagen Slovakia', 'Kia Slovakia', 'Amazon Sereď', 'PCA Slovakia', 'Schaeffler Kysuce', 'Continental Púchov', 'Železiarne Podbrezová', 'U. S. Steel Košice', 'Minebea AccessSolutions', 'ZF Slovakia'],
  'Czech Republic': ['Škoda Auto', 'Foxconn CZ', 'Rohlík Group', 'Hyundai Nošovice', 'Bosch České Budějovice', 'Continental Brandýs', 'Honeywell Brno', 'Miele Uničov', 'Panasonic Pilsen', 'AGC Flat Glass', 'Doosan Škoda Power', 'Linet Želevčice'],
  Germany: ['Siemens', 'DHL Supply Chain', 'Robert Bosch', 'BMW Group', 'Mercedes-Benz', 'Continental', 'ZF Friedrichshafen', 'DB Schenker', 'Thyssenkrupp', 'BASF'],
  Portugal: ['Volkswagen Autoeuropa', 'Continental Mabor', 'Jerónimo Martins', 'Bosch Braga', 'Embraer Portugal', 'Navigator Company', 'Sonae MC', 'Aptiv Braga', 'Ikea Industry', 'Luis Simoes'],
  Bulgaria: ['Sensata Plovdiv', 'Yazaki Yambol', 'Gebrüder Weiss', 'Liebherr Radinovo', 'Melexis Sofia', 'Festo Sofia', 'Aurubis Pirdop', 'Witte Automotive', 'Teklas Bulgaria', 'Schneider Electric'],
  Italy: ['Barilla', 'Stellantis Italia', 'BCube Logistics', 'Lavazza', 'Ferrero', 'CNH Industrial', 'Ducati', 'Campari Group', 'Brembo', 'IMA Group'],
  Norway: ['SalMar', 'Lerøy Seafood', 'Posten Bring', 'Mowi', 'Equinor suppliers', 'Aker Solutions', 'Orkla Foods', 'Nortura', 'Hydro Aluminium', 'Tine SA'],
  Serbia: ['Linglong Tire', 'Leoni Niš', 'Aptiv Novi Sad', 'ZF Serbia', 'Grundfos Inđija', 'Continental Serbia', 'Yazaki Kruševac', 'Magna Seating', 'Henkel Kruševac', 'Bosch Pećinci'],
  Canada: ['Magna International', 'Maple Leaf Foods', 'Amazon Canada', 'Linamar', 'Saputo', 'Martinrea', 'Loblaw supply', 'Cargill Canada', 'Bombardier', 'Sofina Foods'],
  Hungary: ['Audi Hungaria', 'Samsung SDI', 'Continental Hungary', 'Mercedes Kecskemét', 'Bosch Hatvan', 'Suzuki Esztergom', 'SK On Iváncsa', 'Flextronics', 'Nestlé Szerencs', 'Penny Market DC'],
  Poland: ['Amazon Polska', 'LG Energy Solution', 'Biedronka DC', 'Volkswagen Poznań', 'Stellantis Gliwice', 'Whirlpool Łódź', 'Jysk logistics', 'Beiersdorf Poznań', 'Toyota Wałbrzych', 'Solaris Bus'],
  'New Zealand': ['Silver Fern Farms', 'T&G Global', 'Fonterra', 'Alliance Group', 'ANZCO Foods', 'Zespri packhouse', 'Mainfreight NZ', 'Scales Logistics', 'Affco', 'Open Country Dairy'],
  Belarus: ['BelAZ', 'Santa Bremor', 'MAZ', 'Amkodor', 'Savushkin Product', 'MTZ', 'Horizont', 'Atlant', 'Belaruskali support', 'Conte Spa']
};

export function seedVacancies(): Vacancy[] {
  return visaProducts.flatMap(v => {
    const pool = employers[v.country] || [];
    const offset = v.duration.includes('9') ? 6 : 0;
    return roles.slice(0, 10).map((role, i) => {
      const employer = pool[(i + offset) % pool.length] || `Employer ${v.country} ${i + 1}`;
      const net = 850 + ((i * 37 + v.basePrice) % 420);
      return {
        id: `SEED-${v.id}-${i + 1}`,
        title: role[0],
        category: role[0],
        country: v.country,
        salaryNet: `${net}–${net + 180} EUR net / month`,
        salaryGross: 'Stated in the employer offer',
        accommodation: i % 3 === 0 ? 'Employer hostel, shared room' : i % 3 === 1 ? 'Allowance toward private housing' : 'Dormitory for the first 90 days',
        workingHours: i % 2 === 0 ? '40 h/week, morning or afternoon shift' : '38–42 h/week, rotating shift',
        description: `${role[1]} Site: ${employer}. Permit: ${v.name}, ${v.duration}.`,
        quotaRemaining: 4 + (i % 6),
        isActive: true,
        visaProductId: v.id,
        visaDuration: v.duration,
        processingOptions: v.allowedProcessing,
        employerLabel: employer,
        requirements: 'Passport valid 12+ months, police clearance, medical set, and a completed Vanguard questionnaire.',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      };
    });
  });
}
