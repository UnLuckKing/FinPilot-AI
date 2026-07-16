(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  function quantile(values, percentile) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const position = clamp(percentile, 0, 1) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
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
        scoreLong,
        scoreShort,
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
    return {
      available: true,
      horizon: bars,
      direction,
      probabilityUp,
      probabilityDown,
      probabilityFlat,
      expectedLowPct: quantile(returns, 0.20),
      expectedMedianPct: quantile(returns, 0.50),
      expectedHighPct: quantile(returns, 0.80),
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
    for (const sample of test) {
      const probability = predict(sample.x);
      if ((probability >= 0.5 ? 1 : 0) === sample.y) correct += 1;
      brier += (probability - sample.y) ** 2;
    }
    const latestProbability = predict(features[features.length - 1].vector) * 100;
    return {
      available: true,
      trainSamples: train.length,
      testSamples: test.length,
      outOfSampleAccuracy: test.length ? correct / test.length * 100 : 0,
      brierScore: test.length ? brier / test.length : 1,
      probabilityUp: latestProbability,
      probabilityDown: 100 - latestProbability,
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
        const longSetup = features[i].trend > 0 && features[i].scoreLong >= threshold;
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
            score: longSetup ? features[i].scoreLong : features[i].scoreShort,
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
    const features = featureMatrix(rows, settings);
    const backtestResult = backtest(rows, features, settings);
    const model = trainLocalModel(rows, features, settings);
    const forecastHorizons = Array.isArray(settings.forecastHorizons)
      ? [...new Set(settings.forecastHorizons.map((value) => Math.max(1, Math.floor(finite(value)))).filter(Number.isFinite))].slice(0, 4)
      : [1, 5, 20];
    const safeHorizons = forecastHorizons.length ? forecastHorizons : [1, 5, 20];
    const primaryHorizon = Math.max(1, Math.floor(finite(settings.primaryHorizon, safeHorizons.includes(5) ? 5 : safeHorizons[Math.min(1, safeHorizons.length - 1)])));
    const forecasts = safeHorizons.map((horizon) => analogForecast(rows, features, horizon, settings));
    const primaryForecast = forecasts.find((forecast) => forecast.horizon === primaryHorizon) || forecasts[0];
    const latest = features[features.length - 1];
    const minimumTrades = finite(settings.minimumTrades, 30);
    const backtestReady = backtestResult.totalTrades >= minimumTrades;
    let blendedProbability = model.available && backtestReady
      ? backtestResult.smoothedWinProbability * 0.62 + (latest.trend >= 0 ? model.probabilityUp : model.probabilityDown) * 0.38
      : backtestReady ? backtestResult.smoothedWinProbability : model.available ? (latest.trend >= 0 ? model.probabilityUp : model.probabilityDown) : 50;
    if (primaryForecast?.available) blendedProbability = blendedProbability * 0.68 + primaryForecast.probabilityUp * 0.32;
    const positiveEdge = backtestReady && backtestResult.profitFactor >= 1.15 && backtestResult.expectancyR > 0;
    const longCandidate = latest.trend > 0 && latest.scoreLong >= finite(settings.threshold, 62);
    const shortCandidate = Boolean(settings.allowShort) && latest.trend < 0 && latest.scoreShort >= finite(settings.threshold, 62);
    let decision = "BEKLE";
    if (!backtestReady) decision = "VERİ YETERSİZ";
    else if (!positiveEdge) decision = "İŞLEM YOK";
    else if (longCandidate) decision = "LONG ADAYI";
    else if (shortCandidate) decision = "SHORT ADAYI";
    const agents = [
      { name: "Trend Ajanı", status: latest.trend > 0 ? "Olumlu" : latest.trend < 0 ? "Olumsuz" : "Nötr", score: latest.trend > 0 ? 78 : latest.trend < 0 ? 22 : 50, detail: latest.trend > 0 ? "Hızlı ortalama yavaş ortalamanın üzerinde." : "Trend yapısı yükselişi doğrulamıyor." },
      { name: "Momentum Ajanı", status: latest.rsi >= 52 && latest.macdHistogram > 0 ? "Olumlu" : "Zayıf", score: clamp(50 + (latest.rsi - 50) * 1.2 + Math.sign(latest.macdHistogram) * 12, 0, 100), detail: `RSI ${latest.rsi.toFixed(1)}, MACD histogram ${latest.macdHistogram.toFixed(4)}.` },
      { name: "Hacim Ajanı", status: latest.volumeRatio >= 1 ? "Destekli" : "Zayıf", score: clamp(latest.volumeRatio * 55, 0, 100), detail: `Hacim, 20 mum ortalamasının ${latest.volumeRatio.toFixed(2)} katı.` },
      { name: "Backtest Denetçisi", status: positiveEdge ? "Geçti" : "Reddetti", score: clamp(backtestResult.profitFactor * 45, 0, 100), detail: `${backtestResult.totalTrades} işlem, PF ${Number.isFinite(backtestResult.profitFactor) ? backtestResult.profitFactor.toFixed(2) : "∞"}, beklenti ${backtestResult.expectancyR.toFixed(2)}R.` },
      { name: "ML Ajanı", status: model.available ? model.quality : "Veri yetersiz", score: model.available ? clamp(model.outOfSampleAccuracy, 0, 100) : 0, detail: model.available ? `Test doğruluğu %${model.outOfSampleAccuracy.toFixed(1)}, Brier ${model.brierScore.toFixed(3)}.` : model.reason },
      { name: "Yön Ajanı", status: primaryForecast?.available ? primaryForecast.direction : "Veri yetersiz", score: primaryForecast?.available ? primaryForecast.probabilityUp : 0, detail: primaryForecast?.available ? `${settings.primaryHorizonLabel || `${primaryHorizon} bar`}: yükseliş %${primaryForecast.probabilityUp.toFixed(1)}, düşüş %${primaryForecast.probabilityDown.toFixed(1)}, yatay %${primaryForecast.probabilityFlat.toFixed(1)}.` : primaryForecast?.reason },
      { name: "Stres Denetçisi", status: backtestResult.stress.available ? (backtestResult.stress.profitablePct >= 60 ? "Geçti" : "Zayıf") : "Veri yetersiz", score: backtestResult.stress.available ? backtestResult.stress.profitablePct : 0, detail: backtestResult.stress.available ? `${backtestResult.stress.iterations} Monte Carlo yolu; pozitif kapanış %${backtestResult.stress.profitablePct.toFixed(1)}, kötü %10 net ${backtestResult.stress.p10NetR.toFixed(2)}R.` : backtestResult.stress.reason },
    ];
    return {
      latest,
      backtest: backtestResult,
      model,
      forecasts,
      primaryHorizon,
      agents,
      decision,
      setupScore: Math.max(latest.scoreLong, latest.scoreShort),
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

  return { parseCsv, analyze, riskPlan, wilsonInterval, featureMatrix, backtest, trainLocalModel, analogForecast, monteCarloStress };
});
