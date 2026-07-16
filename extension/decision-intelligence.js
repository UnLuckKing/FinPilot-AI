(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotDecisionIntelligence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const RESOLVED_STATUSES = new Set(["HEDEF 2", "STOP", "SÜRESİ DOLDU", "KURULUM BOZULDU"]);

  function keyOf(item) {
    return `${item?.market || "bist"}:${item?.symbol}`;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function cumulativeReturnPct(signature, lookback) {
    if (!Array.isArray(signature) || signature.length < Math.min(12, lookback)) return null;
    const selected = signature.slice(-Math.min(signature.length, Math.max(1, Math.floor(lookback)))).map(Number);
    if (!selected.every(Number.isFinite)) return null;
    return (Math.exp(selected.reduce((sum, value) => sum + value, 0)) - 1) * 100;
  }

  function percentileRank(value, values) {
    const clean = values.filter(Number.isFinite);
    if (!Number.isFinite(value) || !clean.length) return null;
    return clean.filter((candidate) => candidate <= value).length / clean.length * 100;
  }

  function updateFailedGate(item, key, label, passed, message) {
    const gates = { ...(item.gates || {}), [key]: Boolean(passed) };
    const gateDiagnostics = { ...(item.gateDiagnostics || {}), [key]: { passed: Boolean(passed), label, message } };
    const failedGates = (item.failedGates || []).filter((gate) => gate.key !== key);
    if (!passed) failedGates.push({ key, label, message });
    const eligible = Boolean(item.eligible) && Boolean(passed);
    return {
      ...item,
      action: eligible ? "YATIR" : "YATIRMA",
      eligible,
      gates,
      gateDiagnostics,
      failedGates,
      distanceToEligible: failedGates.length,
      nearMiss: !eligible && finite(item.rankScore) >= 55 && failedGates.length <= 3,
    };
  }

  function syncResult(result, recommendations, reason = "v3.1 güvenlik kapıları") {
    const byKey = new Map(recommendations.map((item) => [keyOf(item), item]));
    const updateMarket = (marketResult, market) => {
      if (!marketResult) return marketResult;
      const marketRecommendations = (marketResult.recommendations || []).map((item) => byKey.get(keyOf(item)) || item);
      const candidateCount = marketRecommendations.filter((item) => item.eligible).length;
      return {
        ...marketResult,
        recommendations: marketRecommendations,
        candidateCount,
        marketDecision: candidateCount
          ? `YATIR · ${candidateCount} ${market === "crypto" ? "kripto" : "hisse"} ${reason} dahil bütün kontrolleri geçti`
          : `YATIRMA · ${reason} dahil bütün kontrolleri geçen ${market === "crypto" ? "kripto" : "hisse"} yok`,
        snapshot: (marketResult.snapshot || []).map((snapshot) => ({ ...snapshot, eligible: byKey.get(keyOf(snapshot))?.eligible ?? snapshot.eligible })),
      };
    };
    const candidateCount = recommendations.filter((item) => item.eligible).length;
    return {
      ...result,
      recommendations,
      candidateCount,
      marketDecision: candidateCount ? `YATIR · ${candidateCount} varlık ${reason} dahil tüm kapıları geçti` : `YATIRMA · ${reason} dahil tüm koşulları geçen varlık yok`,
      snapshot: (result?.snapshot || []).map((snapshot) => ({ ...snapshot, eligible: byKey.get(keyOf(snapshot))?.eligible ?? snapshot.eligible })),
      markets: result?.markets ? {
        bist: updateMarket(result.markets.bist, "bist"),
        crypto: updateMarket(result.markets.crypto, "crypto"),
      } : result?.markets,
    };
  }

  function relativeStrengthFor(item, snapshots) {
    const market = item.market || "bist";
    const peers = (snapshots || []).filter((snapshot) => (snapshot.market || "bist") === market && Array.isArray(snapshot.returnSignature));
    const return20 = cumulativeReturnPct(item.returnSignature, 20);
    const return60 = cumulativeReturnPct(item.returnSignature, 60);
    const peer20 = peers.map((snapshot) => cumulativeReturnPct(snapshot.returnSignature, 20)).filter(Number.isFinite);
    const peer60 = peers.map((snapshot) => cumulativeReturnPct(snapshot.returnSignature, 60)).filter(Number.isFinite);
    const median20 = median(peer20);
    const median60 = median(peer60);
    const percentile20 = percentileRank(return20, peer20);
    const percentile60 = percentileRank(return60, peer60);
    const btc = market === "crypto" ? peers.find((snapshot) => snapshot.symbol === "BTCUSDT") : null;
    const btc20 = btc ? cumulativeReturnPct(btc.returnSignature, 20) : null;
    const btc60 = btc ? cumulativeReturnPct(btc.returnSignature, 60) : null;
    const relative20 = Number.isFinite(return20) && Number.isFinite(median20) ? return20 - median20 : null;
    const relative60 = Number.isFinite(return60) && Number.isFinite(median60) ? return60 - median60 : null;
    const btcRelative20 = Number.isFinite(return20) && Number.isFinite(btc20) ? return20 - btc20 : null;
    const btcRelative60 = Number.isFinite(return60) && Number.isFinite(btc60) ? return60 - btc60 : null;
    const available = peers.length >= 5 && Number.isFinite(relative20) && Number.isFinite(percentile20);
    const score = available ? clamp(50 + relative20 * 2 + finite(relative60) + (percentile20 - 50) * 0.35 + (finite(percentile60, 50) - 50) * 0.15 + (market === "crypto" ? clamp(finite(btcRelative20) * 0.7, -15, 15) : 0), 0, 100) : 0;
    const passed = available && relative20 >= -1 && percentile20 >= 40 && (!Number.isFinite(relative60) || relative60 >= -3) && (market !== "crypto" || !Number.isFinite(btcRelative20) || btcRelative20 >= -12);
    return { available, passed, score, peerCount: peers.length, return20, return60, median20, median60, percentile20, percentile60, relative20, relative60, btc20, btc60, btcRelative20, btcRelative60 };
  }

  function applyRelativeStrength(result) {
    const recommendations = (result?.recommendations || []).map((item) => {
      const relativeStrength = relativeStrengthFor(item, result?.snapshot || []);
      const message = relativeStrength.available
        ? `20 bar göreli fark ${relativeStrength.relative20 >= 0 ? "+" : ""}%${relativeStrength.relative20.toFixed(1)} · yüzdelik %${relativeStrength.percentile20.toFixed(0)}/%40 · 60 bar ${Number.isFinite(relativeStrength.relative60) ? `${relativeStrength.relative60 >= 0 ? "+" : ""}%${relativeStrength.relative60.toFixed(1)}` : "ölçülmedi"}${item.market === "crypto" && Number.isFinite(relativeStrength.btcRelative20) ? ` · BTC'ye karşı ${relativeStrength.btcRelative20 >= 0 ? "+" : ""}%${relativeStrength.btcRelative20.toFixed(1)}` : ""}.`
        : `Göreli güç için ${relativeStrength.peerCount}/5 karşılaştırılabilir varlık; kapı kapalı.`;
      const base = { ...item, preRelativeEligible: item.preRelativeEligible ?? item.eligible, relativeStrength };
      return updateFailedGate(base, "relativeStrength", "Göreli güç", relativeStrength.passed, message);
    });
    return {
      ...syncResult(result, recommendations, "göreli güç kapısı"),
      research: { ...(result?.research || {}), relativeStrength: true },
    };
  }

  function resolvedRecords(history) {
    return (history?.records || []).filter((record) => Number.isFinite(Number(record.resultR)) && (RESOLVED_STATUSES.has(record.status) || !["EMİR BEKLİYOR", "AKTİF", "TAŞINAN STOP", "AÇIK"].includes(record.status)));
  }

  function modelHealth(history) {
    const groups = new Map();
    for (const record of resolvedRecords(history)) {
      const key = `${record.market || "bist"}:${record.strategyId || "legacy"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    const summaries = {};
    for (const [key, records] of groups) {
      const ordered = [...records].sort((left, right) => Date.parse(left.closedAt || left.updatedAt || left.createdAt || 0) - Date.parse(right.closedAt || right.updatedAt || right.createdAt || 0));
      const recent = ordered.slice(-12);
      const wins = recent.filter((record) => finite(record.resultR) > 0).length;
      const winRate = recent.length ? wins / recent.length * 100 : null;
      const averageR = recent.length ? recent.reduce((sum, record) => sum + finite(record.resultR), 0) / recent.length : null;
      const calibrated = recent.filter((record) => Number.isFinite(Number(record.predictedProbabilityUp)));
      const brier = calibrated.length ? calibrated.reduce((sum, record) => {
        const probability = clamp(finite(record.predictedProbabilityUp) / 100, 0, 1);
        const outcome = finite(record.resultR) > 0 ? 1 : 0;
        return sum + (probability - outcome) ** 2;
      }, 0) / calibrated.length : null;
      const ready = recent.length >= 12;
      const locked = ready && (winRate < 40 || averageR < 0 || (Number.isFinite(brier) && brier > 0.30));
      summaries[key] = { key, resolved: ordered.length, recent: recent.length, wins, winRate, averageR, brier, ready, passed: !locked, status: !ready ? "ISINIYOR" : locked ? "KİLİTLİ" : ordered.length >= 24 ? "STABİL" : "İZLEME" };
    }
    return { summaries, resolved: resolvedRecords(history).length, minimumRecent: 12 };
  }

  function applyModelHealth(result, history) {
    const health = modelHealth(history);
    const recommendations = (result?.recommendations || []).map((item) => {
      const groupKey = `${item.market || "bist"}:${item.strategy?.id || "legacy"}`;
      const summary = health.summaries[groupKey] || { resolved: 0, recent: 0, ready: false, passed: true, status: "ISINIYOR", winRate: null, averageR: null, brier: null };
      const message = summary.ready
        ? `Son ${summary.recent} sonuç: pozitif %${summary.winRate.toFixed(1)} · ortalama ${summary.averageR.toFixed(2)}R${Number.isFinite(summary.brier) ? ` · Brier ${summary.brier.toFixed(3)}` : ""} · ${summary.status}.`
        : `Model sağlığı ısınıyor: ${summary.recent}/${health.minimumRecent} sonuç.`;
      const updated = updateFailedGate({ ...item, modelHealth: summary }, "modelHealth", "Model sağlığı", summary.passed, message);
      return summary.passed ? updated : { ...updated, reasons: [...(updated.reasons || []), "Kâğıt sonuçlarda performans/kalibrasyon sürüklenmesi görüldüğü için model otomatik kilitlendi."] };
    });
    return {
      ...syncResult(result, recommendations, "model sağlık kapısı"),
      modelHealth: health,
      research: { ...(result?.research || {}), modelHealth: true },
    };
  }

  function floorToStep(value, step) {
    const safeStep = Math.max(Number.EPSILON, finite(step, 1));
    return Math.floor(Math.max(0, finite(value)) / safeStep + 1e-9) * safeStep;
  }

  function positionSizing(item, capitalInput = 100000) {
    const capital = clamp(finite(capitalInput, 100000), 1000, 100_000_000);
    const order = item.orderPlan || item.levels || {};
    const entry = finite(order.limitBuy, NaN);
    const stop = finite(order.stopTrigger ?? order.stop, NaN);
    const riskDistance = entry - stop;
    const riskPct = clamp(finite(item.portfolioRisk?.suggestedRiskPct, 0.5), 0.10, 0.50);
    const riskBudget = capital * riskPct / 100;
    const maxPositionPct = item.market === "crypto" ? 15 : 20;
    const maxPositionValue = capital * maxPositionPct / 100;
    const rawQuantity = entry > 0 && riskDistance > 0 ? Math.min(riskBudget / riskDistance, maxPositionValue / entry) : 0;
    const quantity = item.market === "crypto" ? floorToStep(rawQuantity, item.stepSize || 0.000001) : Math.floor(rawQuantity);
    const positionValue = quantity * entry;
    const maxLoss = quantity * riskDistance;
    const target1Profit = quantity * Math.max(0, finite(order.target1) - entry);
    const target2Profit = quantity * Math.max(0, finite(order.target2) - entry);
    const valid = [capital, entry, stop, riskDistance, quantity, positionValue, maxLoss].every(Number.isFinite) && entry > stop && quantity > 0 && maxLoss <= riskBudget * 1.01;
    return { valid, capital, riskPct, riskBudget, maxPositionPct, entry, stop, riskDistance, quantity, positionValue, maxLoss, target1Profit, target2Profit, riskReward1: maxLoss > 0 ? target1Profit / maxLoss : null, riskReward2: maxLoss > 0 ? target2Profit / maxLoss : null };
  }

  function openExposureRisk(history) {
    const open = (history?.records || []).filter((record) => ["EMİR BEKLİYOR", "AKTİF", "TAŞINAN STOP", "AÇIK"].includes(record.status));
    return open.reduce((summary, record) => {
      const sizing = record.positionSizing || {};
      const entry = finite(record.fillPrice ?? record.entry, NaN);
      const stop = finite(record.currentStop ?? record.originalStop, NaN);
      const quantity = finite(sizing.quantity ?? record.quantity, 0);
      const value = finite(sizing.positionValue, Number.isFinite(entry) ? entry * quantity : 0);
      const loss = finite(sizing.maxLoss, Number.isFinite(entry) && Number.isFinite(stop) ? Math.max(0, entry - stop) * quantity : 0);
      const shock = record.market === "crypto" ? 0.20 : 0.10;
      summary.riskAmount += Math.max(0, loss);
      summary.shockLossAmount += Math.max(0, value) * shock;
      summary.positionValue += Math.max(0, value);
      return summary;
    }, { count: open.length, riskAmount: 0, shockLossAmount: 0, positionValue: 0 });
  }

  function applyPositionSizingAndStress(result, history, settings = {}) {
    const capital = clamp(finite(settings.paperCapital, 100000), 1000, 100_000_000);
    const exposure = openExposureRisk(history);
    let acceptedRisk = exposure.riskAmount;
    let acceptedShockLoss = exposure.shockLossAmount;
    let acceptedValue = exposure.positionValue;
    const recommendations = (result?.recommendations || []).map((item) => {
      const baseEligible = item.preStressEligible ?? item.eligible;
      const sizing = positionSizing(item, capital);
      const candidateRisk = baseEligible && sizing.valid ? sizing.maxLoss : 0;
      const candidateShock = baseEligible && sizing.valid ? sizing.positionValue * (item.market === "crypto" ? 0.20 : 0.10) : 0;
      const totalRiskPct = (acceptedRisk + candidateRisk) / capital * 100;
      const shockLossPct = (acceptedShockLoss + candidateShock) / capital * 100;
      const passed = sizing.valid && totalRiskPct <= 2.0 && shockLossPct <= 12.0;
      const stress = {
        passed,
        capital,
        openCount: exposure.count,
        totalRiskAmount: acceptedRisk + candidateRisk,
        totalRiskPct,
        shockLossAmount: acceptedShockLoss + candidateShock,
        shockLossPct,
        correlationOneLossPct: totalRiskPct,
        scenario: item.market === "crypto" ? "Kripto −%20" : "BIST −%10",
        limits: { totalRiskPct: 2.0, shockLossPct: 12.0 },
      };
      const message = !sizing.valid
        ? "Sermaye, limit ve stop seviyelerinden geçerli adet hesaplanamadı."
        : `Toplam stop riski %${totalRiskPct.toFixed(2)}/%2,00 · ${stress.scenario} senaryosu %${shockLossPct.toFixed(2)}/%12,00.`;
      let updated = { ...item, eligible: Boolean(baseEligible), action: baseEligible ? "YATIR" : "YATIRMA", preStressEligible: baseEligible, positionSizing: sizing, portfolioStress: stress };
      updated = updateFailedGate(updated, "portfolioStress", "Portföy stresi", passed, message);
      if (baseEligible && passed) {
        acceptedRisk += candidateRisk;
        acceptedShockLoss += candidateShock;
        acceptedValue += sizing.positionValue;
      }
      return updated;
    });
    const synced = syncResult(result, recommendations, "portföy stres kapısı");
    return {
      ...synced,
      settings: { ...(result?.settings || {}), paperCapital: capital },
      portfolioStress: {
        capital,
        openCount: exposure.count,
        acceptedCandidateCount: recommendations.filter((item) => item.preStressEligible && item.gates?.portfolioStress).length,
        totalRiskAmount: acceptedRisk,
        totalRiskPct: acceptedRisk / capital * 100,
        shockLossAmount: acceptedShockLoss,
        shockLossPct: acceptedShockLoss / capital * 100,
        positionValue: acceptedValue,
        limits: { totalRiskPct: 2.0, shockLossPct: 12.0 },
      },
      research: { ...(result?.research || {}), positionSizing: true, portfolioStress: true },
    };
  }

  function nextCondition(item) {
    const failed = item.failedGates || [];
    if (!failed.length) return { ready: true, primary: "Tüm zorunlu kapılar geçti; limit emrinin koşulu izleniyor.", items: [] };
    const messages = failed.map((gate) => {
      if (gate.key === "validation") {
        const completed = Math.max(0, Math.floor(finite(item.validation?.oos?.trades)));
        const required = Math.max(12, Math.floor(finite(item.validation?.requiredOosTrades, 12)));
        const remaining = Math.max(0, required - completed);
        const selected = item.validation?.selectedEvidenceGrade;
        const overall = item.validation?.overallEvidenceGrade;
        return remaining > 0
          ? `${remaining} dönem dışı işlem daha gerekiyor (${completed}/${required}).`
          : `Genel kanıt ${overall || item.evidenceGrade}; seçilen strateji ${selected || item.evidenceGrade}. Nihai notun en az B olması gerekiyor.`;
      }
      if (gate.key === "multiTimeframe") return `${item.multiTimeframe?.summary || "Üst zaman dilimleri"}; günlük/haftalık ana yönün çelişmemesi gerekiyor.`;
      if (gate.key === "forecastReliability") return "Karar vadesindeki tahmin aralığı daralıp kullanılabilir güven düzeyine gelmeli.";
      if (gate.key === "relativeStrength") return `20 bar göreli yüzdelik en az %40 olmalı; güncel ${Number.isFinite(item.relativeStrength?.percentile20) ? `%${item.relativeStrength.percentile20.toFixed(0)}` : "ölçülemedi"}.`;
      if (gate.key === "executionQuality") return `Alış/satış farkı en fazla 20 baz puan olmalı; güncel ${Number.isFinite(item.spreadBps) ? item.spreadBps.toFixed(1) : "ölçülemedi"}.`;
      if (gate.key === "portfolioStress") return `Toplam stop riski %2 ve stres kaybı %12 altına inmeli; güncel %${finite(item.portfolioStress?.totalRiskPct).toFixed(2)} / %${finite(item.portfolioStress?.shockLossPct).toFixed(2)}.`;
      return gate.message || item.gateDiagnostics?.[gate.key]?.message || `${gate.label || gate.key} kapısı açılmalı.`;
    });
    return { ready: false, primary: messages[0], items: messages.slice(0, 5), remaining: failed.length };
  }

  function decisionChange(previous, current) {
    if (!previous) return { changed: true, summary: "İlk v3.1 taraması; karar başlangıç durumu kaydedildi.", from: null, to: current.action };
    const changes = [];
    if (previous.action !== current.action) changes.push(`karar ${previous.action || "—"} → ${current.action}`);
    const oldGrade = previous.evidenceGrade || previous.validation?.evidenceGrade || "D";
    const newGrade = current.evidenceGrade || current.validation?.evidenceGrade || "D";
    if (oldGrade !== newGrade) changes.push(`kanıt ${oldGrade} → ${newGrade}`);
    const oldFailed = new Set((previous.failedGates || []).map((gate) => gate.key));
    const newFailed = new Set((current.failedGates || []).map((gate) => gate.key));
    const opened = [...oldFailed].filter((key) => !newFailed.has(key));
    const closed = [...newFailed].filter((key) => !oldFailed.has(key));
    if (opened.length) changes.push(`açılan kapı: ${opened.join(", ")}`);
    if (closed.length) changes.push(`kapanan kapı: ${closed.join(", ")}`);
    const scoreDelta = finite(current.rankScore) - finite(previous.rankScore);
    if (Math.abs(scoreDelta) >= 2) changes.push(`güç ${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(0)}`);
    return { changed: changes.length > 0, summary: changes.length ? changes.join(" · ") : "Önceki taramaya göre zorunlu karar değişimi yok.", from: previous.action, to: current.action, openedGates: opened, closedGates: closed, scoreDelta };
  }

  function updateDecisionJournal(previousResult, result, previousJournal, nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const previousMap = new Map((previousResult?.recommendations || []).map((item) => [keyOf(item), item]));
    const changes = [];
    const recommendations = (result?.recommendations || []).map((item) => {
      const change = decisionChange(previousMap.get(keyOf(item)), item);
      const next = nextCondition(item);
      if (change.changed) changes.push({ id: `${now.getTime()}-${keyOf(item)}`, at: now.toISOString(), key: keyOf(item), market: item.market, symbol: item.symbol, displaySymbol: item.displaySymbol || item.symbol, action: item.action, evidenceGrade: item.evidenceGrade || item.validation?.evidenceGrade || "D", summary: change.summary, next: next.primary });
      return { ...item, decisionChange: change, nextCondition: next };
    });
    const journal = {
      version: 1,
      updatedAt: now.toISOString(),
      entries: [...changes, ...(previousJournal?.entries || [])].slice(0, 250),
      latestChanges: changes,
      count: Math.min(250, changes.length + (previousJournal?.entries || []).length),
    };
    return {
      result: {
        ...result,
        recommendations,
        decisionJournal: journal,
        research: { ...(result?.research || {}), decisionJournal: true },
      },
      journal,
    };
  }

  return {
    keyOf,
    cumulativeReturnPct,
    percentileRank,
    relativeStrengthFor,
    applyRelativeStrength,
    modelHealth,
    applyModelHealth,
    positionSizing,
    openExposureRisk,
    applyPositionSizingAndStress,
    nextCondition,
    decisionChange,
    updateDecisionJournal,
    syncResult,
  };
});
