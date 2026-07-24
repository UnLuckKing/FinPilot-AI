const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
let activeTab = "scanner";
let busy = false;
let scannerLoaded = false;
let lastSymbol = "";
let lastAnalyzedAt = "";
let lastResult = null;
let selectedHorizon = "INTRADAY";
let activeCategory = "ALL";
let activeDirection = "ALL";
let scanRequestId = 0;

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => void switchTab(button.dataset.tab));
});
document.querySelectorAll(".market-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll(".market-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    void renderStoredScan();
  });
});
document.querySelectorAll(".direction-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeDirection = button.dataset.direction;
    document.querySelectorAll(".direction-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    void renderStoredScan();
  });
});
elements.refreshButton.addEventListener("click", () => void refreshCurrent());
elements.clearHistoryButton.addEventListener("click", () => void clearHistory());
document.querySelectorAll(".horizon-card").forEach((button) => {
  button.addEventListener("click", () => {
    selectedHorizon = button.dataset.horizon;
    if (lastResult) renderSelectedHorizon(lastResult);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.latestBySymbol && activeTab === "analysis") void renderLatestForActiveContext();
  if ((changes.candidateSignals || changes.signalOutcomes) && activeTab === "evidence") void loadEvidence();
  if ((changes.marketScanProgress || changes.marketScanResults || changes.opportunityInbox) && activeTab === "scanner") void renderStoredScan();
});

void initialize();
setInterval(() => {
  if (document.visibilityState === "visible" && activeTab === "analysis" && !busy) void analyzeActive(false);
}, 60_000);
setInterval(updateCandleCountdown, 1_000);

async function initialize() {
  await scanWatchlist();
}

async function switchTab(name, options = {}) {
  activeTab = name;
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  elements[`${name}View`]?.classList.add("active");
  if (name === "scanner" && !scannerLoaded) await scanWatchlist();
  if (name === "analysis" && options.refresh !== false) await analyzeActive(true);
  if (name === "evidence") await loadEvidence();
}

async function refreshCurrent() {
  if (activeTab === "scanner") {
    await scanMarket(true);
    return;
  }
  if (activeTab === "evidence") {
    await loadEvidence();
    return;
  }
  await analyzeActive(true);
}

async function analyzeActive(showLoading) {
  if (busy) return;
  busy = true;
  elements.refreshButton.disabled = true;
  if (showLoading) showState("loading");
  try {
    const response = await send({ action: "ANALYZE_ACTIVE" });
    if (!response?.ok || !response.result) throw new Error(response?.error || "Analiz sonucu alınamadı");
    lastSymbol = response.result.symbol;
    lastAnalyzedAt = response.result.analyzedAt;
    renderAnalysis(response.result, response.context);
  } catch (error) {
    showError(error?.message || "TradingView grafiği algılanamadı");
  } finally {
    busy = false;
    elements.refreshButton.disabled = false;
  }
}

async function renderLatestForActiveContext() {
  try {
    const [contextResponse, dashboard] = await Promise.all([
      send({ action: "GET_ACTIVE_CONTEXT" }),
      send({ action: "GET_DASHBOARD" })
    ]);
    const symbol = contextResponse?.context?.symbol;
    const result = symbol ? dashboard?.latest?.[symbol] : null;
    if (result && (result.symbol !== lastSymbol || result.analyzedAt !== lastAnalyzedAt)) {
      lastSymbol = result.symbol;
      lastAnalyzedAt = result.analyzedAt;
      renderAnalysis(result, contextResponse?.context);
    }
  } catch {
    // Periodic refresh is the fallback.
  }
}

function renderAnalysis(result, context = null) {
  const symbolChanged = lastResult?.symbol !== result.symbol;
  lastResult = result;
  if (symbolChanged || !result.horizons?.[horizonProperty(selectedHorizon)]) {
    selectedHorizon = result.primaryHorizon ?? "INTRADAY";
  }
  showState("content");
  setText("marketBadge", result.market || "OTHER");
  setText("symbolName", result.symbol || "—");
  setText("sourceText", `${result.sourceLabel || "Kaynak yok"} · ${formatTime(result.barTime)}`);
  renderDetection(context, result.symbol);
  setText("healthText", `Veri ${number(result.dataHealth, 0)}/100`);
  elements.healthDot.style.background = result.dataHealth >= 80 ? "var(--green)" : result.dataHealth >= 55 ? "var(--amber)" : "var(--red)";

  renderHorizonCards(result);
  renderSelectedHorizon(result);

  renderDirection("intradayDirection", result.directions?.intraday, "intradayScore", `${signed(result.directionScores?.intraday)}/100`);
  renderDirection("oneDayDirection", result.directions?.oneDay, "oneDayRange", `Beklenen ${formatRange(result.expectedRanges?.oneDay)}`);
  renderDirection("oneWeekDirection", result.directions?.oneWeek, "oneWeekRange", `Beklenen ${formatRange(result.expectedRanges?.oneWeek)}`);
  setText("analysisTime", `Analiz: ${formatTime(result.analyzedAt)} · ${result.disclaimer}`);
  updateCandleCountdown();
}

function renderSelectedHorizon(result) {
  const decision = horizonDecision(result, selectedHorizon);
  if (!decision) return;
  document.querySelectorAll(".horizon-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.horizon === decision.horizon);
  });
  const verdictClass = verdictClassName(decision.verdictCode, decision.tradeSide, decision.verdict);
  elements.verdictCard.className = `verdict-card ${verdictClass}`;
  setText("decisionEyebrow", `${decision.horizonLabel ?? "15 DK"} SİSTEM KARARI`);
  setText("verdictText", decision.decisionLabel ?? decision.verdict);
  setText("verdictNote", verdictNote(decision));
  setText("technicalScore", `${number(decision.technicalScore, 0)}/100`);
  setText("dataHealth", `${number(result.dataHealth, 0)}/100`);
  setText("setupName", decision.setup || "—");
  setText("signalState", decision.signalState || "—");
  setText("tradeSidePill", decision.tradeSide || "—");
  elements.tradeSidePill.className = `pill ${String(decision.tradeSide ?? "NONE").toLowerCase()}`;
  setText("triggerText", decision.trigger?.confirmationText || "Yeni kapanış bekleniyor");
  setText("decisionChangeText", decision.trigger?.invalidationText || decision.plan?.invalidation || "—");
  setText("executionGuard", decision.tradeSide === "SHORT"
    ? `${decision.execution?.status || "SHORT KONTROLÜ"} · ${decision.execution?.label || "Uygun ürün doğrulanmalı"}`
    : "LONG planı · Alım işlemini kendi aracı kurumunda sen uygularsın.");
  elements.executionGuard.classList.toggle("blocked", decision.tradeSide === "SHORT" && !decision.execution?.actionable);

  if (decision.plan) {
    elements.planSection.classList.remove("hidden");
    setText("planTitle", decision.plan.side === "SHORT" ? `${decision.horizonLabel} düşüş / SHORT` : `${decision.horizonLabel} yükseliş / LONG`);
    setText("riskRewardPill", `${number(decision.plan.effectiveRewardRisk, 2)} R`);
    setText("entryLow", price(decision.plan.entryLow));
    setText("entryHigh", price(decision.plan.entryHigh));
    setText("maximumChase", price(decision.plan.maximumChase));
    setText("chaseLabel", decision.plan.side === "SHORT" ? "Altında kovalama" : "Üstünde kovalama");
    setText("stopPrice", price(decision.plan.stop));
    setText("targetOne", price(decision.plan.target1));
    setText("targetTwo", price(decision.plan.target2));
    setText("invalidationText", decision.plan.invalidation);
    setText("planValidity", `Geçerlilik: ${decision.plan.validity}`);
    setText("quantityText", `100.000 birim portföyde %${number(decision.plan.riskPercent ?? 0.5, 2)} örnek risk adedi: ${number(decision.plan.quantityPer100k, 0)}`);
  } else {
    elements.planSection.classList.add("hidden");
  }

  renderLifecycle(decision);
  renderStrategyTournament(decision);
  renderPlanB(decision);
  renderList(elements.reasonList, decision.reasons?.length ? decision.reasons : ["Olumlu teyit yok"]);
  renderList(elements.blockerList, unique([...(decision.blockers ?? []), ...(decision.failed ?? [])]).slice(0, 9));
  setText("metricRsi", metric(decision.metrics?.rsi));
  setText("metricAdx", metric(decision.metrics?.adx));
  setText("metricVolume", decision.metrics?.relativeVolume ? `${number(decision.metrics.relativeVolume, 2)}x` : "—");
  setText("metricAtr", decision.metrics?.atrPercent ? `%${number(decision.metrics.atrPercent, 2)}` : "—");
  updateCandleCountdown();
}

