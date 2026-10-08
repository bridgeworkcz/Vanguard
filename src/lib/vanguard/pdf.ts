import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { tranches, type Questionnaire } from "./domain";

type Settings = Record<string, string>;

const W = 595.28;
const H = 841.89;
const L = 46;
const R = 549;
const COL = R - L;
const INK = rgb(0.027, 0.031, 0.035);
const PAPER = rgb(0.957, 0.961, 0.969);
const EMBER = rgb(1, 0.416, 0.102);
const MUTED = rgb(0.33, 0.34, 0.36);
const RULE = rgb(0.72, 0.74, 0.76);
const WHITE = rgb(0.98, 0.98, 0.97);
const SEAL = rgb(0.55, 0.08, 0.11);
const WASH = rgb(1, 0.94, 0.89);
const CARD = rgb(0.99, 0.992, 0.996);

const ENTITY = "Vanguard Global Mobility s.r.o.";
const ADDRESS = "Rybná 716/24, Staré Město, 110 00 Praha 1, Česká republika";
const ICO = "19842710";
const DIC = "CZ19842710";
const COURT = "Městský soud v Praze, oddíl C, vložka 392810";
const REGULATOR = "Živnostenský úřad Praha 1";

let regularBytes: ArrayBuffer | null = null;
let boldBytes: ArrayBuffer | null = null;

async function fonts() {
  if (!regularBytes) {
    regularBytes = await fetch("/fonts/LiberationSerif-Regular.ttf").then((r) => r.arrayBuffer());
    boldBytes = await fetch("/fonts/LiberationSerif-Bold.ttf").then((r) => r.arrayBuffer());
  }
  return { regularBytes, boldBytes: boldBytes! };
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const lines: string[] = [];
  const breakWord = (word: string) => {
    const parts: string[] = [];
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (font.widthOfTextAtSize(next, size) > max && chunk) {
        parts.push(chunk);
        chunk = ch;
      } else chunk = next;
    }
    if (chunk) parts.push(chunk);
    return parts;
  };
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words.flatMap(breakWord)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function save(bytes: Uint8Array, name: string, hold = false): string {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  if (hold) return url;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return "";
}

function plusDays(date: string, days: number) {
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function money(n: number) {
  return `${n.toLocaleString("en-GB")} EUR`;
}

function fit(text: string, font: PDFFont, size: number, max: number) {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > max) out = out.slice(0, -1);
  return `${out}...`;
}

function variableSymbol(fileId: string, tranche: number) {
  let n = 0;
  for (const ch of fileId) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  const body = String(n % 100000000).padStart(8, "0");
  return `${body}${tranche}`;
}

/** Letters follow a circle. `top` reads left to right across the crown; the foot of the bottom arc faces the centre. */
function arcText(
  page: PDFPage,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  top: boolean,
) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => font.widthOfTextAtSize(ch, size));
  const gap = size * 0.12;
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, chars.length - 1);
  let cursor = -total / 2;
  chars.forEach((ch, i) => {
    const w = widths[i]!;
    const mid = cursor + w / 2;
    const delta = mid / radius;
    const theta = top ? Math.PI / 2 - delta : -Math.PI / 2 - delta;
    const rot = ((theta * 180) / Math.PI - 90) * (top ? 1 : -1);
    const read = (rot * Math.PI) / 180;
    const mx = cx + Math.cos(theta) * radius;
    const my = cy + Math.sin(theta) * radius;
    page.drawText(ch, {
      x: mx - Math.cos(read) * (w / 2),
      y: my - Math.sin(read) * (w / 2),
      size,
      font,
      color,
      rotate: degrees(rot),
    });
    cursor += w + gap;
  });
}

class Sheet {
  pages: PDFPage[] = [];
  y = 0;
  running = "";

  constructor(
    readonly pdf: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly settings: Settings,
    readonly cs: boolean,
  ) {}

  page() {
    return this.pages[this.pages.length - 1]!;
  }

  blank() {
    const page = this.pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    page.drawRectangle({ x: 0, y: H - 28, width: W, height: 28, color: INK });
    page.drawRectangle({ x: 0, y: H - 32, width: W, height: 4, color: EMBER });
    page.drawText("VANGUARD", { x: L, y: H - 19, size: 11, font: this.bold, color: WHITE });
    page.drawText("GLOBAL MOBILITY", { x: L + 84, y: H - 18, size: 8, font: this.font, color: EMBER });
    const mark = (this.settings.legal_entity || ENTITY).slice(0, 42);
    const mw = this.font.widthOfTextAtSize(mark, 7);
    page.drawText(mark, { x: R - mw, y: H - 18, size: 7, font: this.font, color: rgb(0.78, 0.78, 0.76) });
    this.pages.push(page);
    this.y = H - 52;
    if (this.pages.length > 1 && this.running) {
      const label = fit(this.running, this.font, 8, COL - 70);
      page.drawText(label, { x: L, y: this.y - 8, size: 8, font: this.font, color: MUTED });
      const cont = this.cs ? "pokračování" : "continued";
      const cw = this.font.widthOfTextAtSize(cont, 8);
      page.drawText(cont, { x: R - cw, y: this.y - 8, size: 8, font: this.font, color: MUTED });
      this.y -= 18;
    }
  }

  need(h: number) {
    if (this.y - h < 72) this.blank();
  }

  write(text: string, size: number, face: PDFFont = this.font, color = INK, lead = 3.6) {
    for (const line of wrap(text, face, size, COL)) {
      this.need(size + lead);
      if (line) this.page().drawText(line, { x: L, y: this.y - size, size, font: face, color });
      this.y -= size + lead;
    }
  }

  gap(n = 8) {
    this.y -= n;
  }

