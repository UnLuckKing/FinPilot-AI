const VERDICTS = ["YATIR", "YATIRILABİLİR — SEN BİLİRSİN", "BEKLE", "YATIRMA", "VERİ YETERSİZ"];
const state = { data: null, verdict: "TÜMÜ", market: "TÜMÜ", search: "" };

const elements = Object.fromEntries([
  "connection", "updatedAt", "webhookState", "totalAnalyses", "investCount", "marketCount", "accuracy", "evidenceLabel",
  "verdictFilters", "marketFilters", "search", "clearFilters", "resultCount", "cards", "closedOutcomes", "winningOutcomes",
  "confidenceInterval", "evidenceGrade", "refresh"
].map((id) => [id, document.getElementById(id)]));

elements.refresh.addEventListener("click", () => load());
elements.search.addEventListener("input", (event) => { state.search = event.target.value.trim().toUpperCase(); renderCards(); });
elements.clearFilters.addEventListener("click", () => { state.verdict = "TÜMÜ"; state.market = "TÜMÜ"; state.search = ""; elements.search.value = ""; renderFilters(); renderCards(); });

await load();
connectEvents();

async function load() {
  elements.refresh.disabled = true;
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error("Panel verisi alınamadı");
    state.data = await response.json();
    setConnection(true);
    render();
  } catch (error) {
    setConnection(false, error.message);
    empty("Sunucuya bağlanılamadı", "FinPilot sunucusunun çalıştığını kontrol et.");
  } finally { elements.refresh.disabled = false; }
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("connected", () => setConnection(true));
  source.addEventListener("analysis", () => load());
  source.addEventListener("outcome", () => load());
  source.onerror = () => setConnection(false, "Bağlantı yeniden deneniyor");
}

function render() {
  const { totals, evidence, health, generatedAt } = state.data;
  elements.updatedAt.textContent = dateTime(generatedAt);
  elements.webhookState.textContent = health.webhookReady ? "TradingView webhook hazır" : "Webhook anahtarı ayarlanmamış";
  elements.webhookState.className = health.webhookReady ? "ok" : "warn";
  elements.totalAnalyses.textContent = totals.analyses;
  elements.investCount.textContent = totals.verdictCounts?.YATIR ?? 0;
  elements.marketCount.textContent = Object.keys(totals.marketCounts ?? {}).length;
  elements.accuracy.textContent = evidence.observedAccuracy == null ? "—" : `%${number(evidence.observedAccuracy, 1)}`;
  elements.evidenceLabel.textContent = evidence.sampleSize ? `${evidence.sampleSize} sonuç · ${evidence.grade}` : "Henüz yeterli örnek yok";
  elements.closedOutcomes.textContent = evidence.sampleSize;
  elements.winningOutcomes.textContent = evidence.wins;
  elements.confidenceInterval.textContent = evidence.interval ? `%${number(evidence.interval[0], 1)}–%${number(evidence.interval[1], 1)}` : "—";
  elements.evidenceGrade.textContent = evidence.grade;
  renderFilters();
  renderCards();
}

function renderFilters() {
  const analyses = state.data?.analyses ?? [];
  const markets = [...new Set(analyses.map((item) => item.market))].sort();
  elements.verdictFilters.innerHTML = ["TÜMÜ", ...VERDICTS].map((value) => filterButton(value, "verdict", count(analyses, "verdict", value))).join("");
  elements.marketFilters.innerHTML = ["TÜMÜ", ...markets].map((value) => filterButton(value, "market", count(analyses, "market", value))).join("");
  elements.verdictFilters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.verdict = button.dataset.value; renderFilters(); renderCards(); }));
  elements.marketFilters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.market = button.dataset.value; renderFilters(); renderCards(); }));
}

function renderCards() {
  if (!state.data) return;
  const analyses = state.data.analyses.filter((item) =>
    (state.verdict === "TÜMÜ" || item.verdict === state.verdict) &&
    (state.market === "TÜMÜ" || item.market === state.market) &&
    (!state.search || `${item.exchange}:${item.symbol}`.toUpperCase().includes(state.search))
  );
  elements.resultCount.textContent = `${analyses.length} sonuç`;
  if (!analyses.length) return empty(
    state.data.analyses.length ? "Bu filtrede sonuç yok" : "Henüz analiz gelmedi",
    state.data.analyses.length ? "Filtreleri temizleyip tekrar dene." : "TradingView Pine Screener alarmı ilk onaylı sinyali gönderdiğinde burada görünecek."
  );
  elements.cards.innerHTML = analyses.map(card).join("");
}

