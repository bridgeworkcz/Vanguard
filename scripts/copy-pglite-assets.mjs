import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("@electric-sql/pglite"));
const libs = join(process.cwd(), ".vercel/output/functions/__server.func/_libs");
if (!existsSync(libs)) {
  console.log("[pglite] nitro output missing, skip asset copy");
  process.exit(0);
}
mkdirSync(libs, { recursive: true });
for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  const from = join(dist, name);
  if (!existsSync(from)) continue;
  copyFileSync(from, join(libs, name));
}
const bundled = readdirSync(libs).some((f) => f.startsWith("electric-sql__pglite"));
if (!bundled) console.log("[pglite] bundle not found, assets copied anyway");
else console.log("[pglite] wasm and data copied next to the server bundle");
