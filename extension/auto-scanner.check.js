const assert = require("node:assert/strict");
require("./engine.js");
const scanner = require("./auto-scanner.js");

function payload(count = 520) {
  let close = 100;
  const value = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(2024, 0, 1 + index));
    const drift = 0.15 + Math.sin(index / 9) * 0.35;
    const open = close;
    close = Math.max(1, close + drift);
    value.push({
      HGDG_TARIH: `/Date(${date.getTime()})/`,
      HGDG_ACILIS: open,
      HGDG_MAX: Math.max(open, close) + 0.8,
      HGDG_MIN: Math.min(open, close) - 0.7,
      HGDG_KAPANIS: close,
      HGDG_HACIM: 1_000_000 + index * 1_000,
    });
  }
  return { value: value.reverse() };
}

const rows = scanner.parseIsYatirimRows(payload());
assert.equal(rows.length, 520);
assert.ok(rows[0].timestamp < rows.at(-1).timestamp);
assert.equal(scanner.parseNumber("1.234,56"), 1234.56);
const officialRow = scanner.parseIsYatirimRows({ value: [{ HGDG_TARIH: "16-07-2024", HGDG_KAPANIS: 33.88, HGDG_MAX: 34.35, HGDG_MIN: 33.49, HGDG_AOF: 33.95, HGDG_HACIM: 234060919 }] });
assert.equal(officialRow[0].time, "2024-07-16");
assert.equal(officialRow[0].open, 33.95);

const fundamentalsFixture = `
<table data-csvname="temelozet"><tbody>
<tr><td><a href="?hisse=THYAO">THYAO</a></td><td>Türk Hava Yolları</td><td>Havayolları</td><td>330,00</td><td>455.400,0</td><td>9.678,7</td><td>50,2</td><td>1.380,0</td></tr>
<tr><td><a href="?hisse=PGSUS">PGSUS</a></td><td>Pegasus</td><td>Havayolları</td><td>250,00</td><td>200.000,0</td><td>4.200,0</td><td>43,0</td><td>700,0</td></tr>
<tr><td><a href="?hisse=ASELS">ASELS</a></td><td>Aselsan</td><td>Savunma</td><td>180,00</td><td>300.000,0</td><td>6.300,0</td><td>25,0</td><td>2.280,0</td></tr>
</tbody></table>
<table data-csvname="temelfinansal"><tbody>
<tr><td><a href="?hisse=THYAO">THYAO</a></td><td>330,00</td><td>3,2</td><td>5,3</td><td>0,9</td><td>0,5</td><td>3/2026</td></tr>
<tr><td><a href="?hisse=PGSUS">PGSUS</a></td><td>250,00</td><td>7,0</td><td>8,0</td><td>1,3</td><td>1,2</td><td>3/2026</td></tr>
<tr><td><a href="?hisse=ASELS">ASELS</a></td><td>180,00</td><td>18,0</td><td>14,0</td><td>4,0</td><td>5,0</td><td>3/2026</td></tr>
</tbody></table>`;
const parsedFundamentals = scanner.parseFundamentalsHtml(fundamentalsFixture);
assert.equal(parsedFundamentals.get("THYAO").sector, "Havayolları");
assert.equal(parsedFundamentals.get("THYAO").pe, 3.2);
assert.equal(parsedFundamentals.get("THYAO").marketCapTryM, 455400);
assert.ok(parsedFundamentals.get("THYAO").score > parsedFundamentals.get("PGSUS").score);

assert.equal(scanner.tickSizeForPrice(19.99), 0.01);
assert.equal(scanner.tickSizeForPrice(20), 0.02);
assert.equal(scanner.tickSizeForPrice(312.5), 0.25);
assert.equal(scanner.roundToTick(312.63, "down"), 312.5);
assert.equal(scanner.businessDaysAge("2026-07-17", new Date("2026-07-20T12:00:00Z")), 1);

const kapDirectory = scanner.parseKapDirectoryHtml('<a href="/tr/sirket-bilgileri/ozet/1107-turk-hava-yollari-a-o">THYAO</a>');
assert.match(kapDirectory.get("THYAO").url, /1107-turk-hava-yollari/);
assert.equal(scanner.parseKapMemberId('<a href="/tr/bildirim-sorgu-sonuc?member=4028e4a140f2ed720140f376bebb01a7">Bildirimler</a>'), "4028e4a140f2ed720140f376bebb01a7");
const kapSafe = scanner.parseKapDisclosuresHtml('<table><tr><td>15.07.2026</td><td>THYAO</td><td>Haziran trafik sonuçları</td></tr></table>', "THYAO", new Date("2026-07-16T12:00:00Z"));
assert.equal(kapSafe.available, true);
assert.equal(kapSafe.blocked, false);
const kapBlocked = scanner.parseKapDisclosuresHtml('<table><tr><td>15.07.2026</td><td>THYAO</td><td>Pay bazında devre kesici bildirimi</td></tr></table>', "THYAO", new Date("2026-07-16T12:00:00Z"));
assert.equal(kapBlocked.blocked, true);