  title(text: string) {
    this.running = text;
    this.need(28);
    this.page().drawText(text, { x: L, y: this.y - 18, size: 18, font: this.bold, color: INK });
    this.y -= 24;
    this.page().drawRectangle({ x: L, y: this.y, width: 64, height: 2.2, color: EMBER });
    this.y -= 14;
  }

  heading(text: string, meta: string[]) {
    this.running = text;
    const block = Math.max(28, 8 + meta.length * 12);
    this.need(block + 16);
    const page = this.page();
    page.drawText(text, { x: L, y: this.y - 16, size: 18, font: this.bold, color: INK });
    let y = this.y - 4;
    for (const line of meta) {
      const [label, value] = line.split("\t");
      const valueText = value ?? line;
      const labelText = value ? label! : "";
      const vw = this.bold.widthOfTextAtSize(valueText, 8);
      if (labelText) {
        const lw = this.font.widthOfTextAtSize(labelText, 8);
        page.drawText(labelText, { x: R - vw - lw - 8, y, size: 8, font: this.font, color: MUTED });
      }
      page.drawText(valueText, { x: R - vw, y, size: 8, font: this.bold, color: INK });
      y -= 12;
    }
    this.y -= block;
    page.drawRectangle({ x: L, y: this.y, width: 64, height: 2.2, color: EMBER });
    this.y -= 14;
  }

  boxes(leftTitle: string, left: string[], rightTitle: string, right: string[]) {
    const inner = 222;
    const leftLines = left.flatMap((line) => wrap(line, this.font, 8, inner));
    const rightLines = right.flatMap((line) => wrap(line, this.font, 8, inner));
    const n = Math.max(leftLines.length, rightLines.length, 1);
    const h = 16 + n * 11 + 10;
    this.need(h);
    const page = this.page();
    const top = this.y;
    const boxW = 246;
    const paint = (x: number, title: string, lines: string[]) => {
      page.drawRectangle({ x, y: top - h, width: boxW, height: h, color: CARD, borderColor: RULE, borderWidth: 0.7 });
      page.drawRectangle({ x, y: top - 16, width: boxW, height: 16, color: INK });
      page.drawText(title.toUpperCase(), { x: x + 8, y: top - 11, size: 7, font: this.bold, color: WHITE });
      let y = top - 28;
      for (const line of lines) {
        page.drawText(line, { x: x + 8, y, size: 8, font: this.font, color: INK });
        y -= 11;
      }
    };
    paint(L, leftTitle, leftLines);
    paint(L + COL - boxW, rightTitle, rightLines);
    this.y = top - h - 12;
  }

  table(headers: string[], rows: string[][], widths: number[], hot = -1) {
    const head = 18;
    const rowH = 18;
    this.need(head + rows.length * rowH + 8);
    const page = this.page();
    let y = this.y;
    page.drawRectangle({ x: L, y: y - head, width: COL, height: head, color: INK });
    let x = L;
    headers.forEach((cell, i) => {
      page.drawText(cell.toUpperCase(), { x: x + 6, y: y - 12, size: 7, font: this.bold, color: WHITE });
      x += widths[i]!;
    });
    y -= head;
    rows.forEach((row, index) => {
      if (index === hot) page.drawRectangle({ x: L, y: y - rowH, width: COL, height: rowH, color: WASH });
      else if (index % 2 === 0) page.drawRectangle({ x: L, y: y - rowH, width: COL, height: rowH, color: rgb(0.93, 0.935, 0.945) });
      if (index === hot) page.drawRectangle({ x: L, y: y - rowH, width: 3, height: rowH, color: EMBER });
      page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.3, color: RULE });
      x = L;
      row.forEach((cell, i) => {
        const face = index === hot || index === rows.length - 1 ? this.bold : this.font;
        page.drawText(fit(cell, face, 8, widths[i]! - 12), { x: x + 6, y: y - 12, size: 8, font: face, color: INK });
        x += widths[i]!;
      });
      y -= rowH;
    });
    page.drawRectangle({ x: L, y: y, width: COL, height: 1.1, color: INK });
    this.y = y - 12;
  }

  dueBox(label: string, amount: string) {
    this.need(36);
    const page = this.page();
    page.drawRectangle({ x: L, y: this.y - 30, width: COL, height: 30, color: INK });
    page.drawRectangle({ x: L, y: this.y - 30, width: 4, height: 30, color: EMBER });
    page.drawText(label, { x: L + 14, y: this.y - 19, size: 9, font: this.font, color: WHITE });
    const aw = this.bold.widthOfTextAtSize(amount, 13);
    page.drawText(amount, { x: R - 12 - aw, y: this.y - 20, size: 13, font: this.bold, color: EMBER });
    this.y -= 42;
  }

  kv(rows: [string, string][]) {
    const rowH = 16;
    const h = rows.length * rowH + 8;
    this.need(h);
    const page = this.page();
    const top = this.y;
    page.drawRectangle({ x: L, y: top - h, width: COL, height: h, color: CARD, borderColor: RULE, borderWidth: 0.7 });
    rows.forEach(([label, value], index) => {
      const y = top - 14 - index * rowH;
      page.drawText(label, { x: L + 10, y, size: 8, font: this.font, color: MUTED });
      const shown = fit(value, this.bold, 8, COL - 150);
      page.drawText(shown, { x: L + 130, y, size: 8, font: this.bold, color: INK });
    });
    this.y = top - h - 10;
  }

  seal() {
    this.need(124);
    const page = this.page();
    const y = this.y - 6;
    page.drawLine({ start: { x: L, y: y - 22 }, end: { x: L + 188, y: y - 22 }, thickness: 0.6, color: INK });
    page.drawText("Klára Nováková", { x: L, y: y - 38, size: 11, font: this.bold, color: INK });
    page.drawText(this.cs ? "Ředitelka pro klienty" : "Client director", { x: L, y: y - 52, size: 8, font: this.font, color: MUTED });
    page.drawText(this.cs ? "Za Vanguard Global Mobility s.r.o." : "For Vanguard Global Mobility s.r.o.", {
      x: L,
      y: y - 64,
      size: 8,
      font: this.font,
      color: MUTED,
    });
    page.drawText(this.cs ? "Elektronický spis, bez podpisu perem." : "Electronic file. No wet-ink signature.", {
      x: L,
      y: y - 78,
      size: 7.5,
      font: this.font,
      color: MUTED,
    });

    const cx = R - 62;
    const cy = y - 52;
    const ico = this.settings.registration_number || ICO;
    page.drawEllipse({ x: cx, y: cy, xScale: 54, yScale: 54, borderColor: SEAL, borderWidth: 1.6 });
    page.drawEllipse({ x: cx, y: cy, xScale: 50, yScale: 50, borderColor: SEAL, borderWidth: 0.45 });
    page.drawEllipse({ x: cx, y: cy, xScale: 34, yScale: 34, borderColor: SEAL, borderWidth: 0.45 });
    arcText(page, "VANGUARD GLOBAL MOBILITY", cx, cy, 43.5, this.bold, 6.2, SEAL, true);
    arcText(page, "* PRAHA 1  ·  ČESKÁ REPUBLIKA *", cx, cy, 43.5, this.font, 5.1, SEAL, false);
    const centre: [string, number, PDFFont][] = [
      ["s.r.o.", 8, this.bold],
      [`IČO ${ico}`, 6.5, this.bold],
      ["C 392810", 5.5, this.font],
    ];
    let ty = cy + 10;
    for (const [text, size, face] of centre) {
      const tw = face.widthOfTextAtSize(text, size);
      page.drawText(text, { x: cx - tw / 2, y: ty, size, font: face, color: SEAL });
      ty -= size + 2;
    }
    this.y = y - 112;
  }

  close() {
    const total = this.pages.length;
    const address = this.settings.legal_address || ADDRESS;
    const ids = `IČO ${this.settings.registration_number || ICO}    DIČ ${this.settings.vat_number || DIC}`;
    const court = this.settings.court_record || COURT;
    const desk = [this.settings.support_email || "desk@vanguard-mobility.cz", this.settings.support_phone || "+420 770 347 160"]
      .filter(Boolean)
      .join("   ·   ");
    this.pages.forEach((page, index) => {
      page.drawRectangle({ x: 0, y: 0, width: W, height: 4, color: EMBER });
      page.drawLine({ start: { x: L, y: 50 }, end: { x: R, y: 50 }, thickness: 0.4, color: RULE });
      page.drawText(fit(address, this.font, 7, COL - 40), { x: L, y: 38, size: 7, font: this.font, color: MUTED });
      page.drawText(fit(`${ids}    ${desk}`, this.font, 7, COL - 40), { x: L, y: 28, size: 7, font: this.font, color: MUTED });
      page.drawText(fit(court, this.font, 7, COL - 40), { x: L, y: 18, size: 7, font: this.font, color: MUTED });
      const mark = `${index + 1} / ${total}`;
      const mw = this.font.widthOfTextAtSize(mark, 8);
      page.drawText(mark, { x: R - mw, y: 26, size: 8, font: this.font, color: MUTED });
    });
  }
}