function renderHorizonCards(result) {
  const intraday = horizonDecision(result, "INTRADAY");
  const swing = horizonDecision(result, "SWING");
  setText("intradayDecisionLabel", intraday?.decisionLabel ?? intraday?.verdict ?? "Veri yok");
  setText("intradayDecisionDetail", intraday ? `Güç ${number(intraday.technicalScore, 0)}/100 · ${intraday.setup}` : "15 dk planı yok");
  setText("swingDecisionLabel", swing?.decisionLabel ?? swing?.verdict ?? "Veri yok");
  setText("swingDecisionDetail", swing ? `Güç ${number(swing.technicalScore, 0)}/100 · ${swing.setup}` : "1–5 gün planı yok");
}

function renderLifecycle(decision) {
  const active = lifecycleStep(decision);
  const order = ["WATCH", "TRIGGER", "ENTRY", "TARGET1", "PROTECT", "EXIT"];
  document.querySelectorAll("[data-life-step]").forEach((node) => {
    const index = order.indexOf(node.dataset.lifeStep);
    const activeIndex = order.indexOf(active);
    node.classList.toggle("active", index === activeIndex);
    node.classList.toggle("done", activeIndex > index);
  });
  setText("lifecycleHeadline", decision.signalState ?? "Plan izleniyor");
  setText("lifecycleHorizon", decision.horizonLabel ?? "—");
  setText("lifecycleNote", decision.actionable
    ? `Giriş yalnız ${price(decision.plan?.entryLow)}–${price(decision.plan?.entryHigh)} gerçekleşirse başlar; Kâr 1 sonrası sistem stopu maliyete taşır.`
    : decision.planB?.allowNew === false
      ? decision.planB.reason
      : "Fiyat giriş bölgesine değmeden işlem başlamış sayılmaz.");
}

