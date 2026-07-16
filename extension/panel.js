"use strict";

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
const percent = (value, digits = 1) => value == null ? "—" : `%${fmt(value, digits)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
let progressTimer = null;
let currentResult = null;
let activeTab = "all";

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
    const match = (tab.url || "").match(/[?&]symbol=(?:(?:BIST|BINANCE)%3A|(?:BIST|BINANCE):)?([A-Z0-9]+)/i) || (tab.title || "").match(/^([A-Z0-9]{3,12})\b/);
    $("activeChart").textContent = match ? `Grafik: ${decodeURIComponent(match[1])}` : "TradingView";
  } catch { $("activeChart").textContent = "TradingView"; }
}

function showProgress(active, completed = 0, total = 260, symbol = "") {
  $("progressCard").hidden = !active;
  $("runScan").disabled = active;
  if (!active) {
    clearInterval(progressTimer);
    progressTimer = null;
    return;
  }
  $("progressTitle").textContent = "BIST ve kripto otomatik taranıyor";
  $("progressText").textContent = symbol ? `${symbol} incelendi · ${completed}/${total}` : "İş Yatırım, KAP ve Binance verileri alınıyor…";
  $("progressFill").style.width = `${Math.max(6, completed / Math.max(1, total) * 100)}%`;
  if (!progressTimer) {
    let hint = 0;
    const hints = ["Geniş likit BIST evreni taranıyor…", "Binance USDT spot çiftleri süzülüyor…", "Üç vadeli yön ve yerel ML hesaplanıyor…", "Masraflı backtest ve stres yolları deneniyor…", "KAP ve piyasa rejimi kapıları doğrulanıyor…"];
    progressTimer = setInterval(() => { if (!symbol) $("progressText").textContent = hints[hint++ % hints.length]; }, 1500);
  }
}

function signedPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}%${fmt(numeric, digits)}`;
}

function formatPrice(item, value) {
  if (!Number.isFinite(Number(value))) return "—";
  const digits = Math.min(10, Math.max(2, Number(item.priceDecimals) || 2));
  return `${item.market === "crypto" ? "$" : "₺"}${fmt(value, digits)}`;
}

function forecastCard(forecast, label) {
  if (!forecast?.available) return `<div class="forecast unavailable"><span>${escapeHtml(label)}</span><b>BELİRSİZ</b><small>Örnek yetersiz</small></div>`;
  const tone = forecast.direction === "YÜKSELİŞ" ? "up" : forecast.direction === "DÜŞÜŞ" ? "down" : "flat";
  return `<div class="forecast ${tone}"><span>${escapeHtml(label)}</span><b>${escapeHtml(forecast.direction)}</b><small><i>↑ ${percent(forecast.probabilityUp, 0)}</i><i>↓ ${percent(forecast.probabilityDown, 0)}</i><i>→ ${percent(forecast.probabilityFlat, 0)}</i></small><em>Beklenen ${signedPercent(forecast.expectedLowPct)} – ${signedPercent(forecast.expectedHighPct)}</em></div>`;
}

function metricCells(item) {
  const profitFactor = item.profitFactor == null ? "—" : Number.isFinite(item.profitFactor) ? fmt(item.profitFactor, 2) : "∞";
  const probabilityRange = item.probabilityLow == null ? "Örneklem az" : `%${fmt(item.probabilityLow, 0)}–${fmt(item.probabilityHigh, 0)}`;
  const stressScore = item.stress?.available ? percent(item.stress.profitablePct, 0) : "—";
  const common = [
    ["Geçmiş kazanma", percent(item.historicalProbability)],
    ["%95 aralık", probabilityRange],
    ["Kâr faktörü", profitFactor],
    ["Yakın beklenti", `${fmt(item.recentExpectancyR, 2)}R`],
    ["ML yükseliş", percent(item.modelProbabilityUp)],
    ["Stres pozitif", stressScore],
  ];
  const special = item.market === "crypto"
    ? [["24s hacim", `$${fmt((item.quoteVolume24h || 0) / 1_000_000, 0)}M`], ["24s hareket", signedPercent(item.priceChangePct24h, 1)]]
    : [["Temel puan", item.fundamental?.available ? `${Math.round(item.fundamental.score)}/100` : "—"], ["KAP", item.kap?.available ? item.kap.status : "Doğrulanamadı"]];
  return [...common, ...special].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");
}