async function open(settings: Settings, cs: boolean) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const raw = await fonts();
  const font = await pdf.embedFont(raw.regularBytes!);
  const bold = await pdf.embedFont(raw.boldBytes);
  const sheet = new Sheet(pdf, font, bold, settings, cs);
  sheet.blank();
  return sheet;
}

function firmLines(s: Settings) {
  return [
    s.legal_entity || ENTITY,
    s.legal_address || ADDRESS,
    `IČO ${s.registration_number || ICO}`,
    `DIČ ${s.vat_number || DIC}`,
    s.court_record || COURT,
    s.regulator || REGULATOR,
  ];
}

function euroWords(n: number, cs: boolean): string {
  const whole = Math.max(0, Math.round(n));
  const enOnes = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const enTens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const csOnes = ["nula", "jedna", "dva", "tři", "čtyři", "pět", "šest", "sedm", "osm", "devět", "deset", "jedenáct", "dvanáct", "třináct", "čtrnáct", "patnáct", "šestnáct", "sedmnáct", "osmnáct", "devatenáct"];
  const csTens = ["", "", "dvacet", "třicet", "čtyřicet", "padesát", "šedesát", "sedmdesát", "osmdesát", "devadesát"];
  const csHundreds = ["", "sto", "dvě stě", "tři sta", "čtyři sta", "pět set", "šest set", "sedm set", "osm set", "devět set"];
  function en(x: number): string {
    if (x < 20) return enOnes[x] || String(x);
    if (x < 100) return `${enTens[Math.floor(x / 10)]}${x % 10 ? `-${enOnes[x % 10]}` : ""}`;
    if (x < 1000) return `${enOnes[Math.floor(x / 100)]} hundred${x % 100 ? ` ${en(x % 100)}` : ""}`;
    return `${en(Math.floor(x / 1000))} thousand${x % 1000 ? ` ${en(x % 1000)}` : ""}`;
  }
  function cz(x: number): string {
    if (x < 20) return csOnes[x] || String(x);
    if (x < 100) return `${csTens[Math.floor(x / 10)]}${x % 10 ? ` ${csOnes[x % 10]}` : ""}`;
    if (x < 1000) return `${csHundreds[Math.floor(x / 100)]}${x % 100 ? ` ${cz(x % 100)}` : ""}`.trim();
    return `${cz(Math.floor(x / 1000))} tisíc${x % 1000 ? ` ${cz(x % 1000)}` : ""}`;
  }
  return cs ? `${cz(whole)} eur` : `${en(whole)} euro`;
}

