"use strict";

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
const percent = (value, digits = 1) => value == null ? "—" : `%${fmt(value, digits)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
let progressTimer = null;
let capitalTimer = null;
let currentResult = null;
let activeTab = "all";

function setStatus(text, error = false) {
  $("pageStatus").textContent = text;
  $("pageStatus").style.color = error ? "#ff7089" : "#5bea96";
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
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

function formatMoney(value) {
  return Number.isFinite(Number(value)) ? `₺${fmt(value, 0)}` : "—";
}

function formatQuantity(item, value) {
  if (!Number.isFinite(Number(value))) return "—";
  return item.market === "crypto" ? fmt(value, 6) : fmt(value, 0);
}

function forecastCard(forecast, label) {
  if (!forecast?.available) return `<div class="forecast unavailable"><span>${escapeHtml(label)}</span><b>BELİRSİZ</b><small>Örnek yetersiz</small></div>`;
  const tone = forecast.direction === "YÜKSELİŞ" ? "up" : forecast.direction === "DÜŞÜŞ" ? "down" : "flat";
  const unreliable = forecast.reliable === false;
  return `<div class="forecast ${tone} ${unreliable ? "unreliable" : ""}"><span>${escapeHtml(label)}</span><b>${escapeHtml(forecast.direction)}</b><small><i>↑ ${percent(forecast.probabilityUp, 0)}</i><i>↓ ${percent(forecast.probabilityDown, 0)}</i><i>→ ${percent(forecast.probabilityFlat, 0)}</i></small><em>Beklenen ${signedPercent(forecast.expectedLowPct)} – ${signedPercent(forecast.expectedHighPct)}</em>${unreliable ? `<strong>⚠ ARALIK ÇOK GENİŞ</strong>` : ""}</div>`;
}

function metricCells(item) {
  const profitFactor = item.profitFactor == null ? "—" : Number.isFinite(item.profitFactor) ? fmt(item.profitFactor, 2) : "∞";
  const probabilityRange = item.probabilityLow == null ? "Örneklem az" : `%${fmt(item.probabilityLow, 0)}–${fmt(item.probabilityHigh, 0)}`;
  const stressScore = item.stress?.available ? percent(item.stress.profitablePct, 0) : "—";
  const common = [
    ["Kanıt notu", item.evidenceGrade || item.validation?.evidenceGrade || "D"],
    ["Kalibre olasılık", percent(item.validation?.calibratedProbability ?? item.calibratedProbabilityUp)],
    ["Dönem dışı işlem", item.validation?.oos?.trades ?? "—"],
    ["Dilim tutarlılığı", percent(item.validation?.stabilityPct, 0)],
    ["Aşırı uyum", item.validation?.overfitRisk || "BELİRSİZ"],
    ["Piyasa rejimi", item.regime?.label || "Belirsiz"],
    ["Geçmiş kazanma", percent(item.historicalProbability)],
    ["%95 aralık", probabilityRange],
    ["Kâr faktörü", profitFactor],
    ["Yakın beklenti", `${fmt(item.recentExpectancyR, 2)}R`],
    ["ML ham yükseliş", percent(item.modelProbabilityUp)],
    ["Stres pozitif", stressScore],
    ["Çoklu zaman", item.multiTimeframe?.available ? `%${fmt(item.multiTimeframe.alignmentScore, 0)} ${item.multiTimeframe.passed ? "uyumlu" : "çelişkili"}` : "—"],
    ["Göreli güç", item.relativeStrength?.available ? `%${fmt(item.relativeStrength.percentile20, 0)} yüzdelik` : "—"],
    ["Veri sağlığı", item.dataHealth ? `${fmt(item.dataHealth.score, 0)}/100 ${item.dataHealth.status || ""}` : "—"],
    ["Önerilen adet", formatQuantity(item, item.positionSizing?.quantity)],
    ["Azami TL kayıp", formatMoney(item.positionSizing?.maxLoss)],
  ];
  const special = item.market === "crypto"
    ? [["24s hacim", `$${fmt((item.quoteVolume24h || 0) / 1_000_000, 0)}M`], ["24s hareket", signedPercent(item.priceChangePct24h, 1)], ["Alış/satış farkı", Number.isFinite(item.spreadBps) ? `${fmt(item.spreadBps, 1)} bp` : "—"]]
    : [["Temel puan", item.fundamental?.available ? `${Math.round(item.fundamental.score)}/100` : "—"], ["KAP", item.kap?.available ? item.kap.status : "Doğrulanamadı"]];
  return [...common, ...special].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");
}

function paperRecordFor(item) {
  const key = `${item.market || "bist"}:${item.symbol}`;
  return (currentResult?.signalHistory?.records || []).find((record) => (record.key || `${record.market || "bist"}:${record.symbol}`) === key && ["EMİR BEKLİYOR", "AKTİF", "TAŞINAN STOP"].includes(record.status)) || null;
}

function evidencePanel(item) {
  const validation = item.validation || {};
  const dsr = validation.selectedDeflatedSharpe || validation.deflatedSharpe || {};
  const pbo = validation.pbo || {};
  const portfolio = item.portfolioRisk || {};
  const paper = paperRecordFor(item);
  const kapEvents = item.kap?.eventIntelligence;
  const grade = item.evidenceGrade || validation.evidenceGrade || "D";
  const selectedGrade = validation.selectedEvidenceGrade || grade;
  const overallGrade = validation.overallEvidenceGrade || grade;
  const requiredOos = validation.requiredOosTrades || 12;
  const oosTrades = validation.oos?.trades || 0;
  const pboText = pbo.available ? percent(pbo.value * 100, 0) : "—";
  const dsrText = dsr.available ? percent(dsr.probability * 100, 0) : "—";
  const correlation = Number.isFinite(portfolio.maxCorrelation) ? `${fmt(portfolio.maxCorrelation, 2)}${portfolio.correlatedWith ? ` · ${portfolio.correlatedWith}` : ""}` : "—";
  const kapLine = item.market !== "crypto" && kapEvents?.available
    ? `<div class="evidence-note kap-event"><b>KAP OLAY HARİTASI · ${escapeHtml(kapEvents.direction)}</b><span>Etki ${fmt(kapEvents.impactScore, 0)} · önemli olay ${kapEvents.materialCount}. Metin sınıflandırması etki garantisi değildir.</span></div>`
    : "";
  const paperLine = paper
    ? `<div class="paper-state"><span>KÂĞIT EMİR</span><b>${escapeHtml(paper.status)}</b><em>${paper.status === "EMİR BEKLİYOR" ? `Limit ${formatPrice(item, paper.entry)} henüz dolmadı` : `Dolum ${formatPrice(item, paper.fillPrice)} · stop ${formatPrice(item, paper.currentStop)}`}</em></div>`
    : "";
  return `<section class="evidence-panel grade-${escapeHtml(grade.toLowerCase())}">
    <div class="evidence-head"><div><span>KANIT DOSYASI v3.1</span><b>Nihai ${escapeHtml(grade)}</b></div><em>${escapeHtml(validation.overfitRisk || "BELİRSİZ")} aşırı uyum</em></div>
    <div class="evidence-grid"><div><span>Dönem dışı örnek</span><b>${oosTrades}/${requiredOos}</b></div><div><span>Seçilen / genel</span><b>${escapeHtml(selectedGrade)} / ${escapeHtml(overallGrade)}</b></div><div><span>Walk-forward</span><b>${validation.foldCount || 0} dönem</b></div><div><span>PBO</span><b>${pboText}</b></div><div><span>Deflated Sharpe</span><b>${dsrText}</b></div><div><span>Rejim</span><b>${escapeHtml(item.regime?.label || "Belirsiz")}</b></div><div><span>Rakip model</span><b>${escapeHtml(item.challenger?.label || "—")}</b></div><div><span>Korelasyon</span><b>${escapeHtml(correlation)}</b></div><div><span>Model sağlığı</span><b>${escapeHtml(item.modelHealth?.status || "ISINIYOR")}</b></div></div>
    ${item.decisionDelta ? `<div class="evidence-note"><b>KARAR FARKI</b><span>${escapeHtml(item.decisionDelta)}</span></div>` : ""}
    ${kapLine}${paperLine}
  </section>`;
}

function recommendationCard(item, index) {
  const actionClass = item.eligible ? "candidate" : item.nearMiss ? "watch" : "blocked";
  const order = item.orderPlan || item.levels || {};
  const gateNames = { setup: "Kurulum", backtest: "Backtest", model: "ML", validation: "Dönem dışı test", dataHealth: "Veri sağlığı", multiTimeframe: "Çoklu zaman", forecastReliability: "Tahmin güveni", relativeStrength: "Göreli güç", fundamental: "Temel", direction: "Yön", recentRegime: "Yakın dönem", stress: "Monte Carlo", liquidity: "Likidite/pump", executionQuality: "İşlem kalitesi", orderPlan: "Emir planı", dataFresh: "Tazelik", kap: "KAP", market: item.market === "crypto" ? "BTC/piyasa" : "Piyasa", performance: "Kâğıt performans", modelHealth: "Model sağlığı", portfolio: "Portföy riski", portfolioStress: "Portföy stresi" };
  const gates = Object.entries(item.gates || {}).map(([name, passed]) => `<span class="gate ${passed ? "pass" : "fail"}">${passed ? "✓" : "×"} ${escapeHtml(gateNames[name] || name)}</span>`).join("");
  const failedItems = item.failedGates || Object.entries(item.gates || {}).filter(([, passed]) => !passed).map(([key]) => ({ key, label: gateNames[key] || key }));
  const failedMessages = failedItems.map((gate) => gate.message || item.gateDiagnostics?.[gate.key]?.message || gate.label).filter(Boolean);
  const failedBanner = item.eligible
    ? `<div class="gate-summary passed"><b>TÜM KAPILAR GEÇTİ</b><span>${escapeHtml(order.label || "Limit ve stop planı")} etkin.</span></div>`
    : `<div class="gate-summary failed"><b>${item.nearMiss ? `YATIR'A ${item.distanceToEligible || failedItems.length} KAPI KALDI` : "NE DEĞİŞMELİ?"}</b><span>${escapeHtml(failedMessages.length ? failedMessages.slice(0, 3).join(" | ") : "Güvenlik koşulları tamamlanmadı")}</span></div>`;
  const reasons = (Array.isArray(item.reasons) ? item.reasons : ["Araştırma gerekçesi mevcut değil."]).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  const orderSection = item.eligible ? `<div class="order-title"><span>${escapeHtml(order.label || "ÖNERİLEN EMİR PLANI")}</span><b>${order.validPlanCount || 1}/3 plan geçerli</b></div>
    <div class="levels order-levels"><div class="entry"><span>Alış limiti</span><b>${formatPrice(item, order.limitBuy)}</b></div><div class="stop"><span>Stop tetik</span><b>${formatPrice(item, order.stopTrigger)}</b></div><div class="stop"><span>Stop-limit</span><b>${formatPrice(item, order.stopLimit)}</b></div><div class="target"><span>Hedef 1</span><b>${formatPrice(item, order.target1)}</b></div><div class="target"><span>Hedef 2</span><b>${formatPrice(item, order.target2)}</b></div><div><span>Geçerlilik</span><b>${escapeHtml(order.validUntil || "Yeni veri gelene kadar")}</b></div><div><span>Önerilen adet</span><b>${formatQuantity(item, item.positionSizing?.quantity)}</b></div><div><span>Pozisyon büyüklüğü</span><b>${formatMoney(item.positionSizing?.positionValue)}</b></div><div class="stop"><span>Azami kayıp</span><b>${formatMoney(item.positionSizing?.maxLoss)}</b></div></div>` : `<div class="inactive-order"><b>YATIRMA</b><span>Emir seviyesi etkin değil; eksik kapılar yukarıda açıkça gösteriliyor.</span></div>`;
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
  const watchFlag = item.autoWatched ? `<div class="watch-flag">◎ Otomatik takipte · sonraki taramada kapı mesafesi yeniden ölçülecek</div>` : "";
  const nextAction = `<div class="next-action ${item.nextCondition?.ready ? "ready" : "waiting"}"><b>${item.nextCondition?.ready ? "SONRAKİ ADIM" : "YATIR İÇİN GEREKEN"}</b><span>${escapeHtml(item.nextCondition?.primary || (item.eligible ? "Limit emri koşulu izleniyor." : "Eksik kapılar yeniden hesaplanıyor."))}</span></div>`;
  const decisionChange = item.decisionChange ? `<div class="decision-change"><b>SON TARAMADAN BERİ</b><span>${escapeHtml(item.decisionChange.summary)}</span></div>` : "";
  return `<article class="stock-card ${item.eligible ? "candidate" : ""} ${item.autoWatched ? "watched" : ""}">
    <div class="stock-head"><span class="rank">${index + 1}</span><div class="stock-name"><div><b>${escapeHtml(item.displaySymbol || item.symbol)}</b><em class="market-badge ${marketClass}">${escapeHtml(item.marketLabel || marketClass.toUpperCase())}</em></div><span>${formatPrice(item, item.price)} · veri ${escapeHtml(item.dataDate)} · ${age}</span></div><span class="action ${actionClass}">${escapeHtml(item.action)}</span></div>
    <div class="score-row"><span>Birleşik güç</span><div class="score-bar"><i style="width:${Math.max(0, Math.min(100, Math.round(item.rankScore || 0)))}%"></i></div><b>${Math.round(item.rankScore || 0)}</b></div>
    ${watchFlag}
    ${nextAction}${decisionChange}
    ${failedBanner}
    <div class="strategy-line"><span>SEÇİLEN STRATEJİ</span><b>${escapeHtml(item.strategy?.label || "Trend devamı")}</b><em>${item.strategy?.comparisons?.length || 1} model karşılaştırıldı</em></div>
    ${evidencePanel(item)}
    <div class="direction-title"><span>YÖN ARAŞTIRMASI</span><b>${escapeHtml(item.direction || "BELİRSİZ")}</b></div>
    <div class="forecast-grid">${forecasts}</div>
    <div class="stock-metrics">${metricCells(item)}</div>
    ${orderSection}
    <div class="gate-list">${gates}</div>
    <p class="stop-warning">⚠ Stop-limit sert harekette gerçekleşmeyebilir. Sistem yalnız kapanmış mumlarla otomatik kâğıt işlem izler; İş Bankası veya Binance'a emir göndermez.</p>
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
    const open = ["AÇIK", "EMİR BEKLİYOR", "AKTİF", "TAŞINAN STOP"].includes(record.status);
    const statusClass = open ? "open" : Number.isFinite(record.resultR) && record.resultR > 0 ? "win" : record.status === "STOP" ? "loss" : "expired";
    const entryLabel = record.fillPrice ? "Dolum" : "Limit";
    const resultText = Number.isFinite(record.resultR) ? `${record.resultR > 0 ? "+" : ""}${fmt(record.resultR, 2)}R` : record.status === "TAŞINAN STOP" ? `${fmt(record.realizedR, 2)}R gerçekleşti` : "—";
    return `<article class="history-row"><div><em class="market-badge ${record.market === "crypto" ? "crypto" : "bist"}">${escapeHtml(record.marketLabel)}</em><b>${escapeHtml(record.displaySymbol || record.symbol)}</b><small>${new Date(record.createdAt || record.openedAt).toLocaleString("tr-TR")}</small></div><div><span>${entryLabel}</span><b>${formatPrice(item, record.fillPrice || record.entry)}</b></div><div><span>Son / sonuç</span><b>${escapeHtml(resultText)}</b></div><strong class="history-status ${statusClass}">${escapeHtml(record.status)}</strong></article>`;
  }).join("");
  return `<div class="history-summary"><article><span>Limit bekleyen</span><b>${stats.pending || 0}</b></article><article><span>Aktif</span><b>${stats.active || 0}</b></article><article><span>Sonuçlanan</span><b>${stats.resolved || 0}</b></article><article><span>Pozitif sonuç</span><b>${winRate}</b></article><article><span>Ortalama</span><b>${stats.averageR == null ? "—" : `${fmt(stats.averageR, 2)}R`}</b></article><article><span>Toplam R</span><b>${fmt(stats.totalR || 0, 2)}R</b></article></div><p class="history-note">${escapeHtml(history?.note || "Kapanmış mumlarla otomatik kâğıt işlem izlenir; gerçek işlem kaydı değildir.")}</p>${rows || '<div class="empty-card"><h2>Henüz kâğıt emir yok</h2><p>Bir varlık tüm kapıları geçtiğinde limit emri otomatik izlenmeye başlar; dolmadan pozisyon sayılmaz.</p></div>'}`;
}

