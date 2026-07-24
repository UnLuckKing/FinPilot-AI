const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
let activeTab = "scanner";
let busy = false;
let scannerLoaded = false;
let lastSymbol = "";
let lastAnalyzedAt = "";
let lastResult = null;
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.latestBySymbol && activeTab === "analysis") void renderLatestForActiveContext();
  if ((changes.candidateSignals || changes.signalOutcomes) && activeTab === "evidence") void loadEvidence();
  if ((changes.marketScanProgress || changes.marketScanResults) && activeTab === "scanner") void renderStoredScan();
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
  lastResult = result;
  showState("content");
  setText("marketBadge", result.market || "OTHER");
  setText("symbolName", result.symbol || "—");
  setText("sourceText", `${result.sourceLabel || "Kaynak yok"} · ${formatTime(result.barTime)}`);
  renderDetection(context, result.symbol);
  setText("healthText", `Veri ${number(result.dataHealth, 0)}/100`);
  elements.healthDot.style.background = result.dataHealth >= 80 ? "var(--green)" : result.dataHealth >= 55 ? "var(--amber)" : "var(--red)";

  const verdictClass = verdictClassName(result.verdictCode, result.tradeSide, result.verdict);
  elements.verdictCard.className = `verdict-card ${verdictClass}`;
  setText("verdictText", result.verdict);
  setText("verdictNote", verdictNote(result));
  setText("technicalScore", `${number(result.technicalScore, 0)}/100`);
  setText("dataHealth", `${number(result.dataHealth, 0)}/100`);
  setText("setupName", result.setup || "—");
  setText("signalState", result.signalState || "—");
  setText("tradeSidePill", result.tradeSide || "—");
  elements.tradeSidePill.className = `pill ${String(result.tradeSide ?? "NONE").toLowerCase()}`;
  setText("triggerText", result.trigger?.confirmationText || "Yeni kapanış bekleniyor");
  setText("decisionChangeText", result.trigger?.invalidationText || result.plan?.invalidation || "—");
  setText("executionGuard", result.tradeSide === "SHORT"
    ? `${result.execution?.status || "SHORT KONTROLÜ"} · ${result.execution?.label || "Uygun ürün doğrulanmalı"}`
    : "LONG planı · Alım işlemini kendi aracı kurumunda sen uygularsın.");
  elements.executionGuard.classList.toggle("blocked", result.tradeSide === "SHORT" && !result.execution?.actionable);

  renderDirection("intradayDirection", result.directions?.intraday, "intradayScore", `${signed(result.directionScores?.intraday)}/100`);
  renderDirection("oneDayDirection", result.directions?.oneDay, "oneDayRange", `Beklenen ${formatRange(result.expectedRanges?.oneDay)}`);
  renderDirection("oneWeekDirection", result.directions?.oneWeek, "oneWeekRange", `Beklenen ${formatRange(result.expectedRanges?.oneWeek)}`);

  if (result.plan) {
    elements.planSection.classList.remove("hidden");
    setText("planTitle", result.plan.side === "SHORT" ? "Düşüş / SHORT seviyeleri" : "Yükseliş / LONG seviyeleri");
    setText("riskRewardPill", `${number(result.plan.effectiveRewardRisk, 2)} R`);
    setText("entryLow", price(result.plan.entryLow));
    setText("entryHigh", price(result.plan.entryHigh));
    setText("maximumChase", price(result.plan.maximumChase));
    setText("chaseLabel", result.plan.side === "SHORT" ? "Altında kovalama" : "Üstünde kovalama");
    setText("stopPrice", price(result.plan.stop));
    setText("targetOne", price(result.plan.target1));
    setText("targetTwo", price(result.plan.target2));
    setText("invalidationText", result.plan.invalidation);
    setText("quantityText", `100.000 birim portföyde %0,5 örnek risk adedi: ${number(result.plan.quantityPer100k, 0)}`);
  } else {
    elements.planSection.classList.add("hidden");
  }

  renderList(elements.reasonList, result.reasons?.length ? result.reasons : ["Olumlu teyit yok"]);
  renderList(elements.blockerList, unique([...(result.blockers ?? []), ...(result.failed ?? [])]).slice(0, 8));
  setText("metricRsi", metric(result.metrics?.rsi));
  setText("metricAdx", metric(result.metrics?.adx));
  setText("metricVolume", result.metrics?.relativeVolume ? `${number(result.metrics.relativeVolume, 2)}x` : "—");
  setText("metricAtr", result.metrics?.atrPercent ? `%${number(result.metrics.atrPercent, 2)}` : "—");
  setText("analysisTime", `Analiz: ${formatTime(result.analyzedAt)} · ${result.disclaimer}`);
  updateCandleCountdown();
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
    direction.textContent = `${result.tradeSide ?? "—"} · 1 gün ${result.directions?.oneDay ?? "—"} · 1 hafta ${result.directions?.oneWeek ?? "—"}`;
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
    verdict.textContent = result.verdict;
    row.append(body, verdict);
    elements.scannerResults.append(row);
  }
  if (results.length === 0) elements.scannerResults.textContent = "Sonuç yok.";
}

async function openScannerResult(result) {
  lastSymbol = result.symbol;
  lastAnalyzedAt = result.analyzedAt;
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
  } catch {
    // Active scan request remains the fallback.
  }
}

function renderScanState(progress, results) {
  if (!progress) return;
  const total = Number(progress.total) || results.length;
  const completed = Number(progress.completed) || results.length;
  const categoryResults = results.filter((item) => matchesCategory(item, activeCategory));
  const filteredResults = categoryResults.filter((item) => matchesDirection(item, activeDirection));
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
  const longCount = categoryResults.filter((item) => item.tradeSide === "LONG" && item.verdictCode >= 3).length;
  const shortCount = categoryResults.filter((item) => item.tradeSide === "SHORT" && item.verdictCode >= 3).length;
  const declineCount = categoryResults.filter((item) => item.verdictCode === 1).length;
  const confirmedCount = categoryResults.filter((item) => item.verdictCode === 4).length;

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
  return result?.tradeSide === direction;
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
    .filter((item) => item.tradeSide === side && item.verdictCode >= 1 && item.dataHealth >= 55)
    .sort((left, right) =>
      (Number(right.opportunityScore) || 0) - (Number(left.opportunityScore) || 0) ||
      (Number(right.technicalScore) || 0) - (Number(left.technicalScore) || 0)
    )[0] ?? null;
}

function renderBestCard(prefix, result, emptyText) {
  setText(`${prefix}Symbol`, result?.symbol || emptyText);
  setText(`${prefix}Detail`, result
    ? `${result.verdict} · Güç ${number(result.technicalScore, 0)}/100 · ${result.setup}`
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
    detail.textContent = `${item.side ?? item.plan?.side ?? "LONG"} · ${item.verdict} · ${formatTime(item.createdAt)}`;
    const status = document.createElement("small");
    status.textContent = closed ? item.result : "TAKİPTE";
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
  if (result.verdict === "YATIR") return "Tüm LONG kapıları geçti. Seviyeleri kendi aracı kurumunda sen uygulayacaksın.";
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