export async function buildInvoice(opts: {
  lang: "en" | "cs" | "ur";
  tranche: 1 | 2 | 3;
  settings: Settings;
  fileId: string;
  client: string;
  country: string;
  permit: string;
  duration: string;
  employer: string;
  total: number;
  date: string;
  number?: string;
  hold?: boolean;
}) {
  const cs = opts.lang === "cs";
  const parts = tranches(opts.total);
  const amount = opts.tranche === 1 ? parts.first : opts.tranche === 2 ? parts.second : parts.final;
  const sheet = await open(opts.settings, cs);
  const number = opts.number || `${opts.fileId}-${opts.tranche}`;
  const due =
    opts.tranche === 1
      ? plusDays(opts.date, 5)
      : opts.tranche === 2
        ? plusDays(opts.date, 14)
        : cs
          ? "před vydáním dokumentů"
          : "before the documents are released";
  const vs = variableSymbol(opts.fileId, opts.tranche);
  const whichEn = ["FIRST PAYMENT", "SECOND PAYMENT", "THIRD PAYMENT"][opts.tranche - 1] || "PAYMENT";
  const whichCs = ["PRVNÍ PLATBA", "DRUHÁ PLATBA", "TŘETÍ PLATBA"][opts.tranche - 1] || "PLATBA";
  sheet.heading(cs ? whichCs : whichEn, [
    `${cs ? "Číslo" : "Number"}\t${number}`,
    `${cs ? "Vystaveno" : "Issued"}\t${opts.date}`,
    `${cs ? "Splatnost" : "Due"}\t${due}`,
    `${cs ? "Var. symbol" : "Variable symbol"}\t${vs}`,
  ]);
  sheet.boxes(
    cs ? "Dodavatel" : "Supplier",
    firmLines(opts.settings),
    cs ? "Odběratel" : "Bill to",
    [opts.client || "—", `${cs ? "Spis" : "File"} ${opts.fileId}`, opts.country, `${opts.permit}, ${opts.duration}`, opts.employer || "—"],
  );
  const labels = [
    cs ? "1. část  ·  přijetí spisu" : "Part 1  ·  file accepted",
    cs ? "2. část  ·  podání na ministerstvo" : "Part 2  ·  ministry filing cleared",
    cs ? "3. část  ·  odeslání dokumentů" : "Part 3  ·  documents released",
  ];
  const values = [parts.first, parts.second, parts.final];
  const rates = ["30 %", "40 %", "30 %"];
  sheet.table(
    [cs ? "Popis" : "Description", cs ? "Podíl" : "Share", cs ? "Částka" : "Amount", cs ? "Stav" : "Status"],
    labels.map((label, i) => [
      label,
      rates[i]!,
      money(values[i]!),
      i + 1 === opts.tranche ? (cs ? "tato faktura" : "this invoice") : i + 1 < opts.tranche ? (cs ? "dříve" : "earlier") : cs ? "později" : "later",
    ]),
    [248, 62, 96, 97],
    opts.tranche - 1,
  );
  sheet.table(
    [cs ? "Souhrn" : "Summary", "", cs ? "Částka" : "Amount"],
    [
      [cs ? "Honorář sjednaný při otevření spisu" : "Fee fixed when the file was opened", "", money(opts.total)],
      [cs ? "K úhradě touto fakturou" : "Due on this invoice", "", money(amount)],
    ],
    [310, 96, 97],
    1,
  );
  sheet.dueBox(cs ? "K úhradě nyní" : "Due now", money(amount));
  sheet.write(euroWords(amount, cs), 14, sheet.bold);
  sheet.gap(4);
  sheet.write(cs ? `Příklad zprávy k platbě: ${vs}` : `Example payment reference: ${vs}`, 12, sheet.bold);
  sheet.gap(6);
  const wallet = opts.settings.usdt_wallet?.trim();
  const network = opts.settings.usdt_network || "TRC-20 (TRON)";
  sheet.write(cs ? "Platební údaje" : "How to pay", 11, sheet.bold);
  sheet.gap(4);
  sheet.kv([
    [cs ? "Měna" : "Currency", "USDT"],
    [cs ? "Síť" : "Network", network],
    [cs ? "Peněženka" : "Wallet", wallet || (cs ? "zatím nezveřejněna" : "not published yet")],
    [cs ? "Variabilní symbol" : "Variable symbol", vs],
    [cs ? "Zpráva k platbě" : "Payment note", opts.fileId],
  ]);
  sheet.write(
    wallet
      ? cs
        ? "Částka na této faktuře se o nic nezvyšuje. Pokud to síť dovolí, do zprávy uveďte číslo spisu. Potvrzení nahrajte ve spise. Prostředky neposílejte na jinou adresu, než je uvedena výše."
        : "Nothing is added on top of the amount on this invoice. If the network allows a note, put the file number in it. Upload the receipt in the case. Do not send funds to any address other than the wallet printed above."
      : cs
        ? "Praxe zatím nezveřejnila peněženku. Prostředky neposílejte, dokud vám stůl adresu nesdělí ve spise."
        : "The practice has not published a wallet yet. Do not send funds until the desk writes the address on the file.",
    9,
  );
  sheet.gap(4);
  sheet.write(
    opts.tranche === 1
      ? cs
        ? "První část je splatná do pěti dnů od přijetí spisu. Bez dokladu o platbě se spis uzavře a místo se uvolní."
        : "The first part is due within five days of acceptance. Without proof of payment the file closes and the seat is released."
      : opts.tranche === 2
        ? cs
          ? "Druhá část se otevírá, když zaměstnavatel uvolní podání na ministerstvo. Na úhradu je čtrnáct dní."
          : "The second part opens when the employer clears the filing on to the ministry. Fourteen days are given."
        : cs
          ? "Třetí část se hradí dříve, než se odešlou originály nebo otevře státní portál. Do té doby se nic nevydává."
          : "The third part is paid before originals are posted or a state portal is opened. Nothing is released before that.",
    9,
  );
  sheet.gap(8);
  sheet.seal();
  sheet.close();
  return save(await sheet.pdf.save(), `${opts.fileId}-invoice-${opts.tranche}.pdf`, Boolean(opts.hold));
}