function lifecycleStep(decision) {
  if (decision.planB?.allowNew === false || decision.verdictCode <= 0) return "EXIT";
  if (decision.verdictCode === 4) return "ENTRY";
  if (decision.verdictCode === 3) return "TRIGGER";
  return "WATCH";
}

function renderStrategyTournament(decision) {
  const tournament = decision.strategyTournament;
  setText("regimeName", decision.regime?.label ?? tournament?.regime ?? "Piyasa rejimi yok");
  setText("selectedStrategy", decision.setup ?? "Kurulum yok");
  elements.strategyList.replaceChildren();
  for (const candidate of tournament?.candidates ?? []) {
    const row = document.createElement("div");
    row.className = `strategy-item${candidate.code === tournament.selectedCode ? " selected" : ""}`;
    const label = document.createElement("span");
    label.textContent = candidate.label;
    const bar = document.createElement("div");
    bar.className = "strategy-bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(0, Math.min(100, Number(candidate.score) || 0))}%`;
    bar.append(fill);
    const score = document.createElement("strong");
    score.textContent = `${number(candidate.score, 0)}`;
    row.append(label, bar, score);
    elements.strategyList.append(row);
  }
  if (!tournament?.candidates?.length) elements.strategyList.textContent = "Strateji karşılaştırması yok.";
}

function renderPlanB(decision) {
  const planB = decision.planB;
  setText("planBStatus", planB?.status ?? "NORMAL");
  setText("planBRisk", `%${number(planB?.riskPercent ?? decision.plan?.riskPercent ?? 0.5, 2)} risk`);
  setText("planBReason", planB?.reason ?? "Aynı sembol ve vadede etkin stop soğuması yok.");
  elements.planBPanel.classList.toggle("blocked", planB?.allowNew === false);
}

function horizonDecision(result, horizon) {
  const property = horizonProperty(horizon);
  return result?.horizons?.[property] ?? (result?.horizon === horizon ? result : null);
}

function horizonProperty(horizon) {
  return horizon === "SWING" ? "swing" : "intraday";
}

async function scanWatchlist() {
  scannerLoaded = true;
  await loadMarketCategories();
  await scanMarket();
}

async function loadMarketCategories() {
  try {
    const response = await send({ action: "GET_MARKET_CATEGORIES" });
    const counts = response?.counts ?? {};
    setText("countAll", counts.ALL ?? "—");
    setText("countBist", counts.BIST ?? "—");
    setText("countUs", counts.US ?? "—");
    setText("countCrypto", counts.CRYPTO ?? "—");
    setText("countForex", counts.FOREX ?? "—");
    setText("countMacro", counts.MACRO ?? "—");
  } catch {
    // Static fallback universe remains available in the background.
  }
}

