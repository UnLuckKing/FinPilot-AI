import { readFile } from "node:fs/promises";

const files = ["tradingview/FinPilot_Universal_Radar.pine", "tradingview/FinPilot_Deep_Analyzer.pine"];
let failed = false;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const checks = [
    [source.startsWith("//@version=6"), "Pine v6 başlığı"],
    [source.includes("barstate.isconfirmed"), "kapanmış mum kontrolü"],
    [source.includes("VERİ YETERSİZ"), "veri yetersiz durumu"],
    [source.includes("YATIRILABİLİR"), "ara karar durumu"],
    [!source.includes("strategy.entry"), "emir gönderen strategy.entry bulunmaması"],
    [!source.includes("strategy.order"), "emir gönderen strategy.order bulunmaması"],
    [!source.includes("lookahead = barmerge.lookahead_off"), "üst zaman dilimi politikasının sabit olması"],
    [(source.match(/request\.security\(/gu) ?? []).length <= 5, "en fazla beş request.security çağrısı"]
  ];
  for (const [ok, label] of checks) {
    if (!ok) { failed = true; console.error(`FAIL ${file}: ${label}`); }
  }
  const braces = balance(source, "{", "}");
  const parentheses = balance(source, "(", ")");
  if (braces !== 0 || parentheses !== 0) { failed = true; console.error(`FAIL ${file}: parantez dengesi ${braces}/${parentheses}`); }
  if (!failed) console.log(`OK ${file}`);
}

if (failed) process.exit(1);
console.log("Pine statik güvenlik kontrolleri geçti. Kesin derleme TradingView Pine Editor içinde yapılmalıdır.");

function balance(source, open, close) {
  let count = 0;
  let quoted = false;
  let escaped = false;
  for (const char of source) {
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === open) count += 1;
    if (char === close) count -= 1;
  }
  return count;
}
