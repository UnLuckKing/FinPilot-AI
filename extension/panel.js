"use strict";

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
const percent = (value, digits = 1) => value == null ? "—" : `%${fmt(value, digits)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
let progressTimer = null;

function setStatus(text, error = false) {
  $("pageStatus").textContent = text;
  $("pageStatus").style.color = error ? "#ff7089" : "#5bea96";
}

function sendMessage(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function detectChart() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const match = (tab.url || "").match(/[?&]symbol=(?:BIST%3A|BIST:)?([A-Z0-9]+)/i) || (tab.title || "").match(/^([A-Z0-9]{3,6})\b/);
    $("activeChart").textContent = match ? `Grafik: ${decodeURIComponent(match[1])}` : "TradingView";
  } catch { $("activeChart").textContent = "TradingView"; }
}

function showProgress(active, completed = 0, total = 30, symbol = "") {
  $("progressCard").hidden = !active;
  $("runScan").disabled = active;
  if (!active) {
    clearInterval(progressTimer);
    progressTimer = null;
    return;
  }
  $("progressTitle").textContent = "BIST hisseleri otomatik taranıyor";
  $("progressText").textContent = symbol ? `${symbol} incelendi · ${completed}/${total}` : "İş Yatırım verileri alınıyor…";
  $("progressFill").style.width = `${Math.max(6, completed / Math.max(1, total) * 100)}%`;
  if (!progressTimer) {
    let hint = 0;
    const hints = ["Trend ve momentum hesaplanıyor…", "1, 5 ve 20 günlük yönler modelleniyor…", "Masraf, gap ve stres yolları test ediliyor…", "KAP risk bildirimleri doğrulanıyor…"];
    progressTimer = setInterval(() => { if (!symbol) $("progressText").textContent = hints[hint++ % hints.length]; }, 1500);
  }
}

function signedPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}%${fmt(numeric, digits)}`;
}

function forecastCard(forecast, label) {
  if (!forecast?.available) return `<div class="forecast unavailable"><span>${label}</span><b>BELİRSİZ</b><small>Örnek yetersiz</small></div>`;
  const tone = forecast.direction === "YÜKSELİŞ" ? "up" : forecast.direction === "DÜŞÜŞ" ? "down" : "flat";
  return `<div class="forecast ${tone}"><span>${label}</span><b>${escapeHtml(forecast.direction)}</b><small><i>↑ ${percent(forecast.probabilityUp, 0)}</i><i>↓ ${percent(forecast.probabilityDown, 0)}</i><i>→ ${percent(forecast.probabilityFlat, 0)}</i></small><em>Beklenen ${signedPercent(forecast.expectedLowPct)} – ${signedPercent(forecast.expectedHighPct)}</em></div>`;
}

function recommendationCard(item, index) {
  const actionClass = item.eligible ? "candidate" : "blocked";
  const profitFactor = Number.isFinite(item.profitFactor) ? fmt(item.profitFactor, 2) : "∞";
  const probabilityRange = item.probabilityLow == null ? "Örneklem az" : `%${fmt(item.probabilityLow, 0)}–${fmt(item.probabilityHigh, 0)}`;
  const fundamentalScore = item.fundamental?.available ? `${Math.round(item.fundamental.score)}/100` : "—";
  const stressScore = item.stress?.available ? percent(item.stress.profitablePct, 0) : "—";
  const kapStatus = item.kap?.available ? item.kap.status : "Doğrulanamadı";
  const order = item.orderPlan || item.levels || {};
  const gateNames = { setup: "Kurulum", backtest: "Backtest", model: "ML", fundamental: "Temel", direction: "Yön", recentRegime: "Yakın dönem", stress: "Stres", orderPlan: "Emir planı", dataFresh: "Tazelik", kap: "KAP", market: "Piyasa" };
  const gates = Object.entries(item.gates || {}).map(([name, passed]) => `<span class="gate ${passed ? "pass" : "fail"}">${passed ? "✓" : "×"} ${escapeHtml(gateNames[name] || name)}</span>`).join("");
  const reasons = item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  return `<article class="stock-card ${item.eligible ? "candidate" : ""}">
    <div class="stock-head"><span class="rank">${index + 1}</span><div class="stock-name"><b>${escapeHtml(item.symbol)}</b><span>₺${fmt(item.price, 2)} · veri ${escapeHtml(item.dataDate)} · ${item.dataAgeBusinessDays ?? "—"} iş günü</span></div><span class="action ${actionClass}">${escapeHtml(item.action)}</span></div>
    <div class="score-row"><span>Birleşik güç</span><div class="score-bar"><i style="width:${Math.round(item.rankScore)}%"></i></div><b>${Math.round(item.rankScore)}</b></div>
    <div class="direction-title"><span>YÖN ARAŞTIRMASI</span><b>${escapeHtml(item.direction || "BELİRSİZ")}</b></div>
    <div class="forecast-grid">${forecastCard(item.forecasts?.["1"], "1 GÜN")}${forecastCard(item.forecasts?.["5"], "5 GÜN")}${forecastCard(item.forecasts?.["20"], "20 GÜN")}</div>
    <div class="stock-metrics"><div><span>Geçmiş kazanma</span><b>${percent(item.historicalProbability)}</b></div><div><span>%95 aralık</span><b>${probabilityRange}</b></div><div><span>Kâr faktörü</span><b>${profitFactor}</b></div><div><span>Yakın beklenti</span><b>${fmt(item.recentExpectancyR, 2)}R</b></div><div><span>ML yükseliş</span><b>${percent(item.modelProbabilityUp)}</b></div><div><span>Stres pozitif</span><b>${stressScore}</b></div><div><span>Temel puan</span><b>${fundamentalScore}</b></div><div><span>KAP</span><b>${escapeHtml(kapStatus)}</b></div></div>
    <div class="order-title"><span>ÖNERİLEN EMİR PLANI</span><b>${item.eligible ? "Sinyal geçerli" : "Emir oluşturma"}</b></div>
    <div class="levels order-levels"><div class="entry"><span>Alış limiti</span><b>₺${fmt(order.limitBuy, 2)}</b></div><div class="stop"><span>Stop tetik</span><b>₺${fmt(order.stopTrigger, 2)}</b></div><div class="stop"><span>Stop-limit</span><b>₺${fmt(order.stopLimit, 2)}</b></div><div class="target"><span>Hedef 1</span><b>₺${fmt(order.target1, 2)}</b></div><div class="target"><span>Hedef 2</span><b>₺${fmt(order.target2, 2)}</b></div><div><span>Geçerlilik</span><b>${escapeHtml(order.validUntil || "Yeni veri gelene kadar")}</b></div></div>
    <div class="gate-list">${gates}</div>
    <p class="stop-warning">⚠ Stop-limit fiyat boşluğunda gerçekleşmeyebilir. Seviye öneridir; otomatik emir gönderilmez.</p>
    <details class="research-details"><summary>Araştırma gerekçelerini göster</summary><ul class="reasons">${reasons}</ul></details>
    <div class="stock-links"><a href="${item.links.tradingView}" target="_blank" rel="noreferrer">TradingView ↗</a><a href="${item.links.isYatirim}" target="_blank" rel="noreferrer">İş Yatırım ↗</a><a href="${item.links.kap}" target="_blank" rel="noreferrer">KAP ↗</a></div>
  </article>`;
}