async function scanMarket(force = false) {
  const requestId = ++scanRequestId;
  elements.scannerState.classList.remove("hidden");
  elements.scanSummary.classList.add("hidden");
  elements.nearestBanner.classList.add("hidden");
  elements.scannerResults.replaceChildren();
  elements.scannerState.querySelector(".spinner")?.classList.remove("hidden");
  setText("scanHeadline", "Tüm piyasalar otomatik hazırlanıyor");
  setText("scanProgressText", "KAP, Binance ve küresel piyasa kaynakları keşfediliyor.");
  elements.scanProgressBar.style.width = "0%";
  elements.refreshButton.disabled = true;
  try {
    const response = await send({ action: "SCAN_MARKET", category: "ALL", force });
    if (requestId !== scanRequestId) return;
    if (!response?.ok) throw new Error(response?.error || "Tarama tamamlanamadı");
    renderScanState({
      category: "ALL",
      total: response.total,
      discovered: response.discovered,
      shortlisted: response.shortlisted,
      discoveredCounts: response.counts,
      coverage: response.coverage,
      completed: response.results?.length ?? 0,
      status: "COMPLETED",
      stage: "COMPLETED"
    }, response.results ?? []);
  } catch (error) {
    if (requestId !== scanRequestId) return;
    setText("scanHeadline", "Tarama yapılamadı");
    setText("scanProgressText", error?.message || "Piyasa verisi okunamadı.");
    elements.scannerState.querySelector(".spinner")?.classList.add("hidden");
  } finally {
    if (requestId === scanRequestId) elements.refreshButton.disabled = false;
  }
}

function renderScanner(results) {
  elements.scannerResults.replaceChildren();
  for (const result of results.slice(0, 500)) {
    const row = document.createElement("article");
    row.className = "scanner-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.classList.add(String(result.tradeSide ?? "NONE").toLowerCase());
    row.addEventListener("click", () => void openScannerResult(result));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") row.click();
    });
    const body = document.createElement("div");
    const symbol = document.createElement("strong");
    symbol.textContent = result.symbol;
    const direction = document.createElement("span");
    const intraday = horizonDecision(result, "INTRADAY");
    const swing = horizonDecision(result, "SWING");
    direction.textContent = `15 DK: ${intraday?.decisionLabel ?? "—"} · 1–5 GÜN: ${swing?.decisionLabel ?? "—"}`;
    const score = document.createElement("small");
    score.textContent = `LONG ${number(result.sideScores?.long, 0)} · SHORT ${number(result.sideScores?.short, 0)} · Veri ${number(result.dataHealth, 0)}/100`;
    const missing = document.createElement("small");
    missing.className = "missing-gates";
    missing.textContent = result.blockers?.length || result.failed?.length
      ? `Eksik: ${unique([...(result.blockers ?? []), ...(result.failed ?? [])]).slice(0, 2).join(" · ")}`
      : `Kurulum: ${result.setup ?? "—"} · ${result.signalState ?? "—"}`;
    const select = document.createElement("small");
    select.className = "select-hint";
    select.textContent = "Ayrıntılı planı aç →";
    body.append(symbol, direction, score, missing, select);
    const verdict = document.createElement("div");
    verdict.className = `scanner-verdict ${verdictClassName(result.verdictCode, result.tradeSide, result.verdict)}`;
    verdict.textContent = result.decisionLabel ?? result.verdict;
    row.append(body, verdict);
    elements.scannerResults.append(row);
  }
  if (results.length === 0) elements.scannerResults.textContent = "Sonuç yok.";
}

async function openScannerResult(result) {
  lastSymbol = result.symbol;
  lastAnalyzedAt = result.analyzedAt;
  selectedHorizon = result.primaryHorizon ?? result.horizon ?? "INTRADAY";
  renderAnalysis(result, {
    symbol: result.symbol,
    source: "küresel piyasa taraması",
    confidence: 100,
    detectedAt: new Date().toISOString()
  });
  await switchTab("analysis", { refresh: false });
  setText("detectionText", `${result.symbol} grafikte açılıyor…`);
  try {
    const response = await send({ action: "OPEN_CHART_SYMBOL", symbol: result.symbol });
    if (!response?.ok) throw new Error(response?.error || "Grafik açılamadı");
    setTimeout(() => void analyzeExpectedSymbol(result.symbol, 1), 1_800);
  } catch (error) {
    setText("detectionText", `Tarama sonucu gösteriliyor · grafik açılamadı: ${error?.message || "bilinmeyen hata"}`);
  }
}

async function analyzeExpectedSymbol(symbol, attempt) {
  if (activeTab !== "analysis" || busy) return;
  await analyzeActive(false);
  if (lastSymbol !== symbol && attempt < 3) {
    setTimeout(() => void analyzeExpectedSymbol(symbol, attempt + 1), 1_500);
  }
}

async function renderStoredScan() {
  try {
    const dashboard = await send({ action: "GET_DASHBOARD" });
    if (!dashboard?.ok) return;
    renderScanState(dashboard.scanProgress, dashboard.scanResults ?? []);
    renderInbox(dashboard.inbox ?? [], dashboard.scanResults ?? []);
  } catch {
    // Active scan request remains the fallback.
  }
}