const CONTRACT_EN: [string, string][] = [
  ["1. The parties", "This cooperation agreement is made between Vanguard Global Mobility s.r.o., with its seat at Rybná 716/24, Staré Město, 110 00 Praha 1, Czech Republic, entered in the commercial register kept by the Municipal Court in Prague, section C, insert 392810, company number 19842710 (the Practice), and the client named in the heading of this file (the Client). The Client's name, date of birth, citizenship, and telephone are those given in the questionnaire. Each party acts for itself. Neither party may bind the other toward the employer or toward a ministry."],
  ["2. What this agreement is", "The Practice prepares one work-permit file and supports its filing for the country, the permit, and the term written on the file. The agreement is with the Practice. It is not a contract of employment with the employer named on the opening, and it does not make the Practice the Client's employer, agent for hiring, or a recruitment agency selling a job. The confirmation of a place, where one is issued, only records the opening the Client chose."],
  ["3. The work", "The Practice checks the questionnaire, names the fee before a file is opened, assembles the papers the selected country asks for, coordinates the employer's documents, and files the matter through the steps shown in the Client's cabinet. A named person handles the file. The cabinet states which of the three payments is open, which paper is still missing, and which step the file is on. The Practice works on business days in Prague. A week stated in the calculator is the Practice's preparation time."],
  ["4. What the Practice does not do", "A ministry, or another public authority, issues, delays, or refuses the permit. The Practice is not that authority and does not speak for it. It does not warrant a grant, a date of grant, an entry, a visa sticker, or a decision of the employer. Nothing on the website, in a message, or in this agreement is a promise that the permit will be issued. Where a faster lane does not exist for that country, the Practice does not invent one."],
  ["5. The Client's answers", "The Client warrants that the questionnaire, and every document uploaded to the file, is true, complete, and the Client's own. A criminal record, a previous visa, a refusal, and travel with family are stated as they are. The Practice may refuse a file, or close it, if a material answer is false or if a paper does not belong to the Client. A false paper is not repaired by opening a second file under another name. The Client tells the Practice at once if a passport number, an address, or a family circumstance changes while the file is open."],
  ["6. The fee", "The fee is the euro amount fixed on the day the file was opened and printed in the table above. A later change of the public price list does not change this file. The fee is paid in three parts and never as one sum on the first day: 30 percent when the Practice accepts the file, 40 percent when the employer has cleared the filing on to the ministry, and 30 percent before originals are posted or access to a state portal is released. The three parts together are the whole fee. No further charge is added to an invoice for the same work."],
  ["7. Payment", "Each part is paid in USDT, on the network printed on that invoice, to the wallet the Practice has published for this file. The Client uploads a screenshot or a receipt in the case. The Practice confirms it before the file moves on. The first part is due within five days of acceptance. Without that proof the file closes and the seat returns to the opening. The second invoice gives fourteen days. The third part is due before anything is sent to the Client. A payment to a wallet that is not the one printed on the current invoice is not a payment to the Practice. The Practice does not ask for the fee in cash, by gift card, or through a private person."],
  ["8. Papers", "After acceptance the Client uploads a passport covering the term, a police clearance recent enough for that country, a photograph, the education papers the opening names, and a medical set when the permit asks for one. The Practice may decline a scan that cannot be read, and the Client replaces it on the same file. Copies released in the cabinet carry a watermark and are for the Client's own record. Originals, or a portal login, follow the third payment and are sent as the file then describes, by the route written there. The Client keeps the originals the Practice returns, and does not treat a watermarked copy as the permit itself."],
  ["9. One seat", "The Client holds one open case for one opening. Another country, another employer, or another permit is another case and another fee. The Practice does not open a file for an opening that has no places left, and does not move the Client onto a different opening without saying so on the file. A seat that is released for non-payment may be taken by another client."],
  ["10. If the permit is refused", "If the refusal is the Practice's fault, the Practice returns 90 percent of the fees the Client has actually paid to the Practice on this file. A refusal by a ministry that rests on the Client's own record, papers, answers, health, or a fact the Client did not give is not the Practice's fault, and the fee is not returned for that reason. A change of mind by the employer, or a delay that belongs to the authority, is not a refusal by the Practice. The return, where it is due, is made in USDT to a wallet the Client names in writing, after the refusal is on the file."],
  ["11. Stopping", "The Client may ask, in a message on the file, to stop. Parts already confirmed are payment for work done up to that day. They are not a deposit on a result, and they are not returned, except where article 10 applies or where Czech law forbids the Practice to keep them. The Practice may close a file for non-payment, for silence of more than fourteen days after a written request on the file, or for a material untruth. Closing is written on the file. It ends the duty to prepare further papers. It does not erase the record the Practice must keep."],
  ["12. Liability", "Liability for a mistake in the Practice's own preparation is limited to the fees actually paid on this file. The Practice is not liable for a ministry's delay or refusal, an employer's change of mind, a courier, a border officer, a wallet the Client mistyped, a network fee, or a fact the Client did not give. The Practice is not liable for lost wages, a ticket, a rent, or any other follow-on loss. Nothing in this article limits liability that Czech law does not allow to be limited."],
  ["13. Data", "The Practice keeps the questionnaire, the scans, the messages, and the payment proofs in order to perform this agreement and to meet its record-keeping duties. They are not sold and they are not used to advertise to the Client. Access is limited to the people named on the file and to those who must see a paper in order to file it. The Client may ask, in writing to the desk, what is held. The desk answers to the email or the cabinet, not by a public link."],
  ["14. Notices", "A notice under this agreement is given by a message on the file, or by email to the address each party has on the file. It is received on the day it is posted there. The Client keeps that email able to receive mail. The Practice's desk is desk@vanguard-mobility.cz and the telephone printed in the footer. A message in another chat, or a telephone call, does not change the fee, the refund, or the stage of the file unless the same thing is then written on the file."],
  ["15. Law and language", "Czech law governs this agreement. The courts of Prague have jurisdiction. The binding language of this agreement is English. Where a Czech text is also generated, it is a convenience for reading, and the English prevails if the two differ. A translation into any other language, including one shown on the website, is not a source of rights."],
  ["16. The whole agreement", "This agreement, the invoice for each part, and the confirmation of the place, if one was issued, are the whole agreement about this file. A change is effective only when it is written on the file. A spoken sentence, a caption, or an earlier draft does not change the fee or article 10. If a court holds one sentence unenforceable, the rest stays in force. The Client accepts by sending the questionnaire and paying the first part. The Practice accepts by moving the file out of the first stage. A wet-ink signature is not required. The round stamp identifies the Practice. The person named under the line is the client director, signing for the company and not in a personal capacity."],
];