function render(result) {
  $("emptyState").hidden = true;
  $("resultArea").hidden = false;
  $("marketDecision").textContent = result.marketDecision;
  $("marketMeta").textContent = result.marketRegime?.dataSufficient === false ? `Havuzun yalnızca %${fmt(result.marketRegime.coveragePct, 0)} kadarı okunabildi; veri risk kapısı kapalı.` : result.marketRegime?.gateOpen === false ? `Likit havuzda yükseliş trendi %${fmt(result.marketRegime.breadthPct, 0)}; piyasa risk kapısı kapalı.` : result.candidateCount ? "Teknik, temel, yön, stres, tazelik, piyasa ve KAP kapıları birlikte geçti." : "Bir veya daha fazla güvenlik kapısı doğrulanmadı; sistem YATIRMA modunda.";
  $("candidateCount").textContent = result.candidateCount;
  $("marketDecisionCard").classList.toggle("wait", result.candidateCount === 0);
  $("scannedCount").textContent = `${result.scannedCount}/${result.requestedCount}`;
  $("marketBreadth").textContent = result.marketRegime ? `%${fmt(result.marketRegime.breadthPct, 0)}` : "—";
  $("dataAsOf").textContent = result.dataAsOf || "—";
  $("generatedAt").textContent = new Date(result.generatedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  $("kapCheckedCount").textContent = `${result.research?.kapCheckedCount ?? 0}/${result.research?.deepResearchLimit ?? "—"}`;
  $("universeLabel").textContent = result.universe;
  $("recommendations").innerHTML = result.recommendations.map(recommendationCard).join("") || '<div class="empty-card"><h2>Sonuç üretilemedi</h2><p>Veri kaynağını daha sonra yeniden dene.</p></div>';
  $("errorDetails").hidden = !result.errorCount;
  $("errorCount").textContent = result.errorCount;
  $("errorList").innerHTML = result.errors.map((error) => `<li><b>${escapeHtml(error.symbol)}</b> · ${escapeHtml(error.message)}</li>`).join("");
  setStatus(result.candidateCount ? `YATIR · ${result.candidateCount}` : "YATIRMA");
}

async function runScan() {
  showProgress(true);
  setStatus("Taranıyor");
  try {
    let response;
    try { response = await sendMessage("RUN_AUTOMATIC_SCAN"); }
    catch {
      const result = await FinPilotAutoScanner.runScan({ onProgress: ({ completed, total, symbol }) => showProgress(true, completed, total, symbol) });
      await chrome.storage.local.set({ finpilotAutomaticScan: result });
      response = { ok: true, result };
    }
    if (!response?.ok || !response.result) throw new Error(response?.error || "Tarama sonucu alınamadı.");
    render(response.result);
  } catch (error) {
    setStatus("Bağlantı hatası", true);
    $("emptyState").hidden = false;
    $("emptyState").innerHTML = `<span>!</span><h2>Otomatik veri alınamadı</h2><p>${escapeHtml(error instanceof Error ? error.message : String(error))}<br>İnternet bağlantısını kontrol edip tek düğmeye tekrar bas.</p>`;
  } finally { showProgress(false); }
}

async function init() {
  await detectChart();
  $("runScan").addEventListener("click", runScan);
  showProgress(true);
  setStatus("Kontrol ediliyor");
  try {
    const response = await sendMessage("GET_AUTOMATIC_SCAN");
    if (response?.result) render(response.result);
    else await runScan();
  } catch {
    const stored = await chrome.storage.local.get("finpilotAutomaticScan");
    if (stored.finpilotAutomaticScan) render(stored.finpilotAutomaticScan);
    else await runScan();
  } finally { showProgress(false); }
}

init().catch((error) => { setStatus("Başlatma hatası", true); console.error(error); });
