import { priceFor, productionWeeks, type Processing } from "./domain.ts";
import { VISA_PRODUCTS } from "./seed.ts";

export const HISTORY_COUNT = 2219;
const RECENT_FROM = "2026-08-01";

type Pool = { country: string; weight: number; male: string; female: string; last: string };

const POOLS: Pool[] = [
  {
    country: "India",
    weight: 16,
    male: "Aarav,Vivaan,Aditya,Arjun,Rohan,Kabir,Ishaan,Reyansh,Krishna,Ayaan,Dev,Harsh,Nikhil,Sanjay,Rahul,Amit,Vikram,Pranav",
    female: "Aanya,Diya,Ananya,Myra,Sara,Anika,Navya,Kiara,Ira,Pari,Meera,Lakshmi,Priya,Neha,Kavya,Sneha",
    last: "Sharma,Verma,Patel,Gupta,Singh,Kumar,Reddy,Nair,Iyer,Das,Mehta,Joshi,Kapoor,Chopra,Banerjee,Malhotra",
  },
  {
    country: "Pakistan",
    weight: 12,
    male: "Ahmed,Hassan,Usman,Bilal,Hamza,Omar,Zain,Faisal,Imran,Tariq,Naveed,Shahid,Adeel,Waqas,Junaid,Kamran",
    female: "Ayesha,Fatima,Zainab,Maryam,Hira,Sana,Iqra,Noor,Amna,Rabia,Khadija,Maham,Laiba,Sidra",
    last: "Khan,Malik,Butt,Chaudhry,Sheikh,Qureshi,Abbasi,Raza,Siddiqui,Hussain,Iqbal,Dar",
  },
  {
    country: "Bangladesh",
    weight: 10,
    male: "Rahim,Karim,Jamal,Hasan,Sohel,Imran,Faruk,Nasir,Shakil,Rafiq,Mamun,Arif,Tanvir,Sabbir",
    female: "Nusrat,Sadia,Mitu,Rupa,Shila,Taslima,Afsana,Jannat,Maliha,Sumaiya,Farzana,Nabila",
    last: "Rahman,Hossain,Ahmed,Islam,Chowdhury,Akter,Begum,Mia,Talukder,Sarkar,Uddin,Khatun",
  },
  {
    country: "Philippines",
    weight: 8,
    male: "Juan,Jose,Mark,John,Carlo,Angelo,Joshua,Daniel,Miguel,Anthony,Ryan,Paolo,Christian,Jerome",
    female: "Maria,Grace,Angel,Joy,Rose,Catherine,Michelle,Patricia,Anna,Kristine,Jenny,Liza",
    last: "Santos,Reyes,Cruz,Garcia,Mendoza,Torres,Flores,Gonzales,Ramos,Castillo",
  },
  {
    country: "Nepal",
    weight: 7,
    male: "Aarav,Sajan,Bikash,Ramesh,Nabin,Prakash,Sunil,Dipesh,Kiran,Rajesh,Suresh,Anil",
    female: "Sita,Gita,Anita,Sunita,Priya,Sabina,Nisha,Asmita,Laxmi,Puja",
    last: "Shrestha,Gurung,Tamang,Rai,Magar,Thapa,Adhikari,Karki,Poudel,Basnet",
  },
  {
    country: "Uzbekistan",
    weight: 7,
    male: "Jasur,Bekzod,Aziz,Sardor,Otabek,Sherzod,Bobur,Jahongir,Ulugbek,Akmal,Rustam,Farrukh",
    female: "Madina,Dilnoza,Nilufar,Gulnora,Sevara,Malika,Shahnoza,Aziza,Nodira,Zarina",
    last: "Karimov,Toshmatov,Yuldashev,Abdullayev,Rasulov,Ismoilov,Nazarov,Kholmurodov,Ergashev,Sattorov",
  },
  {
    country: "Egypt",
    weight: 7,
    male: "Omar,Youssef,Mahmoud,Mostafa,Karim,Tarek,Hassan,Amr,Walid,Hany,Sherif,Adel",
    female: "Fatma,Nour,Mariam,Salma,Heba,Dina,Yasmin,Aya,Hana,Rana",
    last: "Hassan,Ibrahim,Mohamed,Ali,Mahmoud,Sayed,Farouk,Abdelrahman,Nasser,Fathy",
  },
  {
    country: "Tajikistan",
    weight: 5,
    male: "Farrukh,Rustam,Jamshed,Parviz,Davlat,Sherali,Alisher,Firuz,Bahodur,Komil",
    female: "Madina,Zarina,Nigina,Shahnoza,Dilbar,Mavluda,Gulnora,Firuza",
    last: "Rahmonov,Sharipov,Nazarov,Karimov,Saidov,Kholov,Aminov,Yusupov",
  },
  {
    country: "Kyrgyzstan",
    weight: 5,
    male: "Azamat,Nursultan,Bakyt,Ermek,Tilek,Aibek,Mirlan,Ruslan,Daniyar,Nurlan",
    female: "Aigul,Nazgul,Ainura,Cholpon,Begimai,Aizada,Gulnara,Jamilya",
    last: "Bekov,Asanov,Toktogulov,Mamytov,Sadykov,Ismailov,Abdullaev,Kadyrov",
  },
  {
    country: "Kazakhstan",
    weight: 5,
    male: "Nursultan,Arman,Daulet,Yerlan,Askar,Bekzat,Olzhas,Miras,Timur,Serik",
    female: "Aigerim,Madina,Assel,Dana,Kamila,Aizhan,Gulmira,Saule",
    last: "Nurpeisov,Suleimenov,Abdrahmanov,Kasymov,Omarov,Bekmurzayev,Zhumabayev,Tulegenov",
  },
  {
    country: "Morocco",
    weight: 5,
    male: "Youssef,Mehdi,Amine,Hamza,Anas,Omar,Karim,Rachid,Samir,Adil",
    female: "Fatima,Imane,Salma,Khadija,Sara,Hajar,Nour,Amal",
    last: "El Amrani,Bennani,Alaoui,Idrissi,Tazi,Fassi,Chraibi,Berrada",
  },
  {
    country: "Türkiye",
    weight: 5,
    male: "Mehmet,Ahmet,Emre,Burak,Can,Yusuf,Hakan,Murat,Serkan,Omer",
    female: "Elif,Zeynep,Ayse,Merve,Fatma,Hatice,Selin,Busra",
    last: "Yilmaz,Kaya,Demir,Sahin,Celik,Yildiz,Aydin,Arslan",
  },
  {
    country: "Ukraine",
    weight: 3,
    male: "Andrii,Oleksandr,Dmytro,Ivan,Mykola,Serhii,Taras,Yurii",
    female: "Olena,Iryna,Nataliia,Tetiana,Yuliia,Kateryna",
    last: "Shevchenko,Kovalenko,Bondarenko,Melnyk,Kravchenko,Tkachenko,Savchenko,Oliinyk",
  },
  {
    country: "Azerbaijan",
    weight: 3,
    male: "Elvin,Rashad,Tural,Orkhan,Kamran,Murad,Nijat,Farid",
    female: "Aysel,Leyla,Gunel,Nigar,Sevinc,Aygun",
    last: "Mammadov,Aliyev,Hasanov,Huseynov,Ismayilov,Guliyev,Rahimov,Karimov",
  },
  {
    country: "Georgia",
    weight: 2,
    male: "Giorgi,Nika,Luka,Irakli,Davit,Levan,Saba,Tornike",
    female: "Nino,Tamar,Mariam,Ana,Salome,Ketevan",
    last: "Beridze,Kapanadze,Gelashvili,Maisuradze,Lomidze,Tsiklauri",
  },
  {
    country: "Armenia",
    weight: 2,
    male: "Armen,Tigran,Hayk,Narek,Gor,Aram,Karen,Levon",
    female: "Ani,Mariam,Sona,Lilit,Narine,Anahit",
    last: "Hakobyan,Sargsyan,Harutyunyan,Grigoryan,Petrosyan,Khachatryan",
  },
];

