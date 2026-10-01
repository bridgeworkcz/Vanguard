import { ensureVaultFolders } from "./drive";
import { ensureAllSheets, type SheetPrep } from "./sheets";

export type WorkspacePrep = { sheets: SheetPrep[]; folders: string[] };

let pending: Promise<WorkspacePrep> | null = null;

/** Create missing spreadsheet tabs and Drive folders. Safe to call on every cold start. */
export function prepareGoogle(): Promise<WorkspacePrep> {
  if (!pending) {
    pending = run().catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

async function run(): Promise<WorkspacePrep> {
  const sheets = await ensureAllSheets();
  const folders = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() ? await ensureVaultFolders() : [];
  const conflicts = sheets.filter((item) => item.action === "conflict");
  if (conflicts.length) console.warn("[google] tabs left unchanged because headers differ", conflicts);
  console.log("[google] workspace", {
    sheets: sheets.map((item) => `${item.name}:${item.action}`),
    folders,
  });
  return { sheets, folders };
}