function recommendationCard(item, index) {
  const actionClass = item.eligible ? "candidate" : "blocked";
  const order = item.orderPlan || item.levels || {};
  const gateNames = { setup: "Kurulum", backtest: "Backtest", model: "ML", fundamental: "Temel", direction: "Yön", recentRegime: "Yakın dönem", stress: "Stres", liquidity: "Likidite/pump", orderPlan: "Emir planı", dataFresh: "Tazelik", kap: "KAP", market: item.market === "crypto" ? "BTC/piyasa" : "Piyasa" };
  const gates = Object.entries(item.gates || {}).map(([name, passed]) => `<span class="gate ${passed ? "pass" : "fail"}">${passed ? "✓" : "×"} ${escapeHtml(gateNames[name] || name)}</span>`).join("");
  const failedLabels = (item.failedGates || Object.entries(item.gates || {}).filter(([, passed]) => !passed).map(([key]) => ({ label: gateNames[key] || key }))).map((gate) => gate.label);
  const failedBanner = item.eligible
    ? '<div class="gate-summary passed"><b>TÜM KAPILAR GEÇTİ</b><span>Limit ve stop planı etkin.</span></div>'
    : `<div class="gate-summary failed"><b>${item.nearMiss ? "YATIR'A EN YAKIN" : "NEDEN YATIRMA?"}</b><span>${escapeHtml(failedLabels.length ? failedLabels.join(" · ") : "Güvenlik koşulları tamamlanmadı")}</span></div>`;
  const reasons = (Array.isArray(item.reasons) ? item.reasons : ["Araştırma gerekçesi mevcut değil."]).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  const orderSection = item.eligible ? `<div class="order-title"><span>ÖNERİLEN EMİR PLANI</span><b>Sinyal geçerli</b></div>
    <div class="levels order-levels"><div class="entry"><span>Alış limiti</span><b>${formatPrice(item, order.limitBuy)}</b></div><div class="stop"><span>Stop tetik</span><b>${formatPrice(item, order.stopTrigger)}</b></div><div class="stop"><span>Stop-limit</span><b>${formatPrice(item, order.stopLimit)}</b></div><div class="target"><span>Hedef 1</span><b>${formatPrice(item, order.target1)}</b></div><div class="target"><span>Hedef 2</span><b>${formatPrice(item, order.target2)}</b></div><div><span>Geçerlilik</span><b>${escapeHtml(order.validUntil || "Yeni veri gelene kadar")}</b></div></div>` : `<div class="inactive-order"><b>YATIRMA</b><span>Emir seviyesi etkin değil; eksik kapılar yukarıda açıkça gösteriliyor.</span></div>`;
  const age = item.market === "crypto" ? `${fmt(item.dataAgeHours, 1)} saat` : `${item.dataAgeBusinessDays ?? "—"} iş günü`;
  const forecastDisplay = item.forecastDisplay || [{ key: "1", label: "1 GÜN" }, { key: "5", label: "5 GÜN" }, { key: "20", label: "20 GÜN" }];
  const forecasts = forecastDisplay.map(({ key, label }) => forecastCard(item.forecasts?.[String(key)], label)).join("");
  const marketClass = item.market === "crypto" ? "crypto" : "bist";
  const links = [
    item.links?.tradingView ? `<a href="${escapeHtml(item.links.tradingView)}" target="_blank" rel="noreferrer">TradingView ↗</a>` : "",
    item.market === "crypto" && item.links?.exchange ? `<a href="${escapeHtml(item.links.exchange)}" target="_blank" rel="noreferrer">Binance ↗</a>` : "",
    item.market !== "crypto" && item.links?.isYatirim ? `<a href="${escapeHtml(item.links.isYatirim)}" target="_blank" rel="noreferrer">İş Yatırım ↗</a>` : "",
    item.market !== "crypto" && item.links?.kap ? `<a href="${escapeHtml(item.links.kap)}" target="_blank" rel="noreferrer">KAP ↗</a>` : "",
  ].filter(Boolean).join("");
  return `<article class="stock-card ${item.eligible ? "candidate" : ""}">
    <div class="stock-head"><span class="rank">${index + 1}</span><div class="stock-name"><div><b>${escapeHtml(item.displaySymbol || item.symbol)}</b><em class="market-badge ${marketClass}">${escapeHtml(item.marketLabel || marketClass.toUpperCase())}</em></div><span>${formatPrice(item, item.price)} · veri ${escapeHtml(item.dataDate)} · ${age}</span></div><span class="action ${actionClass}">${escapeHtml(item.action)}</span></div>
    <div class="score-row"><span>Birleşik güç</span><div class="score-bar"><i style="width:${Math.max(0, Math.min(100, Math.round(item.rankScore || 0)))}%"></i></div><b>${Math.round(item.rankScore || 0)}</b></div>
    ${failedBanner}
    <div class="direction-title"><span>YÖN ARAŞTIRMASI</span><b>${escapeHtml(item.direction || "BELİRSİZ")}</b></div>
    <div class="forecast-grid">${forecasts}</div>
    <div class="stock-metrics">${metricCells(item)}</div>
    ${orderSection}
    <div class="gate-list">${gates}</div>
    <p class="stop-warning">⚠ Stop-limit sert harekette gerçekleşmeyebilir. Seviye araştırma önerisidir; otomatik emir gönderilmez.</p>
    <details class="research-details"><summary>Araştırma gerekçelerini göster</summary><ul class="reasons">${reasons}</ul></details>
    <div class="stock-links">${links}</div>
  </article>`;
}