const CONTRACT_CS: [string, string][] = [
  ["1. Strany", "Tato smlouva o spolupráci se uzavírá mezi Vanguard Global Mobility s.r.o., se sídlem Rybná 716/24, Staré Město, 110 00 Praha 1, Česká republika, zapsanou u Městského soudu v Praze, oddíl C, vložka 392810, IČO 19842710 (praxe), a klientem uvedeným v záhlaví spisu (klient). Jméno, datum narození, státní občanství a telefon jsou ty, které klient uvedl v dotazníku. Každá strana jedná sama za sebe. Ani jedna nemůže druhou zavazovat vůči zaměstnavateli ani vůči ministerstvu."],
  ["2. O co jde", "Praxe připraví jeden spis pracovního povolení a podporuje jeho podání pro zemi, povolení a dobu zapsané ve spise. Smlouva je s praxí. Není pracovní smlouvou se zaměstnavatelem u místa a praxe se nestává zaměstnavatelem klienta, jeho zástupcem při náboru ani agenturou, která prodává práci. Potvrzení místa, je-li vystaveno, jen zaznamenává místo, které si klient vybral."],
  ["3. Práce", "Praxe zkontroluje dotazník, pojmenuje honorář ještě před otevřením spisu, sestaví podklady, které zvolená země žádá, sladí dokumenty zaměstnavatele a vede věc kroky, které klient vidí ve své skříňce. Spis má jméno člověka, který ho vede. Skříňka říká, která ze tří plateb je otevřená, který papír chybí a na kterém kroku spis je. Praxe pracuje v pracovních dnech v Praze. Týden v kalkulačce je čas přípravy praxe."],
  ["4. Co praxe nedělá", "Povolení vydává, zdržuje nebo zamítá ministerstvo nebo jiný orgán. Praxe tím orgánem není a nemluví za něj. Neručí za kladné rozhodnutí, datum, vstup, vízový štítek ani za vůli zaměstnavatele. Nic na webu, ve zprávě ani v této smlouvě není slibem, že povolení bude vydáno. Kde pro danou zemi rychlejší dráha není, praxe ji nevymýšlí."],
  ["5. Odpovědi klienta", "Klient prohlašuje, že dotazník a každý dokument ve spise jsou pravdivé, úplné a jeho vlastní. Trest, předchozí vízum, zamítnutí a cesta s rodinou se uvádějí tak, jak jsou. Při podstatné nepravdě, nebo když papír klientovi nepatří, může praxe spis odmítnout nebo uzavřít. Vadný papír se nenapravuje otevřením druhého spisu pod jiným jménem. Klient praxi hned sdělí, změní-li se číslo pasu, adresa nebo rodinná okolnost, dokud je spis otevřen."],
  ["6. Honorář", "Honorář je částka v eurech stanovená v den otevření spisu a uvedená v tabulce výše. Pozdější ceník tento spis nemění. Platí se ve třech částech a nikdy jako jedna suma první den: 30 procent při přijetí, 40 procent když zaměstnavatel uvolní podání na ministerstvo, a 30 procent než se odešlou originály nebo uvolní přístup do státního portálu. Tři části dohromady jsou celý honorář. K téže práci se na fakturu nic dalšího nepřičítá."],
  ["7. Platba", "Každá část se hradí v USDT na síti uvedené na faktuře, na peněženku, kterou praxe pro tento spis zveřejnila. Klient nahraje snímek nebo potvrzení do spisu. Praxe je potvrdí, než se spis posune. První část je splatná do pěti dnů od přijetí. Bez dokladu se spis uzavře a místo se vrátí. Druhá faktura dává čtrnáct dní. Třetí část je splatná dříve, než se klientovi cokoli odešle. Platba na jinou peněženku, než je na aktuální faktuře, není platbou praxi. Praxe nežádá honorář v hotovosti, dárkovou kartou ani přes soukromou osobu."],
  ["8. Listiny", "Po přijetí klient nahrává pas na celou dobu, výpis z rejstříku trestů dostatečně čerstvý pro danou zemi, fotografii, doklady o vzdělání, které místo uvádí, a lékařskou sadu, žádá-li o ni povolení. Nečitelný sken lze odmítnout a klient ho nahradí v tomtéž spise. Kopie ve skříňce nesou vodoznak a jsou pro vlastní potřebu klienta. Originály nebo přístup do portálu následují až po třetí platbě, způsobem, který spis tehdy popíše. Klient si ponechá originály, které mu praxe vrátí, a vodoznakovou kopii nepovažuje za samotné povolení."],
  ["9. Jedno místo", "Klient drží jeden otevřený spis na jedno místo. Jiná země, jiný zaměstnavatel nebo jiné povolení je jiný spis a jiný honorář. Na místo bez volných míst se spis neotevírá a praxe klienta na jiné místo nepřesune, aniž by to zapsala do spisu. Místo uvolněné pro neplacení může obsadit jiný klient."],
  ["10. Když je povolení zamítnuto", "Je-li zamítnutí vinou praxe, praxe vrátí 90 procent honoráře, který jí klient na tomto spise skutečně zaplatil. Zamítnutí ministerstvem kvůli vlastnímu záznamu, listinám, odpovědím, zdraví nebo údaji, který klient nedal, vinou praxe není a honorář se z toho důvodu nevrací. Změna vůle zaměstnavatele nebo průtah, který patří úřadu, není zamítnutím ze strany praxe. Vrácení, je-li na místě, se provede v USDT na peněženku, kterou klient písemně označí, až je zamítnutí ve spise."],
  ["11. Skončení", "Klient může zprávou ve spise požádat o zastavení. Už potvrzené části jsou platbou za práci vykonanou do toho dne. Nejsou zálohou na výsledek a nevracejí se, leda podle článku 10 nebo tam, kde to české právo zakáže. Praxe může spis uzavřít pro neplacení, pro mlčení delší než čtrnáct dní po písemné výzvě ve spise, nebo pro podstatnou nepravdu. Uzavření se zapíše do spisu. Končí jím povinnost připravovat další listiny. Nemaze záznam, který praxe musí uchovat."],
  ["12. Odpovědnost", "Odpovědnost za chybu ve vlastní přípravě je omezena na honorář skutečně zaplacený na tomto spise. Praxe neodpovídá za průtah nebo zamítnutí úřadu, změnu vůle zaměstnavatele, kurýra, orgán na hranici, chybně opsanou peněženku, poplatek sítě ani za údaj, který klient nedal. Neodpovídá za ušlou mzdu, letenku, nájem ani za jinou následnou škodu. Tento článek neomezuje odpovědnost, kterou české právo nedovoluje omezit."],
  ["13. Údaje", "Praxe uchovává dotazník, skeny, zprávy a doklady o platbě, aby smlouvu splnila a dostála archivačním povinnostem. Nepřeprodávají se a neslouží k reklamě vůči klientovi. Přístup mají lidé uvedení na spise a ti, kteří papír musí vidět, aby věc podali. Klient se může písemně na stole zeptat, co je uloženo. Stůl odpovídá na e-mail nebo do skříňky, ne veřejným odkazem."],
  ["14. Oznámení", "Oznámení podle této smlouvy se dává zprávou ve spise nebo e-mailem na adresu, kterou má strana ve spise. Dojde dnem, kdy je tam zveřejněno. Klient udržuje ten e-mail schopný poštu přijmout. Stůl praxe je desk@vanguard-mobility.cz a telefon v zápatí. Zpráva v jiném chatu nebo telefonát nemění honorář, vrácení ani stupeň spisu, dokud totéž není zapsáno ve spise."],
  ["15. Právo a jazyk", "Řídí se českým právem. Příslušné jsou soudy v Praze. Závazné znění této smlouvy je anglické. České znění, je-li vyhotoveno, je pomůckou ke čtení a při rozporu ustupuje anglickému. Překlad do jiného jazyka, včetně jazyka na webu, není pramenem práv."],
  ["16. Celá smlouva", "Tato smlouva, faktura ke každé části a potvrzení místa, bylo-li vystaveno, jsou celou dohodou o tomto spise. Změna platí, jen když je zapsána ve spise. Ústní věta, popisek ani dřívější návrh nemění honorář ani článek 10. Prohlásí-li soud jednu větu za nevymahatelnou, zbytek zůstává. Klient přijímá odesláním dotazníku a zaplacením první části. Praxe přijímá posunem spisu z prvního stupně. Podpis perem se u elektronického spisu nevyžaduje. Kulaté razítko označuje praxi. Osoba pod linkou je ředitelka pro klienty a podepisuje za společnost, nikoli osobně."],
];

