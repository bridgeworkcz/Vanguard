import { ensureVaultFolders } from "./drive";
import { ensureAllSheets, type SheetPrep } from "./sheets";

export type WorkspacePrep = { sheets: SheetPrep[]; folders: string[] };

let pending: Promise<WorkspacePrep> | null = null;
let cooldownUntil = 0;
let ready: WorkspacePrep | null = null;

/** Create missing spreadsheet tabs once per server process. A busy minute must not lock sign-in. */
export function prepareGoogle(): Promise<WorkspacePrep> {
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;
  if (Date.now() < cooldownUntil) return Promise.resolve({ sheets: [], folders: [] });
  pending = run()
    .then((value) => {
      ready = value;
      return value;
    })
    .catch((err) => {
      pending = null;
      const message = err instanceof Error ? err.message : "";
      if (message.includes("busy") || message.includes("429")) cooldownUntil = Date.now() + 60_000;
      throw err;
    });
  return pending;
}

async function run(): Promise<WorkspacePrep> {
  const sheets = await ensureAllSheets();
  let folders: string[] = [];
  if (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim()) {
    try {
      folders = await ensureVaultFolders();
    } catch (err) {
      console.error("[google] vault folders were not created", err);
    }
  }
  const conflicts = sheets.filter((item) => item.action === "conflict");
  if (conflicts.length) console.warn("[google] tabs left unchanged because headers differ", conflicts);
  console.log("[google] workspace", {
    sheets: sheets.map((item) => `${item.name}:${item.action}`),
    folders,
  });
  return { sheets, folders };
}