function renderHistory(history) {
  const records = history?.records || [];
  const stats = history?.stats || {};
  const winRate = stats.winRate == null ? "Henüz ölçülmedi" : `%${fmt(stats.winRate, 1)}`;
  const rows = records.map((record) => {
    const item = { market: record.market, priceDecimals: record.market === "crypto" ? 8 : 2 };
    const statusClass = record.status === "AÇIK" ? "open" : record.status?.startsWith("HEDEF") ? "win" : record.status === "STOP" ? "loss" : "expired";
    return `<article class="history-row"><div><em class="market-badge ${record.market === "crypto" ? "crypto" : "bist"}">${escapeHtml(record.marketLabel)}</em><b>${escapeHtml(record.displaySymbol || record.symbol)}</b><small>${new Date(record.openedAt).toLocaleString("tr-TR")}</small></div><div><span>Giriş</span><b>${formatPrice(item, record.entry)}</b></div><div><span>Son</span><b>${formatPrice(item, record.lastPrice)}</b></div><strong class="history-status ${statusClass}">${escapeHtml(record.status)}</strong></article>`;
  }).join("");
  return `<div class="history-summary"><article><span>Açık</span><b>${stats.open || 0}</b></article><article><span>Sonuçlanan</span><b>${stats.resolved || 0}</b></article><article><span>Hedef oranı</span><b>${winRate}</b></article><article><span>Toplam R</span><b>${fmt(stats.totalR || 0, 2)}R</b></article></div><p class="history-note">${escapeHtml(history?.note || "Geçmiş, yalnızca tarama anlarındaki fiyatlarla takip edilir; gerçek işlem kaydı değildir.")}</p>${rows || '<div class="empty-card"><h2>Henüz YATIR sinyali yok</h2><p>Bir varlık tüm kapıları geçtiğinde burada otomatik izlenmeye başlar.</p></div>'}`;
}