function card(item) {
  const tone = toneClass(item.verdict);
  const plan = item.plan;
  const outcome = item.outcome ? `<span class="outcome">SONUÇ: ${escapeHtml(item.outcome.result)}</span>` : "";
  return `<article class="analysis-card panel ${tone}">
    <header>
      <div class="rank"><span>${marketIcon(item.market)}</span></div>
      <div class="identity"><span>${escapeHtml(item.exchange || item.market)}</span><h3>${escapeHtml(item.symbol)}</h3><small>${escapeHtml(item.market)} · ${escapeHtml(item.timeframe)} dk · ${dateTime(item.analyzedAt)}</small></div>
      <div class="verdict"><span class="pill ${tone}">${escapeHtml(item.verdict)}</span>${outcome}</div>
    </header>
    <div class="strength"><span>Teknik güç</span><meter min="0" max="100" value="${clamp(item.score, 0, 100)}"></meter><b>${item.score}/100</b></div>
    <div class="directions">
      ${directionCell("15 DK", item.directions.intraday)}
      ${directionCell("1 GÜN", item.directions.oneDay)}
      ${directionCell("1 HAFTA", item.directions.oneWeek)}
      <div><span>KURULUM</span><strong>${escapeHtml(item.setup)}</strong></div>
    </div>
    ${plan ? `<div class="plan">
      ${planCell("GİRİŞ", `${money(plan.entryLow)} – ${money(plan.entryHigh)}`)}
      ${planCell("KOVALAMA SINIRI", money(plan.maximumChase), "wait-text")}
      ${planCell("STOP", money(plan.stop), "bad-text")}
      ${planCell("HEDEF 1", money(plan.target1), "good-text")}
      ${planCell("HEDEF 2", money(plan.target2), "good-text")}
      ${planCell("GÜNCEL R/R", `${number(plan.effectiveRewardRisk)}R`)}
    </div>` : `<div class="no-plan">Veri doğrulanmadan fiyat planı üretilmedi.</div>`}
    <div class="health-row"><span>Veri sağlığı</span><meter min="0" max="100" value="${item.dataHealth}"></meter><b>%${item.dataHealth}</b></div>
    <div class="reason-row"><div><span>GÜÇLÜ TARAF</span><p>${escapeHtml(item.reasons.slice(0, 3).join(" · ") || "Yeterli güçlü koşul yok")}</p></div><div><span>EKSİK / RİSK</span><p>${escapeHtml([...item.blockers, ...item.failed].slice(0, 4).join(" · ") || "Belirgin eksik yok")}</p></div></div>
    <details><summary>Tüm analiz gerekçelerini göster</summary>
      <div class="factor-table">${item.factors.map((factor) => `<div><i class="${factor.passed ? "pass" : "fail"}">${factor.passed ? "✓" : "×"}</i><span>${escapeHtml(factor.label)}</span><small>${escapeHtml(factor.actual)} → ${escapeHtml(factor.required)}</small></div>`).join("")}</div>
      ${plan ? `<p class="validity"><b>Geçerlilik:</b> ${escapeHtml(plan.validity)} · <b>İptal:</b> ${escapeHtml(plan.invalidation)}</p>` : ""}
    </details>
  </article>`;
}

function directionCell(label, value) { const tone = value === "YÜKSELİŞ" ? "up" : value === "DÜŞÜŞ" ? "down" : "flat"; return `<div><span>${label}</span><strong class="${tone}">${escapeHtml(value)}</strong></div>`; }
function planCell(label, value, tone = "") { return `<div><span>${label}</span><strong class="${tone}">${escapeHtml(value)}</strong></div>`; }
function filterButton(value, key, amount) { const active = state[key] === value ? "active" : ""; return `<button class="${active}" data-value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span><b>${amount}</b></button>`; }
function count(items, field, value) { return value === "TÜMÜ" ? items.length : items.filter((item) => item[field] === value).length; }
function empty(title, text) { elements.cards.innerHTML = `<div class="empty panel"><span>◇</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`; }
function setConnection(ok, text) { elements.connection.className = `connection ${ok ? "online" : "offline"}`; elements.connection.innerHTML = `<i></i> ${escapeHtml(text ?? (ok ? "CANLI" : "KAPALI"))}`; }
function toneClass(verdict) { return verdict === "YATIR" ? "invest" : verdict.startsWith("YATIRILABİLİR") ? "optional" : verdict === "BEKLE" ? "wait" : verdict === "YATIRMA" ? "avoid" : "nodata"; }
function marketIcon(market) { return ({ STOCK: "H", ETF: "E", CRYPTO: "₿", FOREX: "FX", FUTURES: "V", INDEX: "İ", COMMODITY: "M", BOND: "T", OPTION: "O" })[market] ?? "•"; }
function money(value) { return Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 4 }); }
function number(value, digits = 2) { return Number(value).toLocaleString("tr-TR", { maximumFractionDigits: digits }); }
function dateTime(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date) : "—"; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