function renderInbox(items, results) {
  elements.opportunityInbox.classList.toggle("hidden", items.length === 0);
  setText("inboxCount", `${items.length} kayıt`);
  elements.inboxList.replaceChildren();
  for (const item of items.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "inbox-item";
    const body = document.createElement("div");
    const symbol = document.createElement("strong");
    symbol.textContent = item.symbol;
    const decision = document.createElement("span");
    decision.textContent = `${item.decisionLabel ?? item.verdict} · ${item.setup ?? "—"}`;
    const time = document.createElement("small");
    time.textContent = `${item.horizonLabel ?? item.horizon} · ${formatTime(item.createdAt)}`;
    body.append(symbol, decision, time);
    const score = document.createElement("small");
    score.textContent = `${number(item.technicalScore, 0)}/100`;
    row.append(body, score);
    row.addEventListener("click", () => void openInboxItem(item, results));
    elements.inboxList.append(row);
  }
}

async function openInboxItem(item, results) {
  let result = results.find((candidate) => candidate.symbol === item.symbol);
  if (!result) {
    const response = await send({ action: "ANALYZE_SYMBOL", symbol: item.symbol });
    result = response?.result;
  }
  if (!result) return;
  selectedHorizon = item.horizon ?? result.primaryHorizon ?? "INTRADAY";
  await openScannerResult(result);
  selectedHorizon = item.horizon ?? selectedHorizon;
  renderSelectedHorizon(result);
}

function renderScanState(progress, results) {
  if (!progress) return;
  const total = Number(progress.total) || results.length;
  const completed = Number(progress.completed) || results.length;
  const categoryResults = results.filter((item) => matchesCategory(item, activeCategory));
  const filteredResults = categoryResults
    .map((item) => projectForDirection(item, activeDirection))
    .filter(Boolean);
  const discoveredCounts = progress.discoveredCounts ?? {};
  const coverage = progress.coverage ?? {};
  const discovered = activeCategory === "ALL"
    ? Number(progress.discovered) || Object.values(discoveredCounts).reduce((sum, value) => sum + (Number(value) || 0), 0)
    : Number(discoveredCounts[activeCategory]) || 0;
  const shortlisted = activeCategory === "ALL"
    ? Number(progress.shortlisted) || Number(progress.total) || 0
    : Number(coverage[activeCategory]) || 0;
  const categoryCompleted = activeCategory === "ALL" ? completed : filteredResults.length;
  const categoryTotal = activeCategory === "ALL" ? total : shortlisted;
  const percent = scanPercent(progress, completed, total);
  const completedScan = progress.status === "COMPLETED";
  const longCount = categoryResults.filter((item) => decisionForSide(item, "LONG", 3)).length;
  const shortCount = categoryResults.filter((item) => decisionForSide(item, "SHORT", 3)).length;
  const declineCount = categoryResults.filter((item) =>
    Object.values(item.horizons ?? { primary: item }).some((decision) => decision.verdictCode === 1)
  ).length;
  const confirmedCount = categoryResults.filter((item) =>
    Object.values(item.horizons ?? { primary: item }).some((decision) => decision.verdictCode === 4)
  ).length;

  elements.scanSummary.classList.remove("hidden");
  setText("scanDiscovered", discovered);
  setText("scanShortlisted", shortlisted);
  setText("scanCompleted", `${categoryCompleted}/${categoryTotal}`);
  setText("scanInvestCount", longCount);
  setText("scanOptionalCount", shortCount);
  setText("scanNoDataCount", declineCount);
  setText("scanHeadline", scanHeadline(progress, activeCategory));
  setText("scanProgressText", scanProgressText(progress, {
    completed,
    total,
    filtered: filteredResults.length,
    completedScan
  }));
  elements.scanProgressBar.style.width = `${percent}%`;
  elements.scannerState.querySelector(".spinner")?.classList.toggle("hidden", completedScan);
  elements.nearestBanner.classList.toggle("hidden", !completedScan || confirmedCount > 0 || filteredResults.length === 0);
  renderBestOpportunities(categoryResults, completedScan);
  renderScanner(filteredResults);
}

function scanPercent(progress, completed, total) {
  if (progress.status === "COMPLETED") return 100;
  if (progress.stage === "DISCOVERY") return 5;
  if (progress.stage === "PREFILTER") {
    const screened = Number(progress.screened) || 0;
    const screenTotal = Number(progress.screenTotal) || 1;
    return Math.min(45, 10 + Math.round((screened / screenTotal) * 35));
  }
  return total > 0 ? Math.min(99, 45 + Math.round((completed / total) * 54)) : 45;
}