function legacyToCombined(result) {
  if (result?.version === 4 && result.markets) return result;
  const bist = { ...result, market: "bist", recommendations: (result?.recommendations || []).map((item) => ({ market: "bist", marketLabel: "BIST", displaySymbol: item.symbol, priceDecimals: 2, ...item })), snapshot: result?.snapshot || [] };
  const crypto = { market: "crypto", scannedCount: 0, requestedCount: 0, candidateCount: 0, errorCount: 0, recommendations: [], snapshot: [], errors: [], marketDecision: "Kripto henüz taranmadı", marketRegime: { gateOpen: false, dataSufficient: false, breadthPct: 0 } };
  if (typeof FinPilotMarketAggregator !== "undefined") {
    const combined = FinPilotMarketAggregator.combineResults(bist, crypto, new Date(result.generatedAt || Date.now()));
    combined.signalHistory = result.signalHistory || null;
    return combined;
  }
  return { ...result, version: 4, markets: { bist, crypto }, recommendations: bist.recommendations, snapshot: bist.snapshot };
}

function renderActiveTab() {
  if (!currentResult) return;
  const tabMap = { all: "tabAll", bist: "tabBist", crypto: "tabCrypto", history: "tabHistory" };
  for (const [tab, id] of Object.entries(tabMap)) $(id).classList.toggle("active", activeTab === tab);
  const isHistory = activeTab === "history";
  $("recommendations").hidden = isHistory;
  $("historyPanel").hidden = !isHistory;
  if (isHistory) {
    $("recommendationTitle").textContent = "Sinyal geçmişi";
    $("universeLabel").textContent = "Gerçek emir değil · kapanmış tarama verisi";
    $("historyPanel").innerHTML = renderHistory(currentResult.signalHistory);
    return;
  }
  const filtered = (currentResult.recommendations || []).filter((item) => activeTab === "all" || item.market === activeTab);
  $("recommendationTitle").textContent = activeTab === "bist" ? "En güçlü BIST hisseleri" : activeTab === "crypto" ? "En güçlü spot kriptolar" : "En güçlü varlıklar";
  $("universeLabel").textContent = activeTab === "bist" ? currentResult.markets?.bist?.universe || "Geniş BIST" : activeTab === "crypto" ? currentResult.markets?.crypto?.universe || "Binance USDT spot" : currentResult.universe;
  $("recommendations").innerHTML = filtered.map(recommendationCard).join("") || '<div class="empty-card"><h2>Bu piyasada sonuç yok</h2><p>Veri uyarılarını inceleyip daha sonra yeniden tara.</p></div>';
}

function selectTab(tab) {
  activeTab = tab;
  renderActiveTab();
}

