import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const [, , inputPath, outputDirectory = "./watchlists/split"] = process.argv;
if (!inputPath) {
  console.error("Kullanım: node scripts/split-watchlist.mjs <liste.txt> [çıktı-klasörü]");
  process.exit(1);
}

const source = await readFile(resolve(inputPath), "utf8");
const symbols = [...new Set(source.split(/[\s,;]+/u).map((value) => value.trim()).filter(Boolean))];
if (!symbols.length) {
  console.error("Listede sembol bulunamadı.");
  process.exit(1);
}
await mkdir(resolve(outputDirectory), { recursive: true });
const base = basename(inputPath).replace(/\.txt$/iu, "");
const chunks = [];
for (let index = 0; index < symbols.length; index += 1000) chunks.push(symbols.slice(index, index + 1000));
for (let index = 0; index < chunks.length; index += 1) {
  const file = join(resolve(outputDirectory), `${base}-${String(index + 1).padStart(2, "0")}.txt`);
  await writeFile(file, `${chunks[index].join(",")}\n`, "utf8");
  console.log(`${file}: ${chunks[index].length} sembol`);
}
console.log(`Toplam ${symbols.length} benzersiz sembol, ${chunks.length} dosya.`);