export async function buildContract(opts: {
  lang: "en" | "cs" | "ur";
  settings: Settings;
  fileId: string;
  client: string;
  q: Questionnaire;
  country: string;
  permit: string;
  duration: string;
  total: number;
  date: string;
  hold?: boolean;
}) {
  const cs = opts.lang === "cs";
  const sheet = await open(opts.settings, cs);
  const parts = tranches(opts.total);
  sheet.heading(cs ? "Smlouva o spolupráci" : "Cooperation agreement", [
    `${cs ? "Spis" : "File"}\t${opts.fileId}`,
    `${cs ? "Datum" : "Date"}\t${opts.date}`,
    `${cs ? "Místo" : "Place"}\tPraha`,
  ]);
  const person = [
    opts.client || "—",
    opts.q.birthDate ? `${cs ? "narozen(a)" : "born"} ${opts.q.birthDate}` : "",
    opts.q.citizenship,
    opts.q.phone,
  ].filter(Boolean);
  sheet.boxes(cs ? "Praxe" : "Practice", firmLines(opts.settings), cs ? "Klient" : "Client", person);
  sheet.write(`${cs ? "Předmět" : "Matter"}    ${opts.country}  ·  ${opts.permit}, ${opts.duration}`, 10, sheet.bold);
  sheet.gap(6);
  sheet.write(
    cs
      ? "Smlouva se týká jen tohoto spisu. Není pracovní smlouvou a není slibem, že ministerstvo povolení vydá."
      : "This agreement covers this file only. It is not a contract of employment, and it is not a promise that a ministry will issue the permit.",
    9,
  );
  sheet.gap(6);
  sheet.table(
    [cs ? "Část" : "Part", cs ? "Kdy" : "When", cs ? "Částka" : "Amount"],
    [
      ["30 %", cs ? "při přijetí spisu" : "when the file is accepted", money(parts.first)],
      ["40 %", cs ? "když zaměstnavatel uvolní ministerstvo" : "when the employer clears the ministry", money(parts.second)],
      ["30 %", cs ? "před odesláním dokumentů" : "before the documents are sent", money(parts.final)],
      [cs ? "Celkem" : "Total", cs ? "sjednáno při otevření, bez další přirážky" : "fixed when the file opened, nothing added", money(opts.total)],
    ],
    [70, 300, 133],
    3,
  );
  if (opts.lang === "ur") {
    sheet.write("The binding text of this agreement is English.", 9, sheet.bold);
    sheet.gap(4);
  }
  for (const [heading, body] of cs ? CONTRACT_CS : CONTRACT_EN) {
    sheet.need(46);
    sheet.write(heading, 11, sheet.bold);
    sheet.gap(2);
    sheet.write(body, 9, sheet.font, INK, 3.4);
    sheet.gap(7);
  }
  sheet.gap(2);
  sheet.seal();
  sheet.close();
  return save(await sheet.pdf.save(), `${opts.fileId}-agreement.pdf`, Boolean(opts.hold));
}