function scanHeadline(progress, category) {
  if (progress.status === "COMPLETED") return `${categoryLabel(category)} fırsat taraması tamamlandı`;
  if (progress.stage === "DISCOVERY") return "Tüm piyasa evreni keşfediliyor";
  if (progress.stage === "PREFILTER") return "Tüm BIST hızlı ön elemeden geçiyor";
  return "En güçlü adaylar derin analiz ediliyor";
}

function scanProgressText(progress, state) {
  if (state.completedScan) {
    return `${state.filtered} sonuç karar gücüne göre sıralandı; piyasa düğmeleri yalnız sonuçları filtreler.`;
  }
  if (progress.stage === "DISCOVERY") {
    return "KAP, Binance ve ABD piyasa tarayıcıları otomatik okunuyor.";
  }
  if (progress.stage === "PREFILTER") {
    return `${Number(progress.screened) || 0}/${Number(progress.screenTotal) || 0} BIST sembolü ön elemeden geçti; geçerli veri ${Number(progress.screenValid) || 0}.`;
  }
  return `${state.completed}/${state.total} güçlü aday analiz edildi; sonuçlar aşağıya anlık ekleniyor.`;
}

function matchesCategory(result, category) {
  if (category === "ALL") return true;
  const exchange = String(result?.exchange ?? "").toUpperCase();
  const market = String(result?.market ?? "").toUpperCase();
  if (category === "BIST") return exchange === "BIST";
  if (category === "US") return ["NASDAQ", "NYSE", "AMEX"].includes(exchange);
  if (category === "CRYPTO") return market === "CRYPTO";
  if (category === "FOREX") return market === "FOREX";
  if (category === "MACRO") return ["INDEX", "FUTURES", "COMMODITY"].includes(market);
  return true;
}

function matchesDirection(result, direction) {
  if (direction === "ALL") return true;
  return Boolean(decisionForSide(result, direction, -1));
}

function renderBestOpportunities(results, completedScan) {
  elements.bestOpportunities.classList.toggle("hidden", !completedScan || results.length === 0);
  if (!completedScan || results.length === 0) return;
  const bestLong = bestForSide(results, "LONG");
  const bestShort = bestForSide(results, "SHORT");
  renderBestCard("bestLong", bestLong, "Yükseliş adayı yok");
  renderBestCard("bestShort", bestShort, "Düşüş adayı yok");
  elements.bestLongCard.onclick = bestLong ? () => void openScannerResult(bestLong) : null;
  elements.bestShortCard.onclick = bestShort ? () => void openScannerResult(bestShort) : null;
  elements.bestLongCard.classList.toggle("disabled", !bestLong);
  elements.bestShortCard.classList.toggle("disabled", !bestShort);
}

function bestForSide(results, side) {
  return results
    .map((item) => projectForDirection(item, side))
    .filter((item) => item && item.verdictCode >= 1 && item.dataHealth >= 55)
    .sort((left, right) =>
      (Number(right.opportunityScore) || 0) - (Number(left.opportunityScore) || 0) ||
      (Number(right.technicalScore) || 0) - (Number(left.technicalScore) || 0)
    )[0] ?? null;
}

function projectForDirection(result, direction) {
  if (direction === "ALL") return result;
  const decision = decisionForSide(result, direction, -1);
  return decision ? { ...result, ...decision, primaryHorizon: decision.horizon } : null;
}

function decisionForSide(result, side, minimumCode = -1) {
  return Object.values(result?.horizons ?? { primary: result })
    .filter((decision) => decision?.tradeSide === side && Number(decision.verdictCode) >= minimumCode)
    .sort((left, right) =>
      Number(right.verdictCode) - Number(left.verdictCode) ||
      Number(right.opportunityScore) - Number(left.opportunityScore)
    )[0] ?? null;
}

function renderBestCard(prefix, result, emptyText) {
  setText(`${prefix}Symbol`, result?.symbol || emptyText);
  setText(`${prefix}Detail`, result
    ? `${result.decisionLabel ?? result.verdict} · Güç ${number(result.technicalScore, 0)}/100 · ${result.setup}`
    : "Güvenli koşulları geçen aday bulunamadı.");
}

