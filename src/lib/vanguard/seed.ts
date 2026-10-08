import type { Processing, VisaProduct, Vacancy } from "./domain";

type Raw = [string, string, string, number, number, number, Processing[]];

const RAW: Raw[] = [
  ["Slovakia", "Work permit", "2 years", 1350, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Czech Republic", "Work permit", "2 years", 1440, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Czech Republic", "Work permit", "9 months", 1080, 2, 8, ["STANDARD"]],
  ["Germany", "Work permit", "1 year", 2160, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Portugal", "Work permit", "1 year", 1980, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Bulgaria", "Work permit", "1 year", 1800, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Italy", "NULLA OSTA / work permit", "1 year", 2700, 2, 8, ["STANDARD"]],
  ["Norway", "Work permit", "1 year", 1980, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Serbia", "Work permit", "1 year", 1440, 1, 3, ["STANDARD", "PRIORITY", "EXPRESS"]],
  ["Canada", "Work permit", "2 years", 3780, 3, 8, ["STANDARD", "PRIORITY"]],
  ["Hungary", "Work permit", "2 years", 2340, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Poland", "Work permit", "2 years", 1260, 2, 8, ["STANDARD", "PRIORITY"]],
  ["New Zealand", "Work permit", "2 years", 3840, 2, 8, ["STANDARD", "PRIORITY"]],
  ["Belarus", "Work permit", "2 years", 1560, 2, 5, ["STANDARD", "PRIORITY"]],
];

export const VISA_PRODUCTS: VisaProduct[] = RAW.map((x, i) => ({
  id: `VP-${String(i + 1).padStart(3, "0")}`,
  country: x[0],
  name: x[1],
  duration: x[2],
  description:
    "Preparation of the permit file, employer coordination, and filing support for the term selected.",
  basePrice: x[3],
  currency: "EUR",
  productionMinWeeks: x[4],
  productionMaxWeeks: x[5],
  allowedProcessing: x[6],
  active: true,
}));

const ROLES: [string, string][] = [
  ["Production operator", "Line assembly, visual checks, and a written handover at the end of the shift."],
  ["Warehouse operative", "Picking, packing, and inbound scanning in a paced distribution hall."],
  ["Machine operator", "Supervised set-up and running of a single industrial station."],
  ["Logistics worker", "Dock loading, route preparation, and pallet control."],
  ["Assembler", "Component assembly against a posted work instruction."],
  ["Quality inspector", "In-process checks and a defect log the shift lead signs."],
  ["Packaging specialist", "Final pack, label, and pallet build for outbound freight."],
  ["Maintenance assistant", "Basic upkeep beside a site technician. No unsupervised electrical work."],
  ["Food process worker", "Hygiene-controlled preparation or packing. Hairnet and steel-toe shoes required."],
  ["CNC helper", "Material feed, finished-part handling, and coolant checks."],
  ["Forklift support", "Ground support beside licensed drivers. A licence is not required to start."],
  ["Cleanroom assistant", "Gowning discipline and tray handling in a controlled room."],
  ["Welder's mate", "Prep, clamp, and grind under a coded welder."],
  ["Cold-store picker", "Order picking in a chilled hall. Warm layers are issued on site."],
  ["Paint-line helper", "Masking, hanging, and unload on a coated-parts line."],
  ["Night-shift packer", "Quiet-hours packing for morning dispatch."],
];

const HOUSING = [
  "Employer hostel, shared room, for the first contract year",
  "No housing included. The worker finds a room.",
  "Dormitory for the first 90 days, then a private lease",
  "Company apartment, two workers to a room, utilities included",
  "No housing included. The worker finds a room.",
];

const HOURS = [
  "40 hours a week, morning or afternoon shift",
  "38–42 hours a week, rotating shift",
  "40 hours a week, Monday to Friday",
  "12-hour shifts, three days on and three days off",
  "Night shift, four nights on and four nights off",
];

const EMPLOYERS: Record<string, string[]> = {
  Slovakia: [
    "Volkswagen Slovakia, Bratislava",
    "Kia Slovakia, Žilina",
    "U. S. Steel Košice",
    "Železiarne Podbrezová",
    "Mliekáreň Senica",
    "Hydináreň Topoľčany",
    "Píla Liptovský Mikuláš",
    "Mäsovýroba Levice",
    "Pekáreň Trnava",
    "Sklad Senec",
    "Textil Humenné",
    "Stavmont Žilina",
  ],
  "Czech Republic": [
    "Škoda Auto, Mladá Boleslav",
    "Hyundai Nošovice",
    "Mlékarna Polička",
    "Drůbežárna Klatovy",
    "Sklárna Nový Bor",
    "Pila Písek",
    "Masokombinát Kostelec",
    "Papírna Štětí",
    "Kovovýroba Uherský Brod",
    "Mrazírna Jihlava",
    "Sady Mělník",
    "Pekárna Olomouc",
    "Strojírna Třebíč",
    "Sklad Modletice",
    "Prádelna Karlovy Vary",
    "Drůbež Vodňany",
  ],
  Germany: [
    "Volkswagen Wolfsburg",
    "Robert Bosch Bamberg",
    "Geflügelwerk Vechta",
    "Fleischwerk Cloppenburg",
    "Spargelhof Beelitz",
    "Molkerei Kempten",
    "Sägewerk Freyung",
    "Zuckerfabrik Uelzen",
    "Möbelwerk Löhne",
    "Metallbau Siegen",
    "Gießerei Solingen",
    "Konserven Spreewald",
    "Kartoffelwerk Burgdorf",
    "Kühlhaus Bremerhaven",
    "Hafenlogistik Duisburg",
    "Textil Hof",
    "Lager Bönen",
    "Backwerk Großostheim",
  ],
  Portugal: [
    "Volkswagen Autoeuropa, Palmela",
    "Corticeira Amorim, Santa Maria da Feira",
    "Conserveiras Matosinhos",
    "Lacticínios Oliveira do Hospital",
    "Serraria Viseu",
    "Estufas Odemira",
    "Têxtil Covilhã",
    "Mármores Évora",
    "Padaria industrial Barcelos",
    "Fruta Montijo",
    "Armazém Azambuja",
  ],
  Bulgaria: [
    "Aurubis Pirdop",
    "Liebherr Radinovo",
    "Mandra Stara Zagora",
    "Pileferma Lovech",
    "Konserven Plovdiv",
    "Vinarna Melnik",
    "Garment plant Sevlievo",
    "Woodworks Troyan",
    "Cold store Ruse",
    "Warehouse Bozhurishte",
  ],
  Italy: [
    "Barilla Parma",
    "Ferrero Alba",
    "Salumificio Langhirano",
    "Conserve Nocera",
    "Caseificio Reggio Emilia",
    "Calzaturificio Montebelluna",
    "Tessitura Prato",
    "Segheria Belluno",
    "Agrumi Rosarno",
    "Cantina Montepulciano",
    "Mobili Pordenone",
    "Surgelati Cisterna",
    "Magazzino Piacenza",
    "Lavanderia Prato",
  ],
  Norway: [
    "SalMar Frøya",
    "Lerøy Bergen",
    "Slakteri Rogaland",
    "Meieriet Bryne",
    "Fiskemottak Måløy",
    "Trelast Hamar",
    "Bakeri Tromsø",
    "Lager Vestby",
  ],
  Serbia: [
    "Gorenje Valjevo",
    "Tigar Tyres Pirot",
    "Mlekara Subotica",
    "Klanica Čačak",
    "Šećerana Crvenka",
    "Tekstil Leskovac",
    "Drvna industrija Kraljevo",
    "Voćarstvo Grocka",
    "Hladnjača Smederevo",
    "Pekara Čačak",
    "Staklenici Leskovac",
    "Magacin Šimanovci",
  ],
  Canada: [
    "Maple Leaf Foods, Brandon",
    "Saputo, Saint-Léonard",
    "Greenhouse Leamington",
    "Poultry Abbotsford",
    "Meat plant Brooks",
    "Dairy plant Steinbach",
    "Sawmill Prince George",
    "Fish plant Lunenburg",
    "Berry pack Fraser Valley",
    "Bakery plant Winnipeg",
    "Furniture plant Kitchener",
    "Cold store Halifax",
    "Warehouse Mississauga",
  ],
  Hungary: [
    "Audi Hungaria, Győr",
    "Pick Szeged",
    "Baromfi Orosháza",
    "Húsüzem Gyula",
    "Tejüzem Székesfehérvár",
    "Paprikaüzem Kalocsa",
    "Konzerv Kecskemét",
    "Üvegház Szentes",
    "Cipőgyár Martfű",
    "Faipar Sopron",
    "Malom Szolnok",
    "Sütőüzem Debrecen",
    "Hűtőház Győr",
    "Raktár Gyál",
  ],
  Poland: [
    "Volkswagen Poznań",
    "Mlekovita Wysokie Mazowieckie",
    "Animex Morliny, Ostróda",
    "Mięso Łuków",
    "Drób Mława",
    "Cukrownia Werbkowice",
    "Mleczarnia Radomsko",
    "Szklarnia Kraśnik",
    "Owoce Grójec",
    "Tartak Hajnówka",
    "Meble Swarzędz",
    "Odlewnia Starachowice",
    "Odzież Łódź",
    "Piekarnia Grodzisk",
    "Chłodnia Łódź",
    "Rybactwo Kołobrzeg",
    "Przetwórnia Lublin",
    "Magazyn Błonie",
  ],
  "New Zealand": [
    "Silver Fern Farms, Balclutha",
    "Fonterra Edendale",
    "Kiwifruit pack Te Puke",
    "Dairy plant Hokitika",
    "Sawmill Rotorua",
    "Fishing Nelson",
    "Cold store Hastings",
    "Bakery Christchurch",
    "Warehouse Penrose",
  ],
  Belarus: [
    "Santa Bremor, Brest",
    "Savushkin Product, Brest",
    "Molochnaya Slonim",
    "Pticefabrika Baranovichi",
    "Myasokombinat Volkovysk",
    "Hlebozavod Gomel",
    "Teplitsa Brest",
    "Sklad Fanipol",
  ],
};

const PAY: Record<string, number> = {
  Slovakia: 980,
  "Czech Republic": 1150,
  Germany: 1900,
  Portugal: 1050,
  Bulgaria: 850,
  Italy: 1350,
  Norway: 2400,
  Serbia: 780,
  Canada: 2100,
  Hungary: 1200,
  Poland: 1100,
  "New Zealand": 2200,
  Belarus: 650,
};

export function buildVacancies(): Vacancy[] {
  const out: Vacancy[] = [];
  let n = 1;
  const countries = [...new Set(VISA_PRODUCTS.map((item) => item.country))];
  for (const country of countries) {
    const products = VISA_PRODUCTS.filter((item) => item.country === country);
    const pool = EMPLOYERS[country] ?? [];
    const take = Math.min(18, pool.length);
    for (let i = 0; i < take; i++) {
      const product = products.length === 1 ? products[0]! : products[i < Math.ceil(take * 0.62) ? 0 : 1]!;
      const role = ROLES[i % ROLES.length]!;
      const employer = pool[i] ?? `${country} employer ${i + 1}`;
      const net = (PAY[country] ?? 1000) + ((i * 37) % 240);
      out.push({
        id: `VAC-${String(n).padStart(4, "0")}`,
        title: role[0],
        country,
        visaProductId: product.id,
        employer,
        salaryNet: `${net}–${net + 140} EUR net / month`,
        accommodation: HOUSING[i % HOUSING.length]!,
        workingHours: HOURS[i % HOURS.length]!,
        description: `${role[1]} Employer: ${employer}. Permit term: ${product.duration}.`,
        requirements:
          i % 4 === 0
            ? "Passport, police clearance issued within 6 months, and a medical set."
            : "Passport, police clearance, a medical set, and the Vanguard questionnaire.",
        quota: 3 + (i % 6),
        active: true,
      });
      n += 1;
    }
  }
  return out;
}

export const OFFICE = [
  {
    id: "MED-FACADE",
    kind: "office",
    title: "Praha 1",
    caption: "The office, Staré Město.",
    image: "/media/office-facade.jpg",
    sort: 1,
  },
  {
    id: "MED-ROOM",
    kind: "office",
    title: "Counsel room",
    caption: "Where a file is walked through before it is filed.",
    image: "/media/office-room.jpg",
    sort: 2,
  },
  {
    id: "MED-DESK",
    kind: "office",
    title: "Case desk",
    caption: "Documents stay in the file. Nothing is discussed in a corridor.",
    image: "/media/office-desk.jpg",
    sort: 3,
  },
];

export const TEAM = [
  { id: "TM-1", name: "Klára Nováková", position: "Client director", phone: "+420 770 347 160", sort: 1 },
  { id: "TM-2", name: "Marek Svoboda", position: "Legal coordinator", phone: "+420 770 347 161", sort: 2 },
  { id: "TM-3", name: "Elena Horváth", position: "Case operations", phone: "+420 770 347 162", sort: 3 },
  { id: "TM-4", name: "Daniel Okonkwo", position: "Employer relations", phone: "+420 770 347 163", sort: 4 },
];

/** Smaller sites that hire the people this practice files for. Partners only — not extra vacancies. */
const SMALL_HIRERS: Record<string, string[]> = {
  Slovakia: ["Hydina Senec", "Mäso Topoľčany", "Farma Galanta", "Hotel Tatranská", "Sklad Malacky", "Upratovanie Bratislava", "Stavba Žilina", "Ovocie Dunajská Streda"],
  "Czech Republic": ["Drůbež Klatovy", "Maso Polička", "Farma Znojmo", "Hotel Karlín night", "Sklad Modletice", "Úklid Praha", "Stavmont Kladno", "Sad Mělník"],
  Germany: ["Geflügel Vechta", "Fleischwerk Cloppenburg", "Spargel Beelitz", "Hotel Frankfurt night", "Lager Bönen", "Gebäudereinigung Köln", "Rohbau Duisburg", "Gurken Spreewald"],
  Portugal: ["Aves Santarém", "Peixe Peniche", "Estufa Odemira", "Hotel Algarve rooms", "Armazém Azambuja", "Limpeza Lisboa", "Obra Setúbal", "Fruta Montijo"],
  Bulgaria: ["Pile Stara Zagora", "Meso Lovech", "Zelenchuk Plovdiv", "Hotel Sunny Beach", "Sklad Bozhurishte", "Pochistvane Sofia", "Stroy Burgas", "Ovoshtarstvo Petrich"],
  Italy: ["Pollame Forlì", "Salumi Langhirano", "Pomodoro Foggia", "Hotel Rimini rooms", "Magazzino Piacenza", "Pulizie Milano", "Cantiere Brescia", "Agrumi Rosarno"],
  Norway: ["Slakteri Rogaland", "Fisk Måløy", "Bær Lier", "Hotell Oslo night", "Lager Vestby", "Renhold Bergen", "Bygg Drammen", "Grønt Lier"],
  Serbia: ["Piletina Smederevo", "Meso Čačak", "Voće Subotica", "Hotel Novi Sad", "Magacin Šimanovci", "Čišćenje Beograd", "Gradnja Niš", "Staklenik Leskovac"],
  Canada: ["Poultry Abbotsford", "Meat Brooks", "Greenhouse Leamington", "Hotel Banff rooms", "Warehouse Mississauga", "Cleaning Brampton", "Framing Woodbridge", "Berry Fraser Valley"],
  Hungary: ["Baromfi Orosháza", "Hús Gyula", "Üvegház Szentes", "Hotel Hévíz", "Raktár Gyál", "Takarítás Budapest", "Építés Kecskemét", "Gyümölcs Szabolcs"],
  Poland: ["Drób Mława", "Mięso Łuków", "Szklarnia Kraśnik", "Hotel Kraków night", "Magazyn Błonie", "Sprzątanie Warszawa", "Budowa Wrocław", "Owoce Grójec"],
  "New Zealand": ["Poultry Waikato", "Meat Hastings", "Kiwifruit Te Puke", "Hotel Queenstown rooms", "Warehouse Penrose", "Cleaning Auckland", "Framing Christchurch", "Dairy Southland shed"],
  Belarus: ["Ptitsefabrika Baranovichi", "Myaso Slonim", "Teplitsa Brest", "Hotel Minsk night", "Sklad Fanipol", "Uborka Minsk", "Stroyka Gomel", "Sadov Grodno"],
};

export function partnerRows(): { id: string; country: string; name: string; sort: number }[] {
  const rows: { id: string; country: string; name: string; sort: number }[] = [];
  const seen = new Set<string>();
  for (const [country, names] of Object.entries(EMPLOYERS)) {
    const all = [...names, ...(SMALL_HIRERS[country] ?? [])];
    let sort = 1;
    for (const name of all) {
      const key = `${country}|${name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const slug = `${country}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 28);
      rows.push({ id: `PT-${slug}`, country, name, sort });
      sort += 1;
    }
  }
  return rows;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  legal_entity: "Vanguard Global Mobility s.r.o.",
  registration_number: "19842710",
  vat_number: "CZ19842710",
  legal_address: "Rybná 716/24, Staré Město, 110 00 Praha 1, Česká republika",
  court_record: "Městský soud v Praze, oddíl C, vložka 392810",
  regulator: "Živnostenský úřad Praha 1",
  support_email: "desk@vanguard-mobility.cz",
  support_phone: "+420 770 347 160",
  usdt_wallet: "",
  usdt_network: "TRC-20 (TRON)",
  telegram_owner_chat: "",
  telegram_staff_chat: "",
  subagent_rate: "10",
  hero_title_en: "The permit, prepared properly.",
  hero_title_cs: "Povolení, připravené pořádně.",
  hero_title_ur: "اجازت نامہ، درست طریقے سے تیار۔",
  hero_body_en:
    "Choose your citizenship, the country, the permit, and how fast the file should move. We show the fee and the openings that match. A ministry still decides. We make the case complete.",
  hero_body_cs:
    "Zvolte občanství, zemi, typ povolení a tempo přípravy spisu. Ukážeme honorář a volná místa, která sedí. Rozhoduje ministerstvo. My dodáme úplný spis.",
  hero_body_ur:
    "شہریت، ملک، اجازت نامے کی قسم اور فائل کی رفتار منتخب کریں۔ ہم فیس اور موزوں اسامیاں دکھائیں گے۔ فیصلہ وزارت کرتی ہے۔ ہم فائل مکمل بناتے ہیں۔",
  about_lead_en: "A Prague office for people who already know where they are going to work.",
  about_lead_cs: "Pražská kancelář pro lidi, kteří už vědí, kde budou pracovat.",
  about_lead_ur: "پراگ کا دفتر ان لوگوں کے لیے جو پہلے ہی جانتے ہیں کہ وہ کہاں کام کریں گے۔",
  about_story_en:
    "Vanguard Global Mobility s.r.o. files work permits for clients who have a concrete employer and a concrete country. The work is unglamorous on purpose: identity checked, police clearance in the file, the employer's papers aligned with the permit we actually sell, and a fee split into three parts so nobody is asked for the whole sum on day one.\n\nWe do not promise a visa. Slovakia, Czechia, Germany, Portugal, Bulgaria, Italy, Norway, Serbia, Canada, Hungary, Poland, New Zealand, and Belarus each have their own term and their own speed. Where a faster lane does not exist, we do not invent one.\n\nThe office is in Staré Město. The file is handled by a named person. When the ministry is slow, the case page says so.",
  about_story_cs:
    "Vanguard Global Mobility s.r.o. podává pracovní povolení klientům, kteří mají konkrétního zaměstnavatele a konkrétní zemi. Práce je záměrně střízlivá: ověřená totožnost, výpis z rejstříku trestů ve spise, podklady zaměstnavatele sladěné s povolením, které skutečně nabízíme, a honorář rozdělený na tři části, aby první den nikdo neplatil celou částku.\n\nVíza neslibujeme. Slovensko, Česko, Německo, Portugalsko, Bulharsko, Itálie, Norsko, Srbsko, Kanada, Maďarsko, Polsko, Nový Zéland a Bělorusko mají každý vlastní dobu a vlastní tempo. Kde rychlejší dráha není, nevymýšlíme ji.\n\nKancelář je na Starém Městě. Spis má jméno člověka, který ho vede. Když je ministerstvo pomalé, stránka případu to říká.",
  about_story_ur:
    "Vanguard Global Mobility s.r.o. ان گاہکوں کے ورک پرمٹ جمع کراتی ہے جن کے پاس واضح آجر اور واضح ملک ہو۔ کام جان بوجھ کر سادہ ہے: شناخت کی تصدیق، فائل میں عدمِ جرم کا سرٹیفکیٹ، آجر کے کاغذات اسی اجازت نامے سے ہم آہنگ جسے ہم بیچتے ہیں، اور فیس تین حصوں میں تاکہ پہلے دن پوری رقم نہ مانگی جائے۔\n\nہم ویزے کا وعدہ نہیں کرتے۔ سلوواکیہ، چیکیا، جرمنی، پرتگال، بلغاریہ، اٹلی، ناروے، سربیا، کینیڈا، ہنگری، پولینڈ، نیوزی لینڈ اور بیلاروس ہر ایک کی اپنی مدت اور اپنی رفتار ہے۔ جہاں تیز راستہ نہیں، ہم اسے ایجاد نہیں کرتے۔\n\nدفتر ستارے میستو میں ہے۔ ہر فائل کے ساتھ ایک نام ہے۔ جب وزارت سست ہو، کیس کا صفحہ یہی کہتا ہے۔",
  motion: "1",
  count_filed: "1",
  count_issued: "1",
  banner_on: "0",
  banner_text_en: "",
  banner_text_cs: "",
  banner_text_ur: "",
  banner_country: "",
  banner_start: "",
  banner_end: "",
  step_copy: "",
  desk_hours: "",
  door_hint: "",
  review_1_name: "",
  review_1_country: "",
  review_1_date: "",
  review_1_text: "",
  review_2_name: "",
  review_2_country: "",
  review_2_date: "",
  review_2_text: "",
};