export type HistoryRow = {
  id: string;
  userId: string;
  vacancyId: string;
  applicantData: string;
  status: string;
  stage: string;
  visaProductId: string;
  country: string;
  processingOption: string;
  totalCost: string;
  currency: string;
  processStage: string;
  paymentDeadlineAt: string;
  documentDeadlineAt: string;
  assignedManagerId: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string;
  rejectedReason: string;
};

type Person = { first: string; last: string; gender: "m" | "f"; citizenship: string };
type Outcome = { status: "ISSUED" | "REJECTED" | "OPEN"; stage: 1 | 2 | 3 | 4; process: string; reason: string };

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const counts = exact.map((value) => Math.floor(value));
  let left = total - counts.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let step = 0; left > 0; step += 1) {
    counts[order[step % order.length]!.index] += 1;
    left -= 1;
  }
  return counts;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    const current = out[index]!;
    out[index] = out[swap]!;
    out[swap] = current;
  }
  return out;
}

function parts(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function peopleFor(rand: () => number): Person[] {
  const counts = largestRemainder(HISTORY_COUNT, POOLS.map((pool) => pool.weight));
  const used = new Set<string>();
  const people: Person[] = [];
  POOLS.forEach((pool, index) => {
    const need = counts[index] ?? 0;
    const firsts = [
      ...parts(pool.male).map((name) => ({ name, gender: "m" as const })),
      ...parts(pool.female).map((name) => ({ name, gender: "f" as const })),
    ];
    const lasts = parts(pool.last);
    const combos = shuffle(
      firsts.flatMap((first) => lasts.map((last) => ({ first: first.name, last, gender: first.gender }))),
      rand,
    );
    let taken = 0;
    for (const combo of combos) {
      const key = `${combo.first} ${combo.last}`;
      if (used.has(key)) continue;
      used.add(key);
      people.push({ first: combo.first, last: combo.last, gender: combo.gender, citizenship: pool.country });
      taken += 1;
      if (taken === need) break;
    }
    if (taken !== need) throw new Error(`Name pool for ${pool.country} is short.`);
  });
  return shuffle(people, rand);
}

function outcomes(historical: boolean, total: number): Outcome[] {
  if (total <= 0) return [];
  if (historical) {
    const [issued, refused, stuck] = largestRemainder(total, [65, 20, 15]);
    const [secondPay, thirdPay] = [Math.ceil((stuck ?? 0) / 2), Math.floor((stuck ?? 0) / 2)];
    return [
      ...Array.from({ length: issued ?? 0 }, () => ({ status: "ISSUED" as const, stage: 4 as const, process: "MINISTRY_APPROVED", reason: "" })),
      ...Array.from({ length: refused ?? 0 }, () => ({ status: "REJECTED" as const, stage: 3 as const, process: "MINISTRY_REVIEW", reason: "The ministry refused the application." })),
      ...Array.from({ length: secondPay }, () => ({ status: "OPEN" as const, stage: 3 as const, process: "IN_PROCESS", reason: "" })),
      ...Array.from({ length: thirdPay }, () => ({ status: "OPEN" as const, stage: 4 as const, process: "IN_PROCESS", reason: "" })),
    ];
  }
  const [visa, moving, early] = largestRemainder(total, [40, 40, 20]);
  const [stage3, stage4] = [Math.ceil((moving ?? 0) / 2), Math.floor((moving ?? 0) / 2)];
  const [stage1, stage2] = [Math.ceil((early ?? 0) / 2), Math.floor((early ?? 0) / 2)];
  return [
    ...Array.from({ length: visa ?? 0 }, () => ({ status: "ISSUED" as const, stage: 4 as const, process: "MINISTRY_APPROVED", reason: "" })),
    ...Array.from({ length: stage3 }, () => ({ status: "OPEN" as const, stage: 3 as const, process: "IN_PROCESS", reason: "" })),
    ...Array.from({ length: stage4 }, () => ({ status: "OPEN" as const, stage: 4 as const, process: "IN_PROCESS", reason: "" })),
    ...Array.from({ length: stage1 }, () => ({ status: "OPEN" as const, stage: 1 as const, process: "IN_PROCESS", reason: "" })),
    ...Array.from({ length: stage2 }, () => ({ status: "OPEN" as const, stage: 2 as const, process: "IN_PROCESS", reason: "" })),
  ];
}

function later(created: string, days: number, cap: number) {
  return new Date(Math.min(cap, Date.parse(created) + days * 86400000)).toISOString();
}

export function kyivDay(now = new Date()): string {
  const partsOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const year = partsOf.find((part) => part.type === "year")?.value ?? "";
  const month = partsOf.find((part) => part.type === "month")?.value ?? "";
  const day = partsOf.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Stable public-board history. Same end date always returns the same 2219 rows. */
export function buildHistoryBoard(endDate: string): HistoryRow[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
  if (!match) throw new Error("History end date");
  const endUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const startUtc = Date.UTC(2024, 2, 1);
  if (!Number.isFinite(endUtc) || endUtc < startUtc) throw new Error("History end date");
  const cap = Date.parse(`${endDate}T18:00:00.000Z`);
  const dayCount = Math.round((endUtc - startUtc) / 86400000) + 1;
  const rand = mulberry32(20240301);
  const people = peopleFor(rand);
  const dayCounts = largestRemainder(
    HISTORY_COUNT,
    Array.from({ length: dayCount }, (_, index) => index + dayCount),
  );
  const dated = people.map((person) => ({ person, createdAt: "" }));
  let cursor = 0;
  dayCounts.forEach((count, dayIndex) => {
    for (let slot = 0; slot < count; slot += 1) {
      const seconds = Math.floor(rand() * 18 * 3600);
      dated[cursor]!.createdAt = new Date(startUtc + dayIndex * 86400000 + seconds * 1000).toISOString();
      cursor += 1;
    }
  });
  const products = VISA_PRODUCTS.filter((item) => item.active);
  const historicalIndex: number[] = [];
  const recentIndex: number[] = [];
  dated.forEach((item, index) => {
    if (item.createdAt.slice(0, 10) < RECENT_FROM) historicalIndex.push(index);
    else recentIndex.push(index);
  });
  const assigned = new Map<number, Outcome>();
  [ [historicalIndex, true], [recentIndex, false] ].forEach(([indexes, historical]) => {
    const list = indexes as number[];
    const plan = shuffle(outcomes(historical as boolean, list.length), rand);
    list.forEach((index, position) => assigned.set(index, plan[position]!));
  });
  const rows: HistoryRow[] = dated.map((item, index) => {
    const outcome = assigned.get(index)!;
    const product = products[Math.floor(rand() * products.length)]!;
    const processing = product.allowedProcessing[Math.floor(rand() * product.allowedProcessing.length)]! as Processing;
    const year = 1976 + Math.floor(rand() * 26);
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(rand() * 28)).padStart(2, "0");
    const stage = outcome.stage;
    const createdAt = item.createdAt;
    const updatedAt = outcome.status === "OPEN" && stage < 3 ? later(createdAt, 2, cap) : later(createdAt, 40, cap);
    const extra = {
      clientEmail: "",
      citizenship: item.person.citizenship,
      productionWeeks: productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, processing),
      profileComplete: stage !== 1,
      dispatchNote: "",
      questionnaire: {
        firstName: item.person.first,
        lastName: item.person.last,
        middleName: "",
        middleNameAbsent: true,
        birthDate: `${year}-${month}-${day}`,
        gender: item.person.gender,
        citizenship: item.person.citizenship,
        criminalRecord: "no",
        phone: "",
        previousVisa: "no",
        travelWithFamily: "alone",
      },
      stage2At: stage >= 2 ? later(createdAt, 4, cap) : null,
      stage3At: stage >= 3 ? later(createdAt, 21, cap) : null,
      stage4At: stage >= 4 ? later(createdAt, 48, cap) : null,
      cancelDeadlineAt: null,
      paymentReminded: true,
      docReminded: true,
      referrerUserId: "",
      history: true,
    };
    return {
      id: "",
      userId: "",
      vacancyId: "",
      applicantData: JSON.stringify(extra),
      status: outcome.status,
      stage: String(stage),
      visaProductId: product.id,
      country: product.country,
      processingOption: processing,
      totalCost: String(priceFor(product.basePrice, processing)),
      currency: "EUR",
      processStage: outcome.process,
      paymentDeadlineAt: "",
      documentDeadlineAt: "",
      assignedManagerId: "",
      createdAt,
      updatedAt,
      approvedAt: outcome.status === "ISSUED" ? later(createdAt, 56, cap) : "",
      rejectedReason: outcome.reason,
    };
  });
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  rows.forEach((row, index) => {
    row.id = `VG-H${String(index + 1).padStart(4, "0")}`;
  });
  return rows;
}
