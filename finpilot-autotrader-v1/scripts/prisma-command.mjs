import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const databaseUrl = process.env.DATABASE_URL || "file:../data/finpilot.db";
if (databaseUrl.startsWith("file:")) {
  const rawPath = databaseUrl.slice(5).split("?")[0];
  if (rawPath) {
    const databasePath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), "prisma", rawPath);
    mkdirSync(dirname(databasePath), { recursive: true });
    if (!existsSync(databasePath)) closeSync(openSync(databasePath, "a"));
  }
}
const result = spawnSync(command, ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

process.exit(result.status ?? 1);