async function loadEvidence() {
  try {
    const dashboard = await send({ action: "GET_DASHBOARD" });
    if (!dashboard?.ok) throw new Error(dashboard?.error || "Kanıt verisi okunamadı");
    const evidence = dashboard.evidence ?? {};
    setText("observedAccuracy", evidence.observedAccuracy == null ? "—" : `%${number(evidence.observedAccuracy, 1)}`);
    setText("evidenceInterval", evidence.interval ? `%95 aralık %${evidence.interval[0]}–%${evidence.interval[1]} · ${evidence.sampleSize} sonuç` : "Henüz kapanmış aday sinyal yok");
    setText("evidenceGrade", evidence.grade ?? "KANIT YOK");
    const longEvidence = evidence.bySide?.LONG ?? {};
    const shortEvidence = evidence.bySide?.SHORT ?? {};
    setText("longAccuracy", longEvidence.observedAccuracy == null ? "—" : `%${number(longEvidence.observedAccuracy, 1)}`);
    setText("longSample", `${longEvidence.sampleSize ?? 0} sonuç`);
    setText("shortAccuracy", shortEvidence.observedAccuracy == null ? "—" : `%${number(shortEvidence.observedAccuracy, 1)}`);
    setText("shortSample", `${shortEvidence.sampleSize ?? 0} sonuç`);
    const intradayEvidence = evidence.byHorizon?.INTRADAY ?? {};
    const swingEvidence = evidence.byHorizon?.SWING ?? {};
    setText("intradayAccuracy", intradayEvidence.observedAccuracy == null ? "—" : `%${number(intradayEvidence.observedAccuracy, 1)}`);
    setText("intradaySample", `${intradayEvidence.sampleSize ?? 0} sonuç`);
    setText("swingAccuracy", swingEvidence.observedAccuracy == null ? "—" : `%${number(swingEvidence.observedAccuracy, 1)}`);
    setText("swingSample", `${swingEvidence.sampleSize ?? 0} sonuç`);
    setText("observedExpectancy", evidence.expectancyR == null ? "—" : `${evidence.expectancyR > 0 ? "+" : ""}${number(evidence.expectancyR, 2)}R`);
    setText("candidateCount", `${dashboard.candidates?.length ?? 0} aday`);
    setText("outcomeCount", `${dashboard.outcomes?.length ?? 0} kapanmış`);
    renderHistory(elements.candidateList, dashboard.candidates ?? [], false);
    renderHistory(elements.outcomeList, dashboard.outcomes ?? [], true);
  } catch (error) {
    elements.outcomeList.textContent = error?.message || "Kanıt verisi okunamadı";
  }
}

function renderHistory(container, items, closed) {
  container.replaceChildren();
  container.classList.toggle("empty-note", items.length === 0);
  if (items.length === 0) {
    container.textContent = closed ? "Sonuç yok." : "Açık aday yok.";
    return;
  }
  for (const item of items.slice(0, 30)) {
    const row = document.createElement("div");
    row.className = "history-item";
    const body = document.createElement("div");
    const symbol = document.createElement("strong");
    symbol.textContent = item.symbol;
    const detail = document.createElement("span");
    detail.textContent = `${item.horizonLabel ?? item.horizon ?? "15 DK"} · ${item.side ?? item.plan?.side ?? "LONG"} · ${item.decisionLabel ?? item.verdict} · ${formatTime(item.createdAt)}`;
    const status = document.createElement("small");
    status.textContent = closed
      ? `${outcomeLabel(item.result)}${Number.isFinite(Number(item.realizedR)) ? ` · ${signedR(item.realizedR)}` : ""}`
      : item.state ?? "TAKİPTE";
    body.append(symbol, detail);
    row.append(body, status);
    container.append(row);
  }
}

async function clearHistory() {
  if (!confirm("Yalnız bu tarayıcıdaki aday ve sonuç geçmişi silinsin mi?")) return;
  const response = await send({ action: "CLEAR_LOCAL_HISTORY" });
  if (response?.ok) await loadEvidence();
}

function showState(state) {
  elements.loadingState.classList.toggle("hidden", state !== "loading");
  elements.errorState.classList.toggle("hidden", state !== "error");
  elements.analysisContent.classList.toggle("hidden", state !== "content");
}

function showError(message) {
  setText("errorMessage", message);
  showState("error");
}

function verdictNote(result) {
  if (result.planB?.allowNew === false) return result.planB.reason;
  if (result.verdict === "YATIR") return `${result.horizonLabel ?? "15 DK"} LONG kapıları geçti. Yalnız giriş bölgesi gerçekleşirse plan başlar.`;
  if (result.verdict?.startsWith("YATIRILABİLİR")) return "Plan geçerli; güçlü karar için bazı yumuşak teyitler eksik.";
  if (result.verdict === "SHORT — DÜŞÜŞ İŞLEMİ") return "Düşüş kurulumu teyitli. Gerçek işlem için uygun SHORT ürünü ve aracı kurum gerekir.";
  if (result.verdict?.startsWith("SHORT ADAYI")) return "Düşüş planı oluştu; güçlü teyitlerin bir bölümü henüz eksik.";
  if (result.verdict === "DÜŞÜŞ — UZAK DUR") return result.execution?.reason || "Düşüş bekleniyor fakat uygulanabilir SHORT doğrulanmadı.";
  if (result.verdict === "BEKLE") return "Yön oluşmuş olabilir fakat teyit veya mevcut fiyattan giriş koşulu uygun değil.";
  if (result.verdict === "YATIRMA") return "LONG veya SHORT için güvenli kurulum oluşmadı.";
  return result.blockers?.[0] || "Sağlıklı karar için yeterli veri yok.";
}