export async function buildOffer(opts: {
  lang: "en" | "cs" | "ur";
  settings: Settings;
  fileId: string;
  client: string;
  country: string;
  title: string;
  employer: string;
  salary: string;
  hours: string;
  housing: string;
  date: string;
  hold?: boolean;
}) {
  const cs = opts.lang === "cs";
  const sheet = await open(opts.settings, cs);
  sheet.heading(cs ? "Potvrzení místa" : "Confirmation of a place", [
    `${cs ? "Spis" : "File"}\t${opts.fileId}`,
    `${cs ? "Datum" : "Date"}\t${opts.date}`,
    `${cs ? "Místo" : "Place"}\tPraha`,
  ]);
  sheet.write(opts.client || "—", 13, sheet.bold);
  sheet.gap(6);
  sheet.write(
    cs
      ? "Vážený kliente, tímto listem Vanguard Global Mobility s.r.o. potvrzuje, že ve vašem spise je drženo jedno konkrétní místo. List není pracovní smlouvou. Smlouvu o přípravě povolení uzavíráte s praxí, nikoli se zaměstnavatelem. Zaměstnavatel potvrzuje nástup zvlášť, až spis dojde k jeho kroku."
      : "This letter confirms that Vanguard Global Mobility s.r.o. holds one concrete place on your file. It is not a contract of employment. The agreement to prepare the permit is with the Practice, not with the employer. The employer confirms the start separately, when the file reaches that step.",
    10,
    sheet.font,
    INK,
    4,
  );
  sheet.gap(8);
  sheet.table(
    [cs ? "Údaj" : "Particular", cs ? "Zápis ve spise" : "As written on the file"],
    [
      [cs ? "Země" : "Country", opts.country || "—"],
      [cs ? "Místo" : "Place", opts.title || "—"],
      [cs ? "Zaměstnavatel" : "Employer", opts.employer || "—"],
      [cs ? "Čistá mzda" : "Net pay", opts.salary || "—"],
      [cs ? "Úvazek" : "Hours", opts.hours || "—"],
      [cs ? "Ubytování" : "Housing", opts.housing || "—"],
    ],
    [150, 353],
  );
  sheet.write(cs ? "Co z tohoto listu plyne" : "What follows from this letter", 11, sheet.bold);
  sheet.gap(3);
  const steps = cs
    ? [
        "1. Místo zůstává ve spise, dokud je spis otevřený a místo má volnou kapacitu.",
        "2. Mzda, úvazek a ubytování jsou ty, které byly u místa zveřejněny v den, kdy jste ho obsadili.",
        "3. Nezavazují zaměstnavatele dřív, než vydá vlastní potvrzení.",
        "4. Ministerstvo stále rozhoduje o povolení. Tento list mu nepředchází a nenahrazuje ho.",
      ]
    : [
        "1. The place stays on the file while the file is open and the place still has room.",
        "2. Pay, hours, and housing are those published for the place on the day you took it.",
        "3. They do not bind the employer before the employer's own confirmation.",
        "4. A ministry still decides the permit. This letter does not come before that decision and does not replace it.",
      ];
  for (const step of steps) {
    sheet.write(step, 10);
    sheet.gap(2);
  }
  sheet.gap(8);
  sheet.seal();
  sheet.close();
  return save(await sheet.pdf.save(), `${opts.fileId}-offer.pdf`, Boolean(opts.hold));
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function downloadStamped(dataUrl: string, fileName: string, mime: string) {
  if (mime === "application/pdf") {
    const src = await PDFDocument.load(dataUrlToBytes(dataUrl));
    src.registerFontkit(fontkit);
    const raw = await fonts();
    const font = await src.embedFont(raw.boldBytes);
    for (const page of src.getPages()) {
      const { width, height } = page.getSize();
      page.drawText("VANGUARD COPY", {
        x: Math.max(24, width / 2 - 110),
        y: height / 2,
        size: Math.min(28, width / 16),
        font,
        color: rgb(0.55, 0.12, 0.12),
        opacity: 0.45,
        rotate: degrees(28),
      });
    }
    save(await src.save(), fileName.replace(/\.pdf$/i, "") + "-copy.pdf");
    return;
  }
  if (mime.startsWith("image/")) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-0.45);
    ctx.fillStyle = "rgba(120,20,20,0.38)";
    ctx.font = `${Math.max(28, Math.round(canvas.width / 14))}px Times New Roman, serif`;
    ctx.textAlign = "center";
    ctx.fillText("VANGUARD COPY", 0, 0);
    ctx.restore();
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/jpeg", 0.92);
    a.download = fileName.replace(/\.\w+$/, "") + "-copy.jpg";
    a.click();
    return;
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}
