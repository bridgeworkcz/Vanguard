import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { tranches, type Questionnaire } from "./domain";

type Settings = Record<string, string>;

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
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function save(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function docBase() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const raw = await fonts();
  const font = await pdf.embedFont(raw.regularBytes!);
  const bold = await pdf.embedFont(raw.boldBytes);
  return { pdf, font, bold };
}

function header(page: PDFPage, bold: PDFFont, font: PDFFont, entity: string) {
  page.drawRectangle({ x: 0, y: 802, width: 595, height: 40, color: rgb(0.035, 0.035, 0.035) });
  page.drawText("VANGUARD", { x: 40, y: 816, size: 13, font: bold, color: rgb(0.96, 0.95, 0.93) });
  page.drawText("GLOBAL MOBILITY", { x: 128, y: 816, size: 9, font, color: rgb(0.85, 0.78, 0.66) });
  const line = entity.length > 70 ? entity.slice(0, 70) : entity;
  page.drawText(line, { x: 40, y: 786, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
}

function stamp(page: PDFPage, font: PDFFont, bold: PDFFont) {
  page.drawEllipse({
    x: 500,
    y: 78,
    xScale: 54,
    yScale: 36,
    borderColor: rgb(0.45, 0.12, 0.12),
    borderWidth: 1.4,
  });
  page.drawEllipse({
    x: 500,
    y: 78,
    xScale: 48,
    yScale: 30,
    borderColor: rgb(0.45, 0.12, 0.12),
    borderWidth: 0.6,
  });
  page.drawText("VANGUARD", { x: 472, y: 82, size: 8, font: bold, color: rgb(0.45, 0.12, 0.12) });
  page.drawText("s.r.o.", { x: 486, y: 70, size: 7, font, color: rgb(0.45, 0.12, 0.12) });
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
}) {
  const cs = opts.lang === "cs";
  const parts = tranches(opts.total);
  const amount = opts.tranche === 1 ? parts.first : opts.tranche === 2 ? parts.second : parts.final;
  const { pdf, font, bold } = await docBase();
  const page = pdf.addPage([595.28, 841.89]);
  const entity = opts.settings.legal_entity || "Vanguard Global Mobility s.r.o.";
  header(page, bold, font, entity);
  page.drawText(cs ? `Faktura ${opts.tranche}` : `Invoice ${opts.tranche}`, {
    x: 40,
    y: 750,
    size: 22,
    font: bold,
    color: rgb(0.05, 0.05, 0.05),
  });
  page.drawText(opts.fileId, { x: 40, y: 730, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  page.drawText(opts.date, { x: 430, y: 730, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  const meta: [string, string][] = [
    [cs ? "Klient" : "Client", opts.client || "—"],
    [cs ? "Země" : "Country", opts.country],
    [cs ? "Povolení" : "Permit", `${opts.permit}, ${opts.duration}`],
    [cs ? "Zaměstnavatel" : "Employer", opts.employer || "—"],
    [cs ? "Celkem" : "Total fee", `${opts.total} EUR`],
  ];
  let y = 700;
  for (const [k, v] of meta) {
    page.drawText(k, { x: 40, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(v.slice(0, 70), { x: 170, y, size: 10, font: bold, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }
  y -= 8;
  const rows: [string, number, boolean][] = [
    [cs ? "1. část · 30 %" : "Part 1 · 30%", parts.first, opts.tranche === 1],
    [cs ? "2. část · 40 %" : "Part 2 · 40%", parts.second, opts.tranche === 2],
    [cs ? "3. část · 30 %" : "Part 3 · 30%", parts.final, opts.tranche === 3],
  ];
  for (const [label, value, on] of rows) {
    if (on) page.drawRectangle({ x: 36, y: y - 6, width: 520, height: 22, color: rgb(0.07, 0.07, 0.07) });
    page.drawText(label, { x: 44, y, size: 11, font: bold, color: on ? rgb(0.96, 0.95, 0.93) : rgb(0.2, 0.2, 0.2) });
    page.drawText(`${value} EUR`, {
      x: 450,
      y,
      size: 11,
      font: bold,
      color: on ? rgb(0.85, 0.78, 0.66) : rgb(0.2, 0.2, 0.2),
    });
    y -= 28;
  }
  const due =
    opts.tranche === 1
      ? cs
        ? "Splatnost: 5 dní od přijetí spisu. Bez dokladu o platbě se spis uzavře."
        : "Due within 5 days of acceptance. Without proof of payment the file closes."
      : opts.tranche === 2
        ? cs
          ? "Na tuto část je 14 dní ode dne, kdy zaměstnavatel uvolnil podání na ministerstvo."
          : "14 days are given for this part, from the day the employer cleared the ministry filing."
        : cs
          ? "Splatné dříve, než by povolení propadlo, a dříve než se originály nebo přístup do portálu uvolní."
          : "Due before the permit would lapse, and before originals or portal access are released.";
  const wallet = opts.settings.usdt_wallet?.trim();
  const network = opts.settings.usdt_network || "TRC-20 (TRON)";
  const pay = wallet
    ? cs
      ? `Platba v USDT, síť ${network}. Peněženka: ${wallet}. Do poznámky uveďte číslo spisu, pokud to síť dovolí. Potvrzení nahrajte ve svém spise.`
      : `Pay in USDT on ${network}. Wallet: ${wallet}. Put the file number in the note if the network allows it. Upload the receipt in your case.`
    : cs
      ? "Praxe zatím nezveřejnila peněženku. Neposílejte prostředky, dokud vám stůl adresu nesdělí."
      : "The practice has not published a wallet yet. Do not send funds until the desk gives you the address.";
  const legal = [opts.settings.legal_address, `ID ${opts.settings.registration_number} · VAT ${opts.settings.vat_number}`, opts.settings.court_record]
    .filter(Boolean)
    .join("\n");
  y -= 6;
  for (const line of wrap([due, pay, legal].join("\n\n"), font, 9, 510)) {
    if (y < 100) break;
    page.drawText(line, { x: 40, y, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 12;
  }
  stamp(page, font, bold);
  page.drawText(cs ? "K úhradě nyní" : "Due now", { x: 40, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`${amount} EUR`, { x: 40, y: 28, size: 16, font: bold, color: rgb(0.05, 0.05, 0.05) });
  save(await pdf.save(), `${opts.fileId}-invoice-${opts.tranche}.pdf`);
}

const CONTRACT_EN: [string, string][] = [
  ["1. Parties", "This agreement is between Vanguard Global Mobility s.r.o. (the Practice) and the client named on the file (the Client). It covers preparation and filing support for one work-permit matter. It is not an employment contract with the employer named on the opening."],
  ["2. What the Practice does", "The Practice checks the questionnaire, assembles the permit file, coordinates the employer's papers, and files what the selected country asks for. A person is named on the file. The Practice is not the ministry and does not employ the Client."],
  ["3. No promise of a permit", "A work permit is issued, delayed, or refused by a public authority. The Practice does not warrant a grant, a date, or an employer decision. Time in the calculator is preparation time, not the authority's time."],
  ["4. The Client's facts", "The Client warrants that the ten answers, and every uploaded document, are true. A conviction, a previous visa, and travel with family are stated as they are. The Practice may decline or close a file that rests on a false answer."],
  ["5. Fee, in three parts", "The fee is the euro sum fixed when the file was opened. It is payable as 30 percent when the Practice accepts the file, 40 percent when the employer has cleared the filing onward to the ministry, and 30 percent before originals are posted or portal access is released. Later changes to the public price list do not change this file."],
  ["6. How to pay", "Payment is in USDT on the network printed on the invoice, to the wallet the Practice has published. The Client uploads a screenshot or receipt. The Practice confirms it before the file moves. Five days after acceptance, a file with no proof of the first part closes. The second invoice gives 14 days. The third part is due before the permit would lapse."],
  ["7. Documents", "From acceptance the Client uploads the passport, police clearance, photograph, education, medical papers, and anything else the opening requires. An unreadable scan may be rejected. Final copies in the case carry a watermark. Originals, or a login to a state portal, move only after the third part, by the means written on the file."],
  ["8. Closing", "The Client may ask to stop. Parts already confirmed are not a deposit on a result and are not returned, except where Czech law forbids that. The Practice may close a file for non-payment, for silence after a written request, or for a material untruth."],
  ["9. Liability", "Liability for a mistake in the Practice's own preparation is limited to the fees actually paid on this file. The Practice is not liable for a ministry's delay, an employer's change of mind, a courier, or a fact the Client did not give."],
  ["10. Data", "The Practice keeps the questionnaire, documents, and payment proofs to perform this agreement and to meet record-keeping duties. They are not sold. Access is limited to people on the file."],
  ["11. Law", "Czech law governs. The courts of Prague have jurisdiction. The binding language is English. A Czech text, where generated, yields to the English if they differ."],
  ["12. Acceptance", "The Client accepts by submitting the questionnaire and paying the first part. The Practice accepts by moving the file out of processing. A wet-ink signature is not required for the electronic file. The stamp identifies the Practice."],
];

const CONTRACT_CS: [string, string][] = [
  ["1. Strany", "Tato smlouva je mezi Vanguard Global Mobility s.r.o. (praxe) a klientem uvedeným ve spise (klient). Týká se přípravy a podpory podání jednoho pracovního povolení. Není pracovní smlouvou se zaměstnavatelem u místa."],
  ["2. Co praxe dělá", "Praxe zkontroluje dotazník, sestaví spis, sladí podklady zaměstnavatele a podá to, co zvolená země žádá. Na spise je jméno člověka. Praxe není ministerstvo a klienta nezaměstnává."],
  ["3. Žádný slib povolení", "Pracovní povolení vydává, zdržuje nebo zamítá orgán veřejné moci. Praxe neručí za kladné rozhodnutí, datum ani za rozhodnutí zaměstnavatele. Čas v kalkulačce je čas přípravy, ne čas úřadu."],
  ["4. Údaje klienta", "Klient prohlašuje, že deset odpovědí a každý dokument jsou pravdivé. Odsouzení, předchozí vízum a cesta s rodinou se uvádějí tak, jak jsou. Nepravdivý spis může praxe odmítnout nebo uzavřít."],
  ["5. Honorář ve třech částech", "Honorář je částka v eurech stanovená při otevření spisu. Platí se 30 procent při přijetí, 40 procent když zaměstnavatel uvolní podání na ministerstvo, a 30 procent než se odešlou originály nebo uvolní přístup do portálu. Pozdější ceník tento spis nemění."],
  ["6. Jak platit", "Platba je v USDT na síti z faktury, na zveřejněnou peněženku. Klient nahraje snímek nebo potvrzení. Praxe je potvrdí, než se spis posune. Pět dní po přijetí se spis bez dokladu o první části uzavře. Druhá faktura dává 14 dní. Třetí část je splatná dříve, než by povolení propadlo."],
  ["7. Dokumenty", "Od přijetí klient nahrává pas, výpis z rejstříku trestů, fotografii, vzdělání, lékařské zprávy a další, co místo vyžaduje. Nečitelný sken lze odmítnout. Závěrečné kopie nesou vodoznak. Originály nebo přístup do portálu jdou až po třetí části, způsobem zapsaným ve spise."],
  ["8. Ukončení", "Klient může požádat o zastavení. Už potvrzené části nejsou zálohou na výsledek a nevracejí se, ledaže to české právo zakáže. Praxe může spis uzavřít pro neplacení, mlčení po výzvě, nebo podstatnou nepravdu."],
  ["9. Odpovědnost", "Odpovědnost za chybu ve vlastní přípravě je omezena na honorář skutečně zaplacený na tomto spise. Praxe neodpovídá za průtah úřadu, změnu vůle zaměstnavatele, kurýra, ani za údaj, který klient nedal."],
  ["10. Údaje", "Praxe uchovává dotazník, dokumenty a doklady o platbě, aby smlouvu splnila. Neprodávají se. Přístup mají lidé na spise."],
  ["11. Právo", "Řídí se českým právem. Příslušné jsou soudy v Praze. Závazné znění je anglické. České znění je pomůckou a při rozporu ustupuje."],
  ["12. Přijetí", "Klient přijímá odesláním dotazníku a první platbou. Praxe přijímá posunem spisu ze zpracování. Podpis perem se nevyžaduje. Razítko označuje praxi."],
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
}) {
  const sections = opts.lang === "cs" ? CONTRACT_CS : CONTRACT_EN;
  const { pdf, font, bold } = await docBase();
  const entity = opts.settings.legal_entity || "Vanguard Global Mobility s.r.o.";
  let page = pdf.addPage([595.28, 841.89]);
  header(page, bold, font, entity);
  let y = 748;
  const paint = (text: string, size: number, used: PDFFont) => {
    for (const line of wrap(text, used, size, 515)) {
      if (y < 78) {
        page = pdf.addPage([595.28, 841.89]);
        header(page, bold, font, entity);
        y = 748;
      }
      if (line) page.drawText(line, { x: 40, y, size, font: used, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 4;
    }
  };
  paint(opts.lang === "cs" ? "Smlouva o spolupráci" : "Cooperation agreement", 18, bold);
  y -= 4;
  paint(
    [
      `${opts.fileId} · ${opts.date}`,
      `${opts.client || "—"} · ${opts.country}`,
      `${opts.permit}, ${opts.duration} · ${opts.total} EUR`,
      opts.lang === "ur" ? "The binding text of this agreement is English." : "",
      opts.settings.legal_address || "",
      `ID ${opts.settings.registration_number || ""} · VAT ${opts.settings.vat_number || ""}`,
      opts.settings.court_record || "",
    ]
      .filter(Boolean)
      .join("\n"),
    9,
    font,
  );
  y -= 8;
  for (const [h, body] of sections) {
    paint(h, 11, bold);
    paint(body, 9, font);
    y -= 6;
  }
  if (y < 130) {
    page = pdf.addPage([595.28, 841.89]);
    header(page, bold, font, entity);
  }
  stamp(page, font, bold);
  page.drawText(opts.client || "Client", { x: 40, y: 70, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(opts.date, { x: 40, y: 54, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
  void opts.q;
  save(await pdf.save(), `${opts.fileId}-agreement.pdf`);
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
