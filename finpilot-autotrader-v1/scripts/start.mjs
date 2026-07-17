import { spawnSync, spawn } from "node:child_process";

const node = process.execPath;
const environment = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:../data/finpilot.db" };
const migrate = spawnSync(node, ["scripts/prisma-command.mjs", "migrate", "deploy"], { stdio: "inherit", env: environment });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const child = spawn(node, ["apps/api/dist/index.js"], { stdio: "inherit", env: environment });
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