const gateFixture = { preEligible: true, reasons: [], gates: {}, links: {} };
assert.equal(scanner.finalizeRecommendation(gateFixture, { available: true, blocked: false, status: "Temiz" }, true, true).action, "YATIR");
assert.equal(scanner.finalizeRecommendation(gateFixture, { available: false, blocked: true, status: "KAP doğrulanamadı" }, true, true).action, "YATIRMA");
assert.equal(scanner.finalizeRecommendation(gateFixture, { available: true, blocked: true, status: "Risk bulundu" }, true, true).action, "YATIRMA");
assert.equal(scanner.finalizeRecommendation(gateFixture, { available: true, blocked: false, status: "Temiz" }, false, true).action, "YATIRMA");
assert.equal(scanner.finalizeRecommendation(gateFixture, { available: true, blocked: false, status: "Temiz" }, true, false).action, "YATIRMA");

const requestedUrls = [];
const mockFetch = async (url) => {
  requestedUrls.push(String(url));
  if (String(url).includes("hisse_endeks_ds.csv")) return { ok: false, status: 503, text: async () => "" };
  return { ok: true, status: 200, json: async () => payload() };
};

(async () => {
  const safeKapRisks = new Map(["THYAO", "ASELS"].map((symbol) => [symbol, { available: true, blocked: false, status: "Yakın risk işareti yok", recentEventCount: 1, searchUrl: `https://kap.org.tr/tr/bildirim-sorgu?symbol=${symbol}` }]));
  const now = new Date(`${rows.at(-1).time}T12:00:00Z`);
  const result = await scanner.runScan({ symbols: ["THYAO", "ASELS"], fundamentals: parsedFundamentals, kapRisks: safeKapRisks, fetcher: mockFetch, now, endDate: "2026-07-16" });
  assert.equal(result.scannedCount, 2);
  assert.equal(result.errorCount, 0);
  assert.equal(result.recommendations.length, 2);
  assert.equal(result.marketRegime.gateOpen, true);
  assert.ok(requestedUrls.every((url) => !url.endsWith(".json")));
  assert.ok(requestedUrls.some((url) => url.includes("HisseTekil?hisse=THYAO&startdate=")));
  assert.ok(result.recommendations[0].levels.stopLimit < result.recommendations[0].levels.stopTrigger);
  assert.ok(result.recommendations[0].levels.stopTrigger < result.recommendations[0].levels.limitBuy);
  assert.ok(result.recommendations[0].levels.target2 > result.recommendations[0].levels.limitBuy);
  assert.ok(["YATIR", "YATIRMA"].includes(result.recommendations[0].action));
  assert.deepEqual(Object.keys(result.recommendations[0].forecasts).sort(), ["1", "20", "5"]);
  assert.equal(result.recommendations.find((item) => item.symbol === "THYAO").fundamental.available, true);

  const partialSymbols = ["AAA1", "AAA2", "AAA3", "AAA4", "AAA5", "AAA6", "AAA7", "AAA8", "AAA9", "AAB1"];
  const partialFundamentals = new Map(partialSymbols.map((symbol) => [symbol, { available: true, score: 60, status: "Dengeli", sector: "Test" }]));
  const partialFetch = async (url) => {
    const symbol = String(url).match(/[?&]hisse=([^&]+)/)?.[1];
    return partialSymbols.indexOf(symbol) < 6 ? { ok: true, status: 200, json: async () => payload() } : { ok: false, status: 503, json: async () => ({}) };
  };
  const partialKapRisks = new Map(partialSymbols.map((symbol) => [symbol, { available: true, blocked: false, status: "Temiz", recentEventCount: 0 }]));
  const partial = await scanner.runScan({ symbols: partialSymbols, fundamentals: partialFundamentals, kapRisks: partialKapRisks, fetcher: partialFetch, now, endDate: "2026-07-16" });
  assert.equal(partial.marketRegime.dataSufficient, false);
  assert.equal(partial.candidateCount, 0);
  assert.equal(partial.marketDecision, "YATIRMA · tarama verisi yetersiz");
  console.log("FinPilot automatic scanner checks: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