function renderDirection(directionId, direction, detailId, detail) {
  const node = elements[directionId];
  node.textContent = direction || "—";
  node.classList.toggle("down", direction === "DÜŞÜŞ");
  node.classList.toggle("flat", direction === "YATAY/BELİRSİZ" || direction === "BELİRSİZ");
  setText(detailId, detail);
}

function renderDetection(context, resultSymbol) {
  const node = elements.detectionText;
  node.classList.remove("warning", "verified");
  if (!context?.symbol) {
    node.textContent = `${resultSymbol} · tarama sonucundan açıldı; grafik doğrulaması bekleniyor`;
    node.classList.add("warning");
    return;
  }
  const mismatch = context.symbol !== resultSymbol;
  const age = relativeAge(context.detectedAt);
  const confidence = Number(context.confidence) > 0 ? ` · güven ${number(context.confidence, 0)}/100` : "";
  node.textContent = mismatch
    ? `Grafik ${context.symbol}, gösterilen analiz ${resultSymbol} · yeniden eşitleniyor`
    : `Algılanan ${context.symbol} · ${context.source || "TradingView grafiği"}${confidence} · ${age}`;
  node.classList.add(mismatch || context.ambiguous ? "warning" : "verified");
}

function updateCandleCountdown() {
  if (!lastResult || !elements.candleStatus) return;
  if (selectedHorizon === "SWING") {
    elements.candleStatus.textContent = "Swing kararı kapanmış günlük mumla kilitli · yeni günlük kapanıştan sonra yenilenir";
    return;
  }
  const interval = 15 * 60;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const remaining = interval - (nowSeconds % interval);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  elements.candleStatus.textContent = `Kapanmış mum kararı kilitli · sonraki 15 dk yenilemeye ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function relativeAge(value) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (!Number.isFinite(ageSeconds)) return "şimdi";
  if (ageSeconds < 5) return "şimdi";
  if (ageSeconds < 60) return `${ageSeconds} sn önce`;
  return `${Math.round(ageSeconds / 60)} dk önce`;
}

function renderList(container, values) {
  container.replaceChildren();
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    container.append(item);
  }
}

function setText(id, value) {
  if (elements[id]) elements[id].textContent = value == null || value === "" ? "—" : String(value);
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function verdictClassName(code, side, verdict) {
  if (side === "SHORT" && code >= 3) return "short";
  if (verdict === "DÜŞÜŞ — UZAK DUR" || code === 1) return "decline";
  if (code === 4) return "invest";
  if (code === 3) return "optional";
  if (code === 2) return "wait";
  if (code === 0) return "avoid";
  return "no-data";
}

function formatRange(range) {
  return range ? `${price(range.low)} – ${price(range.high)}` : "—";
}

function price(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (Math.abs(numeric) >= 1000) return numeric.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  if (Math.abs(numeric) >= 1) return numeric.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
  return numeric.toLocaleString("tr-TR", { maximumFractionDigits: 8 });
}

function number(value, digits) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits }) : "—";
}

function metric(value) {
  return value == null ? "—" : number(value, 1);
}

function signed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric > 0 ? "+" : ""}${Math.round(numeric)}`;
}

function signedR(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric > 0 ? "+" : ""}${number(numeric, 2)}R`;
}

function outcomeLabel(value) {
  return ({
    TARGET2: "KÂR 2",
    TARGET1: "KÂR 1",
    STOP: "STOP",
    BREAKEVEN: "MALİYET",
    TIME_EXIT: "SÜRELİ ÇIKIŞ",
    NO_ENTRY: "GİRİŞ OLMADI",
    MISSED: "GİRİŞ KAÇTI",
    INVALIDATED: "PLAN BOZULDU",
    EXPIRED: "SÜRESİ DOLDU"
  })[value] ?? value;
}

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function categoryLabel(category) {
  return ({
    ALL: "Tüm piyasalar",
    BIST: "BIST",
    US: "ABD",
    CRYPTO: "Kripto",
    FOREX: "Forex",
    MACRO: "Endeks ve emtia"
  })[category] ?? "Piyasa";
}