function render(input) {
  const result = legacyToCombined(input);
  currentResult = result;
  $("emptyState").hidden = true;
  $("resultArea").hidden = false;
  $("marketDecision").textContent = result.marketDecision;
  const bistDecision = result.markets?.bist?.marketDecision || "BIST sonucu yok";
  const cryptoDecision = result.markets?.crypto?.marketDecision || "Kripto sonucu yok";
  $("marketMeta").textContent = `BIST: ${bistDecision} · Kripto: ${cryptoDecision}`;
  $("candidateCount").textContent = result.candidateCount;
  $("marketDecisionCard").classList.toggle("wait", result.candidateCount === 0);
  $("scannedCount").textContent = `${result.scannedCount}/${result.requestedCount}`;
  $("bistScanned").textContent = `${result.markets?.bist?.scannedCount || 0}/${result.markets?.bist?.requestedCount || 0}`;
  $("cryptoScanned").textContent = `${result.markets?.crypto?.scannedCount || 0}/${result.markets?.crypto?.requestedCount || 0}`;
  $("marketBreadth").textContent = result.marketRegime ? `%${fmt(result.marketRegime.breadthPct, 0)}` : "—";
  $("dataAsOf").textContent = result.dataAsOf ? String(result.dataAsOf).slice(0, 16).replace("T", " ") : "—";
  $("generatedAt").textContent = new Date(result.generatedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  $("kapCheckedCount").textContent = `${result.research?.kapCheckedCount ?? 0}/${result.research?.deepResearchLimit ?? "—"}`;
  const bistCount = (result.recommendations || []).filter((item) => item.market !== "crypto").length;
  const cryptoCount = (result.recommendations || []).filter((item) => item.market === "crypto").length;
  $("allCount").textContent = (result.recommendations || []).length;
  $("bistCount").textContent = bistCount;
  $("cryptoCount").textContent = cryptoCount;
  $("historyCount").textContent = result.signalHistory?.records?.length || 0;
  $("errorDetails").hidden = !result.errorCount;
  $("errorCount").textContent = result.errorCount;
  $("errorList").innerHTML = (result.errors || []).map((error) => `<li><b>${escapeHtml(error.symbol)}</b> · ${escapeHtml(error.message)}</li>`).join("");
  renderActiveTab();
  setStatus(result.candidateCount ? `YATIR · ${result.candidateCount}` : "YATIRMA");
}

async function fallbackScan() {
  const progress = ({ completed, total, symbol }) => showProgress(true, completed, total, symbol);
  const [bistOutcome, cryptoOutcome] = await Promise.allSettled([
    FinPilotAutoScanner.runScan({ onProgress: progress }),
    FinPilotCryptoScanner.runScan({ onProgress: progress }),
  ]);
  const empty = (market, outcome) => ({ market, scannedCount: 0, requestedCount: 0, candidateCount: 0, errorCount: 1, recommendations: [], snapshot: [], errors: [{ symbol: market.toUpperCase(), message: outcome.reason?.message || String(outcome.reason) }], marketRegime: { gateOpen: false, dataSufficient: false, breadthPct: 0 } });
  const bist = bistOutcome.status === "fulfilled" ? bistOutcome.value : empty("bist", bistOutcome);
  const crypto = cryptoOutcome.status === "fulfilled" ? cryptoOutcome.value : empty("crypto", cryptoOutcome);
  const result = FinPilotMarketAggregator.combineResults(bist, crypto, new Date());
  const stored = await chrome.storage.local.get("finpilotSignalHistory");
  const history = FinPilotSignalTracker.updateHistory(stored.finpilotSignalHistory || null, result, new Date());
  result.signalHistory = history;
  await chrome.storage.local.set({ finpilotAutomaticScan: result, finpilotSignalHistory: history });
  return result;
}

async function runScan() {
  showProgress(true);
  setStatus("Taranıyor");
  try {
    let response;
    try { response = await sendMessage("RUN_AUTOMATIC_SCAN"); }
    catch { response = { ok: true, result: await fallbackScan() }; }
    if (!response?.ok || !response.result) throw new Error(response?.error || "Tarama sonucu alınamadı.");
    render(response.result);
  } catch (error) {
    setStatus("Bağlantı hatası", true);
    $("emptyState").hidden = false;
    $("emptyState").innerHTML = `<span>!</span><h2>Otomatik veri alınamadı</h2><p>${escapeHtml(error instanceof Error ? error.message : String(error))}<br>İnternet bağlantısını kontrol edip yeniden dene.</p>`;
  } finally { showProgress(false); }
}

async function init() {
  await detectChart();
  $("runScan").addEventListener("click", runScan);
  $("tabAll").addEventListener("click", () => selectTab("all"));
  $("tabBist").addEventListener("click", () => selectTab("bist"));
  $("tabCrypto").addEventListener("click", () => selectTab("crypto"));
  $("tabHistory").addEventListener("click", () => selectTab("history"));
  showProgress(true);
  setStatus("Kontrol ediliyor");
  try {
    const response = await sendMessage("GET_AUTOMATIC_SCAN");
    if (response?.result) render(response.result);
    else await runScan();
  } catch {
    const stored = await chrome.storage.local.get(["finpilotAutomaticScan", "finpilotSignalHistory"]);
    if (stored.finpilotAutomaticScan) render({ ...stored.finpilotAutomaticScan, signalHistory: stored.finpilotSignalHistory || stored.finpilotAutomaticScan.signalHistory });
    else await runScan();
  } finally { showProgress(false); }
}

init().catch((error) => { setStatus("Başlatma hatası", true); console.error(error); });