function renderJournal(journal) {
  const entries = journal?.entries || [];
  const rows = entries.map((entry) => {
    const market = entry.market === "crypto" ? "crypto" : "bist";
    const positive = entry.action === "YATIR";
    const date = new Date(entry.at);
    const time = Number.isFinite(date.getTime()) ? date.toLocaleString("tr-TR") : "—";
    return `<article class="journal-row"><header><em class="market-badge ${market}">${market === "crypto" ? "KRİPTO" : "BIST"}</em><b>${escapeHtml(entry.displaySymbol || entry.symbol)}</b><time>${escapeHtml(time)}</time></header><strong class="journal-action ${positive ? "positive" : ""}">${escapeHtml(entry.action || "YATIRMA")}</strong><p>${escapeHtml(entry.summary || "Karar değişimi kaydedildi.")}</p><small>Sonraki koşul: ${escapeHtml(entry.next || "Yeni taramada yeniden hesaplanacak.")}</small></article>`;
  }).join("");
  return `<div class="journal-summary">Son 250 karar değişimi yerel olarak saklanır. Bu günlük sinyalin hangi kapı nedeniyle açıldığını veya kapandığını gösterir; gerçek emir kaydı değildir.</div>${rows || '<div class="empty-card"><h2>Henüz karar değişimi yok</h2><p>İlk v3.1 taramasından sonra değişen kapılar burada zaman sırasıyla görünür.</p></div>'}`;
}

