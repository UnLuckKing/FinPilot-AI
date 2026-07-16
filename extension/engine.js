(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const STRATEGY_LIBRARY = Object.freeze({
    trend: { id: "trend", label: "Trend devamı", thresholdOffset: 0 },
    pullback: { id: "pullback", label: "Geri çekilme", thresholdOffset: -2 },
    breakout: { id: "breakout", label: "Kırılım teyidi", thresholdOffset: 2 },
    meanReversion: { id: "meanReversion", label: "Yatay piyasa dönüşü", thresholdOffset: 3 },
  });
  const EVIDENCE_RANK = Object.freeze({ A: 0, B: 1, C: 2, D: 3 });

  function conservativeEvidenceGrade(...grades) {
    const clean = grades.map((grade) => String(grade || "D").toUpperCase()).filter((grade) => Object.hasOwn(EVIDENCE_RANK, grade));
    return clean.length ? clean.sort((left, right) => EVIDENCE_RANK[right] - EVIDENCE_RANK[left])[0] : "D";
  }

  function quantile(values, percentile) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const position = clamp(percentile, 0, 1) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  function standardDeviation(values) {
    const clean = values.filter(Number.isFinite);
    if (clean.length < 2) return 0;
    const average = mean(clean);
    return Math.sqrt(clean.reduce((sum, value) => sum + (value - average) ** 2, 0) / (clean.length - 1));
  }

  function normalCdf(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
  }

  function splitCsvLine(line, delimiter) {
    const out = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === delimiter && !quoted) { out.push(cell.trim()); cell = ""; }
      else cell += ch;
    }
    out.push(cell.trim());
    return out;
  }

  function parseCsv(text) {
    const clean = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!clean) throw new Error("CSV dosyası boş.");
    const lines = clean.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 60) throw new Error("Güvenilir analiz için en az 60 mum gerekli.");
    const candidates = [",", ";", "\t"];
    const delimiter = candidates.sort((a, b) => splitCsvLine(lines[0], b).length - splitCsvLine(lines[0], a).length)[0];
    const headers = splitCsvLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/[^a-z0-9çğıöşü%_ ]/gi, "").trim());
    const aliases = {
      time: ["time", "date", "datetime", "tarih", "timestamp"],
      open: ["open", "açılış", "acilis"],
      high: ["high", "yüksek", "yuksek"],
      low: ["low", "düşük", "dusuk"],
      close: ["close", "kapanış", "kapanis"],
      volume: ["volume", "hacim", "vol"],
    };
    const index = {};
    Object.entries(aliases).forEach(([key, names]) => { index[key] = headers.findIndex((h) => names.includes(h)); });
    for (const required of ["open", "high", "low", "close"]) if (index[required] < 0) throw new Error(`CSV içinde ${required} sütunu bulunamadı.`);
    const rows = lines.slice(1).map((line, lineIndex) => {
      const cells = splitCsvLine(line, delimiter);
      const row = {
        time: index.time >= 0 ? cells[index.time] : String(lineIndex),
        open: finite(String(cells[index.open] || "").replace(",", "."), NaN),
        high: finite(String(cells[index.high] || "").replace(",", "."), NaN),
        low: finite(String(cells[index.low] || "").replace(",", "."), NaN),
        close: finite(String(cells[index.close] || "").replace(",", "."), NaN),
        volume: index.volume >= 0 ? finite(String(cells[index.volume] || "0").replace(",", "."), 0) : 0,
      };
      return row;
    }).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite) && row.high >= row.low && row.close > 0);
    if (rows.length < 60) throw new Error("Geçerli mum sayısı 60'ın altında.");
    return rows;
  }

  function ema(values, length) {
    const alpha = 2 / (length + 1);
    const out = new Array(values.length).fill(null);
    let current = values[0];
    for (let i = 0; i < values.length; i += 1) {
      current = i === 0 ? values[i] : values[i] * alpha + current * (1 - alpha);
      out[i] = current;
    }
    return out;
  }

  function sma(values, length) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
      sum += finite(values[i]);
      if (i >= length) sum -= finite(values[i - length]);
      if (i >= length - 1) out[i] = sum / length;
    }
    return out;
  }

  function rsi(values, length = 14) {
    const out = new Array(values.length).fill(null);
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i < values.length; i += 1) {
      const change = values[i] - values[i - 1];
      const gain = Math.max(0, change);
      const loss = Math.max(0, -change);
      if (i <= length) {
        avgGain += gain / length;
        avgLoss += loss / length;
        if (i === length) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      } else {
        avgGain = (avgGain * (length - 1) + gain) / length;
        avgLoss = (avgLoss * (length - 1) + loss) / length;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    }
    return out;
  }

  function atr(rows, length = 14) {
    const tr = rows.map((row, i) => i === 0 ? row.high - row.low : Math.max(row.high - row.low, Math.abs(row.high - rows[i - 1].close), Math.abs(row.low - rows[i - 1].close)));
    const out = new Array(rows.length).fill(null);
    let value = tr.slice(0, length).reduce((a, b) => a + b, 0) / length;
    for (let i = length - 1; i < rows.length; i += 1) {
      if (i > length - 1) value = (value * (length - 1) + tr[i]) / length;
      out[i] = value;
    }
    return out;
  }

  function macd(values, fast = 12, slow = 26, signal = 9) {
    const fastEma = ema(values, fast);
    const slowEma = ema(values, slow);
    const line = values.map((_, i) => fastEma[i] - slowEma[i]);
    const signalLine = ema(line, signal);
    return { line, signal: signalLine, histogram: line.map((value, i) => value - signalLine[i]) };
  }

  function highest(values, end, length) {
    let value = -Infinity;
    for (let i = Math.max(0, end - length + 1); i <= end; i += 1) value = Math.max(value, values[i]);
    return value;
  }

  function lowest(values, end, length) {
    let value = Infinity;
    for (let i = Math.max(0, end - length + 1); i <= end; i += 1) value = Math.min(value, values[i]);
    return value;
  }

  function aggregateRows(rows, groupSize) {
    const size = Math.max(1, Math.floor(finite(groupSize, 1)));
    if (!Array.isArray(rows) || rows.length < size) return [];
    const output = [];
    const offset = rows.length % size;
    for (let start = offset; start + size <= rows.length; start += size) {
      const group = rows.slice(start, start + size);
      const first = group[0];
      const last = group[group.length - 1];
      output.push({
        time: first.time,
        timestamp: first.timestamp,
        closedAt: last.closedAt,
        open: finite(first.open),
        high: Math.max(...group.map((row) => finite(row.high, -Infinity))),
        low: Math.min(...group.map((row) => finite(row.low, Infinity))),
        close: finite(last.close),
        volume: group.reduce((sum, row) => sum + Math.max(0, finite(row.volume)), 0),
      });
    }
    return output.filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite) && row.high >= row.low && row.close > 0);
  }

  function timeframeTrend(rows, label, fastLength = 5, slowLength = 13) {
    const minimum = Math.max(slowLength + 3, 18);
    if (!Array.isArray(rows) || rows.length < minimum) return { available: false, label, direction: 0, score: 0, reason: `${label} için en az ${minimum} kapanmış mum gerekli.` };
    const closes = rows.map((row) => finite(row.close, NaN));
    if (!closes.every(Number.isFinite)) return { available: false, label, direction: 0, score: 0, reason: `${label} kapanış dizisi geçersiz.` };
    const fast = ema(closes, fastLength);
    const slow = ema(closes, slowLength);
    const index = closes.length - 1;
    const slopeIndex = Math.max(0, index - 3);
    const slope = slow[index] - slow[slopeIndex];
    const direction = fast[index] > slow[index] && closes[index] >= slow[index] && slope >= 0
      ? 1
      : fast[index] < slow[index] && closes[index] <= slow[index] && slope <= 0
        ? -1
        : 0;
    const distancePct = slow[index] ? (fast[index] / slow[index] - 1) * 100 : 0;
    const score = clamp(50 + Math.sign(direction) * 28 + clamp(distancePct * 10, -18, 18), 0, 100);
    return { available: true, label, direction, score, close: closes[index], fast: fast[index], slow: slow[index], slope, distancePct };
  }

  function multiTimeframeAnalysis(rows, settings = {}) {
    const isCrypto = settings.market === "crypto";
    const groups = Array.isArray(settings.timeframeGroups) && settings.timeframeGroups.length >= 2
      ? settings.timeframeGroups.slice(0, 2).map((value) => Math.max(2, Math.floor(finite(value, 2))))
      : isCrypto ? [6, 42] : [5, 20];
    const labels = Array.isArray(settings.timeframeLabels) && settings.timeframeLabels.length >= 3
      ? settings.timeframeLabels.slice(0, 3)
      : isCrypto ? ["4 saat", "1 gün", "1 hafta"] : ["1 gün", "1 hafta", "1 ay"];
    const primary = timeframeTrend(rows, labels[0], 13, 34);
    const medium = timeframeTrend(aggregateRows(rows, groups[0]), labels[1]);
    const higher = timeframeTrend(aggregateRows(rows, groups[1]), labels[2]);
    const available = primary.available && medium.available && higher.available;
    const alignmentScore = available ? primary.score * 0.45 + medium.score * 0.30 + higher.score * 0.25 : 0;
    const passed = available && primary.direction >= 0 && medium.direction >= 0 && higher.direction >= 0 && alignmentScore >= 58;
    return {
      available,
      passed,
      alignmentScore,
      groups,
      labels,
      primary,
      medium,
      higher,
      directions: [primary.direction, medium.direction, higher.direction],
      summary: available
        ? `${labels[0]} ${primary.direction > 0 ? "yukarı" : primary.direction < 0 ? "aşağı" : "yatay"} · ${labels[1]} ${medium.direction > 0 ? "yukarı" : medium.direction < 0 ? "aşağı" : "yatay"} · ${labels[2]} ${higher.direction > 0 ? "yukarı" : higher.direction < 0 ? "aşağı" : "yatay"}`
        : "Çoklu zaman dilimi için yeterli kapanmış mum yok.",
    };
  }

  function assessDataHealth(rows, settings = {}) {
    const market = settings.market === "crypto" ? "crypto" : "bist";
    const minimumRows = Math.max(120, Math.floor(finite(settings.minimumHealthRows, 120)));
    const timestamps = [];
    let invalidOhlc = 0;
    let zeroVolume = 0;
    for (const row of rows || []) {
      const values = [row?.open, row?.high, row?.low, row?.close].map(Number);
      if (!values.every(Number.isFinite) || values[3] <= 0 || values[1] < Math.max(values[0], values[3]) || values[2] > Math.min(values[0], values[3])) invalidOhlc += 1;
      if (finite(row?.volume) <= 0) zeroVolume += 1;
      const timestamp = Number.isFinite(Number(row?.timestamp)) ? Number(row.timestamp) : Date.parse(row?.time || "");
      if (Number.isFinite(timestamp)) timestamps.push(timestamp);
    }
    const duplicateTimes = timestamps.length - new Set(timestamps).size;
    const returns = [];
    for (let index = 1; index < (rows || []).length; index += 1) {
      const previous = finite(rows[index - 1]?.close, NaN);
      const current = finite(rows[index]?.close, NaN);
      if (previous > 0 && current > 0) returns.push((current / previous - 1) * 100);
    }
    const returnMedian = quantile(returns, 0.5);
    const absoluteDeviations = returns.map((value) => Math.abs(value - returnMedian));
    const mad = quantile(absoluteDeviations, 0.5);
    const robustLimit = Math.max(market === "crypto" ? 55 : 35, mad * 12);
    const recentReturns = returns.slice(-120);
    const extremeMoves = recentReturns.filter((value) => Math.abs(value - returnMedian) > robustLimit).length;
    const deltas = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]).filter((value) => value > 0);
    const medianDelta = quantile(deltas, 0.5);
    const gapMultiplier = market === "crypto" ? 1.75 : 5.5;
    const abnormalGaps = medianDelta > 0 ? deltas.slice(-120).filter((value) => value > medianDelta * gapMultiplier).length : 0;
    const zeroVolumePct = rows?.length ? zeroVolume / rows.length * 100 : 100;
    const score = clamp(100 - invalidOhlc * 35 - duplicateTimes * 25 - extremeMoves * 28 - abnormalGaps * 8 - Math.max(0, zeroVolumePct - 5) * 0.5, 0, 100);
    const passed = (rows?.length || 0) >= minimumRows && invalidOhlc === 0 && duplicateTimes === 0 && extremeMoves === 0 && abnormalGaps <= 2 && zeroVolumePct <= 35;
    const warnings = [];
    if ((rows?.length || 0) < minimumRows) warnings.push(`${rows?.length || 0}/${minimumRows} mum`);
    if (invalidOhlc) warnings.push(`${invalidOhlc} bozuk OHLC`);
    if (duplicateTimes) warnings.push(`${duplicateTimes} tekrar zaman`);
    if (extremeMoves) warnings.push(`${extremeMoves} açıklanamayan uç hareket`);
    if (abnormalGaps > 2) warnings.push(`${abnormalGaps} zaman boşluğu`);
    if (zeroVolumePct > 35) warnings.push(`hacimsiz mum %${zeroVolumePct.toFixed(0)}`);
    return { market, passed, score, sampleSize: rows?.length || 0, minimumRows, invalidOhlc, duplicateTimes, extremeMoves, abnormalGaps, zeroVolumePct, robustMoveLimitPct: robustLimit, warnings, status: passed ? "SAĞLIKLI" : "KARANTİNA" };
  }

  function featureMatrix(rows, settings = {}) {
    const fastLen = finite(settings.fastLen, 21);
    const slowLen = finite(settings.slowLen, 55);
    const closes = rows.map((r) => r.close);
    const volumes = rows.map((r) => r.volume);
    const highs = rows.map((r) => r.high);
    const lows = rows.map((r) => r.low);
    const fast = ema(closes, fastLen);
    const slow = ema(closes, slowLen);
    const rsiValues = rsi(closes, 14);
    const atrValues = atr(rows, 14);
    const macdValues = macd(closes);
    const volumeAverage = sma(volumes, 20);
    return rows.map((row, i) => {
      const currentAtr = finite(atrValues[i], row.close * 0.01);
      const breakoutHigh = i > 20 ? highest(highs, i - 1, 20) : row.high;
      const breakoutLow = i > 20 ? lowest(lows, i - 1, 20) : row.low;
      const volumeRatio = volumeAverage[i] > 0 ? row.volume / volumeAverage[i] : 1;
      const trend = fast[i] > slow[i] ? 1 : fast[i] < slow[i] ? -1 : 0;
      const distanceFastAtr = (row.close - fast[i]) / Math.max(currentAtr, row.close * 0.001);
      const trendStrengthAtr = (fast[i] - slow[i]) / Math.max(currentAtr, row.close * 0.001);
      const changeAtr = i > 0 ? (row.close - rows[i - 1].close) / Math.max(currentAtr, row.close * 0.001) : 0;
      const scoreLong =
        (fast[i] > slow[i] ? 22 : 0) +
        (row.close > fast[i] ? 12 : 0) +
        (finite(rsiValues[i]) >= 52 && finite(rsiValues[i]) <= 72 ? 16 : 0) +
        (macdValues.histogram[i] > 0 ? 16 : 0) +
        (volumeRatio >= 0.8 ? 12 : 0) +
        (row.close > breakoutHigh ? 22 : 0);
      const scoreShort =
        (fast[i] < slow[i] ? 22 : 0) +
        (row.close < fast[i] ? 12 : 0) +
        (finite(rsiValues[i]) <= 48 && finite(rsiValues[i]) >= 28 ? 16 : 0) +
        (macdValues.histogram[i] < 0 ? 16 : 0) +
        (volumeRatio >= 0.8 ? 12 : 0) +
        (row.close < breakoutLow ? 22 : 0);
      const pullbackScore =
        (fast[i] > slow[i] ? 22 : 0) +
        (row.close > slow[i] ? 14 : 0) +
        (distanceFastAtr >= -0.35 && distanceFastAtr <= 0.75 ? 24 : 0) +
        (finite(rsiValues[i], 50) >= 42 && finite(rsiValues[i], 50) <= 63 ? 16 : 0) +
        (macdValues.histogram[i] >= -currentAtr * 0.12 ? 10 : 0) +
        (volumeRatio >= 0.65 ? 8 : 0) +
        (changeAtr > 0 ? 6 : 0);
      const breakoutScore =
        (fast[i] > slow[i] ? 20 : 0) +
        (row.close > fast[i] ? 10 : 0) +
        (row.close > breakoutHigh ? 28 : 0) +
        (volumeRatio >= 1.10 ? 18 : volumeRatio >= 0.85 ? 8 : 0) +
        (finite(rsiValues[i], 50) >= 54 && finite(rsiValues[i], 50) <= 76 ? 14 : 0) +
        (macdValues.histogram[i] > 0 ? 10 : 0);
      const meanReversionScore =
        (Math.abs(trendStrengthAtr) <= 1.20 ? 20 : 0) +
        (finite(rsiValues[i], 50) <= 40 ? 24 : 0) +
        (row.close <= fast[i] ? 14 : 0) +
        (changeAtr > 0 ? 22 : 0) +
        (volumeRatio >= 0.80 ? 10 : 0) +
        (row.close >= row.low + (row.high - row.low) * 0.55 ? 10 : 0);
      return {
        index: i,
        close: row.close,
        fast: fast[i],
        slow: slow[i],
        atr: currentAtr,
        atrPct: currentAtr / row.close * 100,
        rsi: finite(rsiValues[i], 50),
        macdHistogram: finite(macdValues.histogram[i]),
        volumeRatio,
        trend,
        breakoutHigh,
        breakoutLow,
        distanceFastAtr,
        trendStrengthAtr,
        changeAtr,
        scoreLong,
        scoreShort,
        strategyScores: {
          trend: scoreLong,
          pullback: pullbackScore,
          breakout: breakoutScore,
          meanReversion: meanReversionScore,
        },
        vector: [
          clamp((fast[i] - slow[i]) / currentAtr, -4, 4),
          clamp((row.close - fast[i]) / currentAtr, -4, 4),
          clamp((finite(rsiValues[i], 50) - 50) / 20, -2.5, 2.5),
          clamp(finite(macdValues.histogram[i]) / currentAtr, -3, 3),
          clamp(volumeRatio - 1, -2, 4),
          row.close > breakoutHigh ? 1 : row.close < breakoutLow ? -1 : 0,
          clamp(currentAtr / row.close * 100 / 5, 0, 3),
        ],
      };
    });
  }

  function strategySetup(feature, settings = {}) {
    const mode = STRATEGY_LIBRARY[settings.strategyMode] ? settings.strategyMode : "trend";
    const threshold = finite(settings.threshold, 62);
    const score = finite(feature?.strategyScores?.[mode], feature?.scoreLong);
    const regime = mode === "meanReversion"
      ? Math.abs(finite(feature?.trendStrengthAtr)) <= 1.20 && finite(feature?.rsi, 50) <= 42 && finite(feature?.changeAtr) > 0
      : feature?.trend > 0;
    return { mode, label: STRATEGY_LIBRARY[mode].label, threshold, score, regime, long: Boolean(regime) && score >= threshold };
  }

  function sigmoid(value) { return 1 / (1 + Math.exp(-clamp(value, -30, 30))); }

  function analogForecast(rows, features, horizon, settings = {}) {
    const bars = Math.max(1, Math.floor(finite(horizon, 5)));
    const latest = features[features.length - 1];
    const candidates = [];
    for (let i = Math.max(60, finite(settings.slowLen, 55)); i < rows.length - bars; i += 1) {
      const distance = Math.sqrt(mean(features[i].vector.map((value, dimension) => (value - latest.vector[dimension]) ** 2)));
      const returnPct = (rows[i + bars].close / rows[i].close - 1) * 100;
      const sidewaysThreshold = Math.max(0.20, features[i].atrPct * 0.30 * Math.sqrt(bars));
      candidates.push({ distance, returnPct, sidewaysThreshold });
    }
    if (candidates.length < 40) {
      return { available: false, horizon: bars, reason: `${bars} günlük yön tahmini için geçmiş örnek yetersiz.` };
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = candidates.slice(0, Math.min(60, Math.max(32, Math.floor(Math.sqrt(candidates.length) * 3))));
    let upWeight = 6;
    let downWeight = 6;
    let flatWeight = 6;
    for (const item of selected) {
      const weight = 1 / (0.15 + item.distance);
      if (item.returnPct > item.sidewaysThreshold) upWeight += weight;
      else if (item.returnPct < -item.sidewaysThreshold) downWeight += weight;
      else flatWeight += weight;
    }
    const totalWeight = upWeight + downWeight + flatWeight;
    const probabilityUp = upWeight / totalWeight * 100;
    const probabilityDown = downWeight / totalWeight * 100;
    const probabilityFlat = Math.max(0, 100 - probabilityUp - probabilityDown);
    const returns = selected.map((item) => item.returnPct);
    const direction = probabilityUp >= probabilityDown && probabilityUp >= probabilityFlat
      ? "YÜKSELİŞ"
      : probabilityDown >= probabilityFlat
        ? "DÜŞÜŞ"
        : "YATAY";
    const averageDistance = mean(selected.map((item) => item.distance));
    const expectedLowPct = quantile(returns, 0.20);
    const expectedMedianPct = quantile(returns, 0.50);
    const expectedHighPct = quantile(returns, 0.80);
    const intervalWidthPct = expectedHighPct - expectedLowPct;
    const maximumIntervalWidthPct = clamp(latest.atrPct * Math.sqrt(bars) * 3.2, 6, settings.market === "crypto" ? 60 : 45);
    const reliable = selected.length >= 36 && averageDistance <= 1.8 && intervalWidthPct <= maximumIntervalWidthPct;
    return {
      available: true,
      horizon: bars,
      direction,
      probabilityUp,
      probabilityDown,
      probabilityFlat,
      expectedLowPct,
      expectedMedianPct,
      expectedHighPct,
      intervalWidthPct,
      maximumIntervalWidthPct,
      reliable,
      reliability: reliable ? "KULLANILABİLİR" : "DÜŞÜK",
      analogCount: selected.length,
      quality: selected.length >= 48 && averageDistance <= 1.25 ? "Orta-yüksek" : selected.length >= 36 ? "Orta" : "Düşük",
    };
  }

  function trainLocalModel(rows, features, settings = {}) {
    const horizon = Math.max(3, Math.floor(finite(settings.horizon, 8)));
    const start = Math.max(60, finite(settings.slowLen, 55));
    const samples = [];
    for (let i = start; i < rows.length - horizon; i += 1) {
      const futureReturn = (rows[i + horizon].close - rows[i].close) / Math.max(features[i].atr, rows[i].close * 0.001);
      samples.push({ x: features[i].vector, y: futureReturn > 0.35 ? 1 : 0, index: i });
    }
    if (samples.length < 120) return { available: false, reason: "Makine öğrenmesi için en az 180 geçerli mum gerekli." };
    const split = Math.max(80, Math.floor(samples.length * 0.70));
    // Leave a horizon-sized gap so training labels cannot see into the test period.
    const train = samples.slice(0, Math.max(60, split - horizon));
    const test = samples.slice(split);
    const dimensions = train[0].x.length;
    const means = Array.from({ length: dimensions }, (_, d) => mean(train.map((s) => s.x[d])));
    const deviations = Array.from({ length: dimensions }, (_, d) => Math.sqrt(mean(train.map((s) => (s.x[d] - means[d]) ** 2))) || 1);
    const normalize = (x) => x.map((v, d) => (v - means[d]) / deviations[d]);
    let weights = new Array(dimensions).fill(0);
    let bias = 0;
    const learningRate = 0.045;
    const iterations = 420;
    for (let iter = 0; iter < iterations; iter += 1) {
      let gradB = 0;
      const gradW = new Array(dimensions).fill(0);
      for (const sample of train) {
        const x = normalize(sample.x);
        const probability = sigmoid(bias + x.reduce((sum, v, d) => sum + v * weights[d], 0));
        const error = probability - sample.y;
        gradB += error;
        for (let d = 0; d < dimensions; d += 1) gradW[d] += error * x[d] + 0.001 * weights[d];
      }
      bias -= learningRate * gradB / train.length;
      for (let d = 0; d < dimensions; d += 1) weights[d] -= learningRate * gradW[d] / train.length;
    }
    const predict = (x) => sigmoid(bias + normalize(x).reduce((sum, v, d) => sum + v * weights[d], 0));
    let correct = 0;
    let brier = 0;
    const testPredictions = [];
    for (const sample of test) {
      const probability = predict(sample.x);
      if ((probability >= 0.5 ? 1 : 0) === sample.y) correct += 1;
      brier += (probability - sample.y) ** 2;
      testPredictions.push({ probability, outcome: sample.y, index: sample.index });
    }
    const latestProbability = predict(features[features.length - 1].vector) * 100;
    const reliability = Array.from({ length: 5 }, (_, index) => {
      const low = index / 5;
      const high = (index + 1) / 5;
      const values = testPredictions.filter((item) => item.probability >= low && (index === 4 ? item.probability <= high : item.probability < high));
      const predicted = values.length ? mean(values.map((item) => item.probability)) : (low + high) / 2;
      const observed = values.length ? (values.reduce((sum, item) => sum + item.outcome, 0) + 1) / (values.length + 2) : predicted;
      return { low: low * 100, high: high * 100, count: values.length, predicted: predicted * 100, observed: observed * 100 };
    });
    const reliabilityCount = Math.max(1, testPredictions.length);
    const calibrationError = reliability.reduce((sum, bin) => sum + Math.abs(bin.predicted - bin.observed) * bin.count / reliabilityCount, 0);
    const latestBin = reliability[Math.min(4, Math.floor(latestProbability / 20))];
    const calibrationWeight = clamp(latestBin.count / 24, 0, 0.75);
    const calibratedProbabilityUp = latestProbability * (1 - calibrationWeight) + latestBin.observed * calibrationWeight;
    return {
      available: true,
      trainSamples: train.length,
      testSamples: test.length,
      outOfSampleAccuracy: test.length ? correct / test.length * 100 : 0,
      brierScore: test.length ? brier / test.length : 1,
      probabilityUp: latestProbability,
      probabilityDown: 100 - latestProbability,
      calibratedProbabilityUp,
      calibratedProbabilityDown: 100 - calibratedProbabilityUp,
      expectedCalibrationError: calibrationError,
      reliability,
      quality: test.length >= 100 && brier / test.length < 0.24 ? "Orta-yüksek" : test.length >= 40 ? "Orta" : "Düşük",
      weights,
      bias,
    };
  }

  function backtest(rows, features, settings = {}) {
    const threshold = finite(settings.threshold, 62);
    const stopAtr = finite(settings.stopAtr, 2);
    const rewardRisk = finite(settings.rewardRisk, 2);
    const allowShort = Boolean(settings.allowShort);
    const trades = [];
    let active = null;
    let cooldownUntil = 0;
    for (let i = 60; i < rows.length; i += 1) {
      const row = rows[i];
      if (active) {
        const stopHit = active.side === "LONG" ? row.low <= active.stop : row.high >= active.stop;
        const targetHit = active.side === "LONG" ? row.high >= active.target : row.low <= active.target;
        if (stopHit || targetHit || i - active.entryIndex >= finite(settings.maxHoldingBars, 80)) {
          let exit = row.close;
          let resultR = active.side === "LONG" ? (exit - active.entry) / active.riskDistance : (active.entry - exit) / active.riskDistance;
          let reason = "TIME";
          if (stopHit) {
            // A gap through the stop is filled at the worse opening price. This is deliberately conservative.
            exit = active.side === "LONG" ? Math.min(active.stop, row.open) : Math.max(active.stop, row.open);
            resultR = active.side === "LONG" ? (exit - active.entry) / active.riskDistance : (active.entry - exit) / active.riskDistance;
            reason = "STOP";
          }
          else if (targetHit) { exit = active.target; resultR = rewardRisk; reason = "TARGET"; }
          const tradingCostPct = finite(settings.commissionPct, 0.10) + finite(settings.slippagePct, 0.02);
          const tradingCostR = (active.entry + exit) * (tradingCostPct / 100) / active.riskDistance;
          resultR -= tradingCostR;
          trades.push({ ...active, exitIndex: i, exitTime: row.time, exit, resultR, win: resultR > 0, reason, tradingCostR });
          active = null;
          cooldownUntil = i + finite(settings.cooldownBars, 3);
        }
      }
      if (!active && i >= cooldownUntil && features[i].atrPct <= finite(settings.maxAtrPct, 8)) {
        const strategy = strategySetup(features[i], { ...settings, threshold });
        const longSetup = strategy.long;
        const shortSetup = allowShort && features[i].trend < 0 && features[i].scoreShort >= threshold;
        if (longSetup || shortSetup) {
          const side = longSetup ? "LONG" : "SHORT";
          const riskDistance = Math.max(features[i].atr * stopAtr, row.close * 0.001);
          active = {
            side,
            entryIndex: i,
            entryTime: row.time,
            entry: row.close,
            riskDistance,
            stop: side === "LONG" ? row.close - riskDistance : row.close + riskDistance,
            target: side === "LONG" ? row.close + riskDistance * rewardRisk : row.close - riskDistance * rewardRisk,
            strategy: strategy.mode,
            score: longSetup ? strategy.score : features[i].scoreShort,
          };
        }
      }
    }
    const wins = trades.filter((t) => t.win).length;
    const losses = trades.length - wins;
    const grossWinR = trades.filter((t) => t.resultR > 0).reduce((a, t) => a + t.resultR, 0);
    const grossLossR = Math.abs(trades.filter((t) => t.resultR <= 0).reduce((a, t) => a + t.resultR, 0));
    const probability = (wins + 1) / (trades.length + 2) * 100;
    const interval = wilsonInterval(wins, trades.length);
    const expectancyR = trades.length ? trades.reduce((a, t) => a + t.resultR, 0) / trades.length : 0;
    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let lossStreak = 0;
    let maxLossStreak = 0;
    const curve = [];
    for (const trade of trades) {
      equityR += trade.resultR;
      peakR = Math.max(peakR, equityR);
      maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
      lossStreak = trade.win ? 0 : lossStreak + 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
      curve.push(equityR);
    }
    const recentTrades = trades.slice(-Math.max(6, Math.ceil(trades.length * 0.35)));
    const recentWinsR = recentTrades.filter((trade) => trade.resultR > 0).reduce((sum, trade) => sum + trade.resultR, 0);
    const recentLossR = Math.abs(recentTrades.filter((trade) => trade.resultR <= 0).reduce((sum, trade) => sum + trade.resultR, 0));
    const recentExpectancyR = recentTrades.length ? recentTrades.reduce((sum, trade) => sum + trade.resultR, 0) / recentTrades.length : 0;
    const stress = monteCarloStress(trades, finite(settings.monteCarloIterations, 250));
    return {
      trades,
      totalTrades: trades.length,
      wins,
      losses,
      smoothedWinProbability: probability,
      confidenceLow: interval.low * 100,
      confidenceHigh: interval.high * 100,
      profitFactor: grossLossR ? grossWinR / grossLossR : grossWinR ? Infinity : 0,
      expectancyR,
      netR: equityR,
      maxDrawdownR,
      maxLossStreak,
      curve,
      recentTrades: recentTrades.length,
      recentExpectancyR,
      recentProfitFactor: recentLossR ? recentWinsR / recentLossR : recentWinsR ? Infinity : 0,
      stress,
    };
  }

  function monteCarloStress(trades, iterations = 250) {
    if (!Array.isArray(trades) || trades.length < 8) return { available: false, reason: "Stres testi için en az 8 işlem gerekli." };
    const count = Math.max(100, Math.min(1000, Math.floor(iterations)));
    const netResults = [];
    const drawdowns = [];
    let profitable = 0;
    let seed = (trades.length * 2654435761) >>> 0;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let simulation = 0; simulation < count; simulation += 1) {
      let equity = 0;
      let peak = 0;
      let maxDrawdown = 0;
      for (let index = 0; index < trades.length; index += 1) {
        const sample = trades[Math.min(trades.length - 1, Math.floor(random() * trades.length))];
        equity += sample.resultR;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.max(maxDrawdown, peak - equity);
      }
      if (equity > 0) profitable += 1;
      netResults.push(equity);
      drawdowns.push(maxDrawdown);
    }
    return {
      available: true,
      iterations: count,
      profitablePct: profitable / count * 100,
      p10NetR: quantile(netResults, 0.10),
      medianNetR: quantile(netResults, 0.50),
      p90DrawdownR: quantile(drawdowns, 0.90),
    };
  }

  function wilsonInterval(wins, total, z = 1.96) {
    if (!total) return { low: 0, high: 1 };
    const p = wins / total;
    const denominator = 1 + z * z / total;
    const center = (p + z * z / (2 * total)) / denominator;
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
    return { low: clamp(center - margin, 0, 1), high: clamp(center + margin, 0, 1) };
  }

  function classifyRegime(features) {
    const latest = features[features.length - 1] || {};
    const recent = features.slice(-80);
    const volatilityReference = quantile(recent.map((item) => finite(item.atrPct)).filter((value) => value > 0), 0.80);
    const highVolatility = finite(latest.atrPct) >= Math.max(4.5, volatilityReference * 1.15);
    const pumpRisk = finite(latest.volumeRatio) >= 3.5 && Math.abs(finite(latest.changeAtr)) >= 1.8;
    let id = "sideways";
    if (pumpRisk) id = "liquidityPump";
    else if (highVolatility) id = "highVolatility";
    else if (finite(latest.trend) < 0 && finite(latest.trendStrengthAtr) <= -0.65 && finite(latest.rsi, 50) < 46) id = "riskOff";
    else if (finite(latest.trend) > 0 && finite(latest.trendStrengthAtr) >= 0.90 && finite(latest.rsi, 50) >= 50) id = "strongTrend";
    else if (finite(latest.trend) > 0) id = "weakTrend";
    else if (Math.abs(finite(latest.trendStrengthAtr)) <= 0.75) id = "sideways";
    else id = "riskOff";
    const labels = {
      strongTrend: "Güçlü yükseliş trendi",
      weakTrend: "Zayıf yükseliş trendi",
      sideways: "Yatay / kararsız",
      highVolatility: "Yüksek oynaklık",
      riskOff: "Riskten kaçış",
      liquidityPump: "Likidite / ani hareket riski",
    };
    return {
      id,
      label: labels[id],
      highVolatility,
      pumpRisk,
      atrPct: finite(latest.atrPct),
      trendStrengthAtr: finite(latest.trendStrengthAtr),
      rsi: finite(latest.rsi, 50),
      volumeRatio: finite(latest.volumeRatio, 1),
    };
  }

  function regimeCompatibility(mode, regimeId) {
    const matrix = {
      trend: { strongTrend: 1, weakTrend: 0.78, sideways: 0.30, highVolatility: 0.38, riskOff: 0.08, liquidityPump: 0.12 },
      pullback: { strongTrend: 0.82, weakTrend: 1, sideways: 0.42, highVolatility: 0.30, riskOff: 0.08, liquidityPump: 0.10 },
      breakout: { strongTrend: 0.96, weakTrend: 0.70, sideways: 0.28, highVolatility: 0.48, riskOff: 0.08, liquidityPump: 0.10 },
      meanReversion: { strongTrend: 0.12, weakTrend: 0.35, sideways: 1, highVolatility: 0.18, riskOff: 0.12, liquidityPump: 0.08 },
    };
    return finite(matrix[mode]?.[regimeId], 0.15);
  }

  function tradeSummary(trades) {
    const safe = Array.isArray(trades) ? trades : [];
    const values = safe.map((trade) => finite(trade.resultR)).filter(Number.isFinite);
    const wins = values.filter((value) => value > 0).length;
    const grossWin = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(values.filter((value) => value <= 0).reduce((sum, value) => sum + value, 0));
    return {
      trades: values.length,
      wins,
      winRate: values.length ? wins / values.length * 100 : 0,
      expectancyR: mean(values),
      netR: values.reduce((sum, value) => sum + value, 0),
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    };
  }

  function combinations(values, size, start = 0, prefix = [], output = []) {
    if (prefix.length === size) { output.push(prefix); return output; }
    for (let index = start; index <= values.length - (size - prefix.length); index += 1) combinations(values, size, index + 1, [...prefix, values[index]], output);
    return output;
  }

  function probabilityOfBacktestOverfit(perStrategy, foldCount) {
    if (foldCount < 4 || Object.keys(perStrategy).length < 2) return { available: false, value: null, trials: 0 };
    const foldIndexes = Array.from({ length: foldCount }, (_, index) => index);
    const splits = combinations(foldIndexes, Math.floor(foldCount / 2));
    let failures = 0;
    let trials = 0;
    for (const training of splits) {
      const testing = foldIndexes.filter((index) => !training.includes(index));
      const scores = Object.entries(perStrategy).map(([id, metrics]) => ({
        id,
        train: mean(training.map((index) => finite(metrics.folds[index]?.expectancyR))),
        test: mean(testing.map((index) => finite(metrics.folds[index]?.expectancyR))),
      }));
      if (!scores.some((item) => Number.isFinite(item.train) && Number.isFinite(item.test))) continue;
      const selected = [...scores].sort((a, b) => b.train - a.train)[0];
      const testRanking = [...scores].sort((a, b) => b.test - a.test);
      const rank = testRanking.findIndex((item) => item.id === selected.id);
      if (rank >= Math.ceil(testRanking.length / 2)) failures += 1;
      trials += 1;
    }
    return { available: trials > 0, value: trials ? failures / trials : null, trials };
  }

  function deflatedSharpeApproximation(trades, strategyTrials) {
    const values = (trades || []).map((trade) => finite(trade.resultR)).filter(Number.isFinite);
    if (values.length < 8) return { available: false, probability: null, sharpe: null, expectedMaximum: null, reason: "En az 8 dönem dışı işlem gerekli." };
    const average = mean(values);
    const deviation = standardDeviation(values);
    if (!deviation) return { available: false, probability: null, sharpe: null, expectedMaximum: null, reason: "Getiri dağılımı hesaplanamadı." };
    const sharpe = average / deviation * Math.sqrt(values.length);
    const centered = values.map((value) => (value - average) / deviation);
    const skew = mean(centered.map((value) => value ** 3));
    const kurtosis = mean(centered.map((value) => value ** 4));
    const trials = Math.max(2, Math.floor(finite(strategyTrials, 4)));
    const expectedMaximum = Math.sqrt(2 * Math.log(trials)) - (Math.log(Math.log(trials)) + Math.log(4 * Math.PI)) / (2 * Math.sqrt(2 * Math.log(trials)));
    const denominator = Math.sqrt(Math.max(0.05, 1 - skew * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe));
    const probability = normalCdf((sharpe - expectedMaximum) * Math.sqrt(Math.max(1, values.length - 1)) / denominator);
    return { available: true, probability, sharpe, expectedMaximum, sampleSize: values.length, approximation: true };
  }

  function chronologicalValidation(rows, analyses, model, settings = {}) {
    const start = Math.max(80, Math.floor(rows.length * 0.45));
    const availableBars = rows.length - start;
    const foldCount = availableBars >= 160 ? 4 : availableBars >= 90 ? 3 : 2;
    const foldSize = Math.max(1, Math.floor(availableBars / foldCount));
    const folds = Array.from({ length: foldCount }, (_, index) => ({
      index,
      start: start + index * foldSize,
      end: index === foldCount - 1 ? rows.length - 1 : start + (index + 1) * foldSize - 1,
    }));
    const perStrategy = {};
    for (const analysis of analyses) {
      perStrategy[analysis.strategy.mode] = {
        id: analysis.strategy.mode,
        label: analysis.strategy.label,
        folds: folds.map((fold) => tradeSummary(analysis.backtest.trades.filter((trade) => trade.entryIndex >= fold.start && trade.entryIndex <= fold.end))),
      };
    }
    const walkForwardFolds = folds.map((fold, foldIndex) => {
      const candidates = analyses.map((analysis) => {
        const priorTrades = analysis.backtest.trades.filter((trade) => trade.entryIndex < fold.start);
        const prior = tradeSummary(priorTrades);
        const robustScore = clamp(50 + prior.expectancyR * 34, 0, 100) * 0.40
          + clamp((Number.isFinite(prior.profitFactor) ? prior.profitFactor : 3) * 30, 0, 100) * 0.25
          + clamp(prior.trades / Math.max(8, finite(settings.minimumTrades, 20)) * 100, 0, 100) * 0.20
          + analysis.regimeCompatibility * 100 * 0.15;
        return { analysis, prior, robustScore };
      }).sort((a, b) => b.robustScore - a.robustScore);
      const champion = candidates[0];
      const challenger = candidates[1] || candidates[0];
      const trades = champion.analysis.backtest.trades.filter((trade) => trade.entryIndex >= fold.start && trade.entryIndex <= fold.end);
      return {
        fold: foldIndex + 1,
        startIndex: fold.start,
        endIndex: fold.end,
        startTime: rows[fold.start]?.time || null,
        endTime: rows[fold.end]?.time || null,
        champion: champion.analysis.strategy.mode,
        challenger: challenger.analysis.strategy.mode,
        ...tradeSummary(trades),
        tradeResults: trades,
      };
    });
    const oosTrades = walkForwardFolds.flatMap((fold) => fold.tradeResults);
    const oos = tradeSummary(oosTrades);
    const evaluatedFolds = walkForwardFolds.filter((fold) => fold.trades > 0);
    const profitableFolds = evaluatedFolds.filter((fold) => fold.expectancyR > 0).length;
    const stabilityPct = evaluatedFolds.length ? profitableFolds / evaluatedFolds.length * 100 : 0;
    const pbo = probabilityOfBacktestOverfit(perStrategy, foldCount);
    const dsr = deflatedSharpeApproximation(oosTrades, analyses.length);
    const firstOosIndex = folds[0]?.start || start;
    const benchmarkReturnPct = rows[firstOosIndex]?.close > 0 ? (rows[rows.length - 1].close / rows[firstOosIndex].close - 1) * 100 : null;
    const betaWinRate = (oos.wins + 2) / (oos.trades + 4) * 100;
    const modelProbability = model?.available ? finite(model.calibratedProbabilityUp, model.probabilityUp) : 50;
    const evidenceWeight = clamp(oos.trades / 24, 0.25, 0.80);
    const calibratedProbability = betaWinRate * evidenceWeight + modelProbability * (1 - evidenceWeight);
    let grade = "D";
    if (oos.trades >= 20 && oos.expectancyR > 0.10 && stabilityPct >= 75 && (!pbo.available || pbo.value <= 0.25) && dsr.available && dsr.probability >= 0.80) grade = "A";
    else if (oos.trades >= 12 && oos.expectancyR > 0 && stabilityPct >= 50 && (!pbo.available || pbo.value <= 0.50) && dsr.available && dsr.probability >= 0.55) grade = "B";
    else if (oos.trades >= 8 && oos.expectancyR > 0 && stabilityPct >= 50) grade = "C";
    const passed = grade === "A" || grade === "B";
    const overfitRisk = !pbo.available || !dsr.available ? "BELİRSİZ" : pbo.value > 0.50 || dsr.probability < 0.40 ? "YÜKSEK" : pbo.value > 0.25 || dsr.probability < 0.70 ? "ORTA" : "DÜŞÜK";
    return {
      method: "Sabit kurallar + yalnız geçmiş dönemden seçilen anchored walk-forward",
      folds: walkForwardFolds.map(({ tradeResults, ...fold }) => fold),
      foldCount,
      startIndex: firstOosIndex,
      oos,
      stabilityPct,
      profitableFolds,
      evaluatedFolds: evaluatedFolds.length,
      benchmarkReturnPct,
      pbo,
      deflatedSharpe: dsr,
      calibratedProbability: clamp(calibratedProbability, 5, 95),
      calibrationError: model?.available ? model.expectedCalibrationError : null,
      evidenceGrade: grade,
      passed,
      overfitRisk,
      perStrategy,
      reasons: [
        `${oos.trades} dönem dışı işlem; ${evaluatedFolds.length} test diliminin ${profitableFolds} tanesinde pozitif beklenti.`,
        pbo.available ? `Aşırı uyum olasılığı yaklaşık %${(pbo.value * 100).toFixed(1)}.` : "PBO için yeterli test dilimi yok.",
        dsr.available ? `Deflated Sharpe güveni yaklaşık %${(dsr.probability * 100).toFixed(1)}.` : dsr.reason,
      ],
    };
  }

  function riskPlan(input) {
    const capital = Math.max(0, finite(input.capital));
    const price = Math.max(0, finite(input.price));
    const atrValue = Math.max(price * 0.001, finite(input.atr, price * 0.02));
    const baseRiskPct = clamp(finite(input.riskPct, 0.5), 0.05, 2);
    const lossStreak = Math.max(0, Math.floor(finite(input.lossStreak)));
    const multiplier = lossStreak === 0 ? 1 : lossStreak === 1 ? 0.75 : lossStreak === 2 ? 0.5 : 0.25;
    const adjustedRiskPct = baseRiskPct * multiplier;
    const riskAmount = capital * adjustedRiskPct / 100;
    const stopDistance = atrValue * clamp(finite(input.stopAtr, 2), 0.5, 6);
    const maxPositionPct = clamp(finite(input.maxPositionPct, 25), 1, 100);
    const riskQuantity = price > 0 && stopDistance > 0 ? riskAmount / stopDistance : 0;
    const capitalQuantity = price > 0 ? capital * maxPositionPct / 100 / price : 0;
    const quantity = Math.floor(Math.min(riskQuantity, capitalQuantity));
    const side = input.side === "SHORT" ? "SHORT" : "LONG";
    const stop = side === "LONG" ? price - stopDistance : price + stopDistance;
    const target1 = side === "LONG" ? price + stopDistance * 1.2 : price - stopDistance * 1.2;
    const target2 = side === "LONG" ? price + stopDistance * 2 : price - stopDistance * 2;
    const target3 = side === "LONG" ? price + stopDistance * 3 : price - stopDistance * 3;
    return { capital, side, adjustedRiskPct, riskAmount, stopDistance, maxPositionPct, quantity, positionValue: quantity * price, entry: price, stop, target1, target2, target3, multiplier };
  }

  function analyze(rows, settings = {}) {
    if (!Array.isArray(rows) || rows.length < 60) throw new Error("Analiz için yeterli mum yok.");
    const prepared = settings._prepared || null;
    const features = prepared?.features || featureMatrix(rows, settings);
    const backtestResult = backtest(rows, features, settings);
    const model = prepared?.model || trainLocalModel(rows, features, settings);
    const dataHealth = prepared?.dataHealth || assessDataHealth(rows, settings);
    const multiTimeframe = prepared?.multiTimeframe || multiTimeframeAnalysis(rows, settings);
    const forecastHorizons = Array.isArray(settings.forecastHorizons)
      ? [...new Set(settings.forecastHorizons.map((value) => Math.max(1, Math.floor(finite(value)))).filter(Number.isFinite))].slice(0, 4)
      : [1, 5, 20];
    const safeHorizons = forecastHorizons.length ? forecastHorizons : [1, 5, 20];
    const primaryHorizon = Math.max(1, Math.floor(finite(settings.primaryHorizon, safeHorizons.includes(5) ? 5 : safeHorizons[Math.min(1, safeHorizons.length - 1)])));
    const forecasts = prepared?.forecasts || safeHorizons.map((horizon) => analogForecast(rows, features, horizon, settings));
    const primaryForecast = forecasts.find((forecast) => forecast.horizon === primaryHorizon) || forecasts[0];
    const latest = features[features.length - 1];
    const minimumTrades = finite(settings.minimumTrades, 30);
    const backtestReady = backtestResult.totalTrades >= minimumTrades;
    let blendedProbability = model.available && backtestReady
      ? backtestResult.smoothedWinProbability * 0.62 + (latest.trend >= 0 ? model.probabilityUp : model.probabilityDown) * 0.38
      : backtestReady ? backtestResult.smoothedWinProbability : model.available ? (latest.trend >= 0 ? model.probabilityUp : model.probabilityDown) : 50;
    if (primaryForecast?.available) blendedProbability = blendedProbability * 0.68 + primaryForecast.probabilityUp * 0.32;
    const positiveEdge = backtestReady && backtestResult.profitFactor >= 1.15 && backtestResult.expectancyR > 0;
    const activeStrategy = strategySetup(latest, settings);
    const longCandidate = activeStrategy.long;
    const shortCandidate = Boolean(settings.allowShort) && latest.trend < 0 && latest.scoreShort >= finite(settings.threshold, 62);
    let decision = "BEKLE";
    if (!backtestReady) decision = "VERİ YETERSİZ";
    else if (!positiveEdge) decision = "İŞLEM YOK";
    else if (longCandidate) decision = "LONG ADAYI";
    else if (shortCandidate) decision = "SHORT ADAYI";
    const agents = [
      { name: "Trend Ajanı", status: latest.trend > 0 ? "Olumlu" : latest.trend < 0 ? "Olumsuz" : "Nötr", score: latest.trend > 0 ? 78 : latest.trend < 0 ? 22 : 50, detail: latest.trend > 0 ? "Hızlı ortalama yavaş ortalamanın üzerinde." : "Trend yapısı yükselişi doğrulamıyor." },
      { name: "Strateji Seçici", status: activeStrategy.long ? "Kurulum var" : "Bekliyor", score: activeStrategy.score, detail: `${activeStrategy.label}: ${activeStrategy.score.toFixed(0)}/${activeStrategy.threshold.toFixed(0)}; piyasa rejimi ${activeStrategy.regime ? "uygun" : "uygun değil"}.` },
      { name: "Momentum Ajanı", status: latest.rsi >= 52 && latest.macdHistogram > 0 ? "Olumlu" : "Zayıf", score: clamp(50 + (latest.rsi - 50) * 1.2 + Math.sign(latest.macdHistogram) * 12, 0, 100), detail: `RSI ${latest.rsi.toFixed(1)}, MACD histogram ${latest.macdHistogram.toFixed(4)}.` },
      { name: "Hacim Ajanı", status: latest.volumeRatio >= 1 ? "Destekli" : "Zayıf", score: clamp(latest.volumeRatio * 55, 0, 100), detail: `Hacim, 20 mum ortalamasının ${latest.volumeRatio.toFixed(2)} katı.` },
      { name: "Backtest Denetçisi", status: positiveEdge ? "Geçti" : "Reddetti", score: clamp(backtestResult.profitFactor * 45, 0, 100), detail: `${backtestResult.totalTrades} işlem, PF ${Number.isFinite(backtestResult.profitFactor) ? backtestResult.profitFactor.toFixed(2) : "∞"}, beklenti ${backtestResult.expectancyR.toFixed(2)}R.` },
      { name: "ML Ajanı", status: model.available ? model.quality : "Veri yetersiz", score: model.available ? clamp(model.outOfSampleAccuracy, 0, 100) : 0, detail: model.available ? `Test doğruluğu %${model.outOfSampleAccuracy.toFixed(1)}, Brier ${model.brierScore.toFixed(3)}.` : model.reason },
      { name: "Yön Ajanı", status: primaryForecast?.available ? primaryForecast.direction : "Veri yetersiz", score: primaryForecast?.available ? primaryForecast.probabilityUp : 0, detail: primaryForecast?.available ? `${settings.primaryHorizonLabel || `${primaryHorizon} bar`}: yükseliş %${primaryForecast.probabilityUp.toFixed(1)}, düşüş %${primaryForecast.probabilityDown.toFixed(1)}, yatay %${primaryForecast.probabilityFlat.toFixed(1)}.` : primaryForecast?.reason },
      { name: "Stres Denetçisi", status: backtestResult.stress.available ? (backtestResult.stress.profitablePct >= 60 ? "Geçti" : "Zayıf") : "Veri yetersiz", score: backtestResult.stress.available ? backtestResult.stress.profitablePct : 0, detail: backtestResult.stress.available ? `${backtestResult.stress.iterations} Monte Carlo yolu; pozitif kapanış %${backtestResult.stress.profitablePct.toFixed(1)}, kötü %10 net ${backtestResult.stress.p10NetR.toFixed(2)}R.` : backtestResult.stress.reason },
      { name: "Veri Sağlığı", status: dataHealth.status, score: dataHealth.score, detail: dataHealth.passed ? `${dataHealth.sampleSize} mum; OHLC, tekrar, uç hareket ve zaman boşluğu kontrolleri geçti.` : dataHealth.warnings.join(" · ") },
      { name: "Çoklu Zaman", status: multiTimeframe.passed ? "Uyumlu" : "Çelişkili", score: multiTimeframe.alignmentScore, detail: multiTimeframe.summary },
    ];
    return {
      latest,
      backtest: backtestResult,
      model,
      dataHealth,
      multiTimeframe,
      forecasts,
      primaryHorizon,
      strategy: activeStrategy,
      agents,
      decision,
      setupScore: Math.max(activeStrategy.score, latest.scoreShort),
      estimatedProbability: clamp(blendedProbability, 5, 95),
      probabilityLabel: !backtestReady ? "Hesaplanamaz" : backtestResult.totalTrades >= 100 && model.available ? "Orta-yüksek" : backtestResult.totalTrades >= 30 ? "Orta" : "Düşük",
      reasons: [
        backtestReady ? `Olasılık ${backtestResult.totalTrades} geçmiş işlemden yumuşatıldı.` : `Minimum ${minimumTrades} işlem oluşmadı.`,
        positiveEdge ? "Komisyon ve fiyat kayması sonrası backtest pozitif beklenti gösteriyor." : "Masraflar sonrası backtest pozitif avantajı doğrulamadı.",
        model.available ? "Yerel model yalnızca kronolojik eğitim bölümünde eğitildi; son bölüm test için ayrıldı." : model.reason,
        "Sonuç gelecek performansı garanti etmez ve gerçek emir değildir.",
      ],
    };
  }

  function analyzeStrategies(rows, settings = {}) {
    if (!Array.isArray(rows) || rows.length < 60) throw new Error("Analiz için yeterli mum yok.");
    const modes = (Array.isArray(settings.strategyModes) ? settings.strategyModes : Object.keys(STRATEGY_LIBRARY)).filter((mode) => STRATEGY_LIBRARY[mode]);
    const safeModes = modes.length ? [...new Set(modes)] : ["trend"];
    const features = featureMatrix(rows, settings);
    const model = trainLocalModel(rows, features, settings);
    const dataHealth = assessDataHealth(rows, settings);
    const multiTimeframe = multiTimeframeAnalysis(rows, settings);
    const forecastHorizons = Array.isArray(settings.forecastHorizons)
      ? [...new Set(settings.forecastHorizons.map((value) => Math.max(1, Math.floor(finite(value)))).filter(Number.isFinite))].slice(0, 4)
      : [1, 5, 20];
    const safeHorizons = forecastHorizons.length ? forecastHorizons : [1, 5, 20];
    const forecasts = safeHorizons.map((horizon) => analogForecast(rows, features, horizon, settings));
    const prepared = { features, model, forecasts, dataHealth, multiTimeframe };
    const regime = classifyRegime(features);
    const baseThreshold = finite(settings.threshold, 62);
    const analyses = safeModes.map((mode) => {
      const profile = STRATEGY_LIBRARY[mode];
      const analysis = analyze(rows, { ...settings, strategyMode: mode, threshold: baseThreshold + profile.thresholdOffset, _prepared: prepared });
      const backtestResult = analysis.backtest;
      const compatibility = regimeCompatibility(mode, regime.id);
      const profitFactorScore = Number.isFinite(backtestResult.profitFactor) ? clamp(backtestResult.profitFactor * 35, 0, 100) : 100;
      const sampleScore = clamp(backtestResult.totalTrades / Math.max(1, finite(settings.minimumTrades, 20)) * 55, 0, 100);
      const recentScore = clamp(50 + backtestResult.recentExpectancyR * 45, 0, 100);
      const selectionScore = analysis.setupScore * 0.28 + profitFactorScore * 0.20 + clamp(50 + backtestResult.expectancyR * 40, 0, 100) * 0.15 + recentScore * 0.12 + sampleScore * 0.10 + compatibility * 100 * 0.15 + (analysis.decision === "LONG ADAYI" ? 8 : 0);
      return { ...analysis, regime, regimeCompatibility: compatibility, selectionScore: clamp(selectionScore, 0, 100) };
    });
    const naiveLeader = [...analyses].sort((a, b) => Number(b.decision === "LONG ADAYI") - Number(a.decision === "LONG ADAYI") || b.selectionScore - a.selectionScore)[0];
    const validation = chronologicalValidation(rows, analyses, model, settings);
    for (const analysis of analyses) {
      const folds = validation.perStrategy[analysis.strategy.mode]?.folds || [];
      const testedTrades = folds.reduce((sum, fold) => sum + fold.trades, 0);
      const netR = folds.reduce((sum, fold) => sum + fold.netR, 0);
      const positiveFolds = folds.filter((fold) => fold.trades > 0 && fold.expectancyR > 0).length;
      const evaluatedFolds = folds.filter((fold) => fold.trades > 0).length;
      const stability = evaluatedFolds ? positiveFolds / evaluatedFolds * 100 : 0;
      const expectancy = testedTrades ? netR / testedTrades : 0;
      const robustnessScore = clamp(50 + expectancy * 38, 0, 100) * 0.50 + stability * 0.30 + clamp(testedTrades / 18 * 100, 0, 100) * 0.20;
      analysis.validationSummary = { testedTrades, expectancyR: expectancy, stabilityPct: stability, positiveFolds, evaluatedFolds, robustnessScore };
      analysis.v3SelectionScore = clamp(analysis.selectionScore * 0.65 + robustnessScore * 0.25 + analysis.regimeCompatibility * 100 * 0.10, 0, 100);
    }
    analyses.sort((a, b) => Number(b.decision === "LONG ADAYI") - Number(a.decision === "LONG ADAYI") || b.v3SelectionScore - a.v3SelectionScore || b.backtest.totalTrades - a.backtest.totalTrades);
    const selected = analyses[0];
    const challenger = analyses[1] || analyses[0];
    const selectedTrades = selected.backtest.trades.filter((trade) => trade.entryIndex >= validation.startIndex);
    const selectedDsr = deflatedSharpeApproximation(selectedTrades, analyses.length);
    const selectedMetrics = selected.validationSummary;
    let selectedGrade = "D";
    if (selectedMetrics.testedTrades >= 20 && selectedMetrics.expectancyR > 0.10 && selectedMetrics.stabilityPct >= 75 && selectedDsr.available && selectedDsr.probability >= 0.80) selectedGrade = "A";
    else if (selectedMetrics.testedTrades >= 12 && selectedMetrics.expectancyR > 0 && selectedMetrics.stabilityPct >= 50 && selectedDsr.available && selectedDsr.probability >= 0.55) selectedGrade = "B";
    else if (selectedMetrics.testedTrades >= 8 && selectedMetrics.expectancyR > 0 && selectedMetrics.stabilityPct >= 50) selectedGrade = "C";
    const overallGrade = validation.evidenceGrade;
    const finalGrade = conservativeEvidenceGrade(selectedGrade, overallGrade);
    const selectedValidation = {
      ...validation,
      selectedStrategy: selected.strategy.mode,
      selectedStrategyLabel: selected.strategy.label,
      selectedStrategyMetrics: selectedMetrics,
      selectedDeflatedSharpe: selectedDsr,
      selectedEvidenceGrade: selectedGrade,
      overallEvidenceGrade: overallGrade,
      evidenceGrade: finalGrade,
      requiredOosTrades: 12,
      oosProgress: `${validation.oos.trades}/12`,
      passed: finalGrade === "A" || finalGrade === "B",
      decisionDelta: naiveLeader.strategy.mode === selected.strategy.mode
        ? `Rejim ve dönem dışı test, ilk sıradaki ${selected.strategy.label} modelini korudu.`
        : `Geçmiş puanın lideri ${naiveLeader.strategy.label} iken rejim ve dönem dışı test ${selected.strategy.label} modelini öne aldı.`,
    };
    selected.validation = selectedValidation;
    selected.challenger = {
      id: challenger.strategy.mode,
      label: challenger.strategy.label,
      score: challenger.v3SelectionScore,
      gap: Math.max(0, selected.v3SelectionScore - challenger.v3SelectionScore),
      decision: challenger.decision,
    };
    selected.regime = regime;
    selected.estimatedProbability = selectedValidation.calibratedProbability;
    selected.probabilityLabel = selectedValidation.evidenceGrade === "A" ? "Yüksek kanıt" : selectedValidation.evidenceGrade === "B" ? "Orta kanıt" : "Düşük kanıt";
    selected.agents = [
      ...selected.agents,
      { name: "Walk-forward Denetçisi", status: selectedValidation.passed ? "Geçti" : "Reddetti", score: selectedValidation.stabilityPct, detail: `${selectedValidation.foldCount} dönem, ${selectedValidation.oos.trades} dönem dışı işlem, kanıt ${selectedValidation.evidenceGrade}.` },
      { name: "Aşırı Uyum Denetçisi", status: selectedValidation.overfitRisk, score: selectedValidation.pbo.available ? 100 - selectedValidation.pbo.value * 100 : 0, detail: selectedValidation.pbo.available ? `PBO yaklaşık %${(selectedValidation.pbo.value * 100).toFixed(1)}; Deflated Sharpe ${selectedValidation.selectedDeflatedSharpe.available ? `%${(selectedValidation.selectedDeflatedSharpe.probability * 100).toFixed(1)}` : "hesaplanamadı"}.` : "Test dilimi yetersiz." },
    ];
    return {
      selected,
      challenger: selected.challenger,
      regime,
      validation: selectedValidation,
      strategies: analyses.map((analysis) => ({
        id: analysis.strategy.mode,
        label: analysis.strategy.label,
        decision: analysis.decision,
        setupScore: analysis.setupScore,
        threshold: analysis.strategy.threshold,
        regime: analysis.strategy.regime,
        selectionScore: analysis.v3SelectionScore,
        regimeCompatibility: analysis.regimeCompatibility,
        validation: analysis.validationSummary,
        trades: analysis.backtest.totalTrades,
        profitFactor: analysis.backtest.profitFactor,
        expectancyR: analysis.backtest.expectancyR,
        recentExpectancyR: analysis.backtest.recentExpectancyR,
      })),
    };
  }

  return { STRATEGY_LIBRARY, parseCsv, analyze, analyzeStrategies, strategySetup, riskPlan, wilsonInterval, featureMatrix, backtest, trainLocalModel, analogForecast, monteCarloStress, classifyRegime, regimeCompatibility, chronologicalValidation, deflatedSharpeApproximation, aggregateRows, timeframeTrend, multiTimeframeAnalysis, assessDataHealth, conservativeEvidenceGrade };
});