function legacyToCombined(result) {
  if (result?.version >= 4 && result.markets) return result;
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
  const tabMap = { all: "tabAll", bist: "tabBist", crypto: "tabCrypto", watch: "tabWatch", history: "tabHistory", journal: "tabJournal" };
  for (const [tab, id] of Object.entries(tabMap)) $(id).classList.toggle("active", activeTab === tab);
  const isHistory = activeTab === "history";
  const isJournal = activeTab === "journal";
  $("recommendations").hidden = isHistory || isJournal;
  $("historyPanel").hidden = !isHistory;
  $("journalPanel").hidden = !isJournal;
  if (isHistory) {
    $("recommendationTitle").textContent = "Sinyal geçmişi";
    $("universeLabel").textContent = "Otomatik kâğıt emir · gerçek aracı kurum işlemi değil";
    $("historyPanel").innerHTML = renderHistory(currentResult.signalHistory);
    return;
  }
  if (isJournal) {
    $("recommendationTitle").textContent = "Karar günlüğü";
    $("universeLabel").textContent = "Açılan/kapanan kapılar · son 250 değişim";
    $("journalPanel").innerHTML = renderJournal(currentResult.decisionJournal);
    return;
  }
  const filtered = (currentResult.recommendations || []).filter((item) => activeTab === "all" || activeTab === "watch" ? (activeTab === "all" || item.autoWatched || item.nearMiss) : item.market === activeTab);
  $("recommendationTitle").textContent = activeTab === "bist" ? "En güçlü BIST hisseleri" : activeTab === "crypto" ? "En güçlü spot kriptolar" : activeTab === "watch" ? "Otomatik yakın takip" : "En güçlü varlıklar";
  $("universeLabel").textContent = activeTab === "bist" ? currentResult.markets?.bist?.universe || "Geniş BIST" : activeTab === "crypto" ? currentResult.markets?.crypto?.universe || "Binance USDT spot" : activeTab === "watch" ? currentResult.nearWatch?.note || "Her taramada kapı mesafesi ölçülür" : currentResult.universe;
  $("recommendations").innerHTML = filtered.map(recommendationCard).join("") || `<div class="empty-card"><h2>${activeTab === "watch" ? "Yakın takipte varlık yok" : "Bu piyasada sonuç yok"}</h2><p>${activeTab === "watch" ? "Bir varlık en fazla üç kapı uzakta olduğunda otomatik olarak buraya eklenir." : "Veri uyarılarını inceleyip daha sonra yeniden tara."}</p></div>`;
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
  $("paperOpenCount").textContent = result.signalHistory?.stats?.open || 0;
  $("dataHealthCount").textContent = `${(result.recommendations || []).filter((item) => item.dataHealth?.passed).length}/${(result.recommendations || []).length}`;
  const healthSummaries = Object.values(result.modelHealth?.summaries || {});
  $("modelHealthStatus").textContent = healthSummaries.some((item) => item.status === "KİLİTLİ") ? "KİLİTLİ" : healthSummaries.some((item) => item.status === "STABİL") ? "STABİL" : "ISINIYOR";
  $("portfolioStressPct").textContent = result.portfolioStress ? `%${fmt(result.portfolioStress.shockLossPct, 2)}` : "—";
  if ($("paperCapital")) $("paperCapital").value = String(result.settings?.paperCapital || 100000);
  $("evidenceACount").textContent = (result.recommendations || []).filter((item) => item.evidenceGrade === "A" || item.validation?.evidenceGrade === "A").length;
  const bistCount = (result.recommendations || []).filter((item) => item.market !== "crypto").length;
  const cryptoCount = (result.recommendations || []).filter((item) => item.market === "crypto").length;
  $("allCount").textContent = (result.recommendations || []).length;
  $("bistCount").textContent = bistCount;
  $("cryptoCount").textContent = cryptoCount;
  $("watchCount").textContent = result.nearWatch?.count ?? (result.recommendations || []).filter((item) => item.autoWatched || item.nearMiss).length;
  $("historyCount").textContent = result.signalHistory?.records?.length || 0;
  $("journalCount").textContent = result.decisionJournal?.entries?.length || 0;
  $("errorDetails").hidden = !result.errorCount;
  $("errorCount").textContent = result.errorCount;
  $("errorList").innerHTML = (result.errors || []).map((error) => `<li><b>${escapeHtml(error.symbol)}</b> · ${escapeHtml(error.message)}</li>`).join("");
  renderActiveTab();
  setStatus(result.candidateCount ? `YATIR · ${result.candidateCount}` : "YATIRMA");
}

function scheduleCapitalUpdate() {
  clearTimeout(capitalTimer);
  capitalTimer = setTimeout(async () => {
    const value = Number($("paperCapital")?.value);
    if (!Number.isFinite(value) || value < 1000) return;
    setStatus("Risk planı güncelleniyor");
    try {
      const response = await sendMessage("SET_PAPER_CAPITAL", { paperCapital: value });
      if (response?.result) render(response.result);
      else setStatus("Bir sonraki taramada uygulanacak");
    } catch { setStatus("Sermaye yerelde kaydedilemedi", true); }
  }, 600);
}

async function fallbackScan() {
  const progress = ({ completed, total, symbol }) => showProgress(true, completed, total, symbol);
  const [bistOutcome, cryptoOutcome] = await Promise.allSettled([
    FinPilotAutoScanner.runScan({ onProgress: progress }),
    FinPilotCryptoScanner.runScan({ onProgress: progress }),
  ]);
  const empty = (market, outcome) => ({ market, scannedCount: 0, requestedCount: 0, candidateCount: 0, errorCount: 1, recommendations: [], snapshot: [], errors: [{ symbol: market.toUpperCase(), message: outcome.reason?.message || String(outcome.reason) }], marketRegime: { gateOpen: false, dataSufficient: false, breadthPct: 0 } });
  const stored = await chrome.storage.local.get(["finpilotAutomaticScan", "finpilotSignalHistory", "finpilotNearWatch", "finpilotDecisionJournal", "finpilotResearchSettings"]);
  const bistRaw = bistOutcome.status === "fulfilled" ? bistOutcome.value : empty("bist", bistOutcome);
  const cryptoRaw = cryptoOutcome.status === "fulfilled" ? cryptoOutcome.value : empty("crypto", cryptoOutcome);
  const bist = FinPilotSignalTracker.applyPerformanceGuard(bistRaw, stored.finpilotSignalHistory || null);
  const crypto = FinPilotSignalTracker.applyPerformanceGuard(cryptoRaw, stored.finpilotSignalHistory || null);
  let result = FinPilotMarketAggregator.combineResults(bist, crypto, new Date());
  result = FinPilotDecisionIntelligence.applyRelativeStrength(result);
  result = FinPilotPortfolioRisk.applyPortfolioRisk(result, stored.finpilotSignalHistory || null);
  result = FinPilotDecisionIntelligence.applyModelHealth(result, stored.finpilotSignalHistory || null);
  const settings = { paperCapital: Number(stored.finpilotResearchSettings?.paperCapital) || 100000 };
  result = FinPilotDecisionIntelligence.applyPositionSizingAndStress(result, stored.finpilotSignalHistory || null, settings);
  const history = FinPilotSignalTracker.updateHistory(stored.finpilotSignalHistory || null, result, new Date());
  const journalUpdate = FinPilotDecisionIntelligence.updateDecisionJournal(stored.finpilotAutomaticScan || null, result, stored.finpilotDecisionJournal || null, new Date());
  result = journalUpdate.result;
  const watch = FinPilotNearWatch.updateWatch(stored.finpilotNearWatch || null, result, new Date());
  const watchedResult = FinPilotNearWatch.attachToResult(result, watch);
  watchedResult.version = 7;
  watchedResult.settings = settings;
  watchedResult.signalHistory = history;
  await chrome.storage.local.set({ finpilotAutomaticScan: watchedResult, finpilotSignalHistory: history, finpilotNearWatch: watch, finpilotDecisionJournal: journalUpdate.journal, finpilotResearchSettings: settings });
  return watchedResult;
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
  $("tabWatch").addEventListener("click", () => selectTab("watch"));
  $("tabHistory").addEventListener("click", () => selectTab("history"));
  $("tabJournal").addEventListener("click", () => selectTab("journal"));
  $("paperCapital")?.addEventListener("input", scheduleCapitalUpdate);
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
