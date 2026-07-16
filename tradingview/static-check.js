const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const directory = __dirname;
const strategyPath = path.join(directory, "FinPilot_Adaptive_Agent_v1.pine");
const scannerPath = path.join(directory, "FinPilot_Watchlist_Scanner_v1.pine");

function source(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function codeOnly(text) {
  return text
    .split("\n")
    .map((line) => {
      let output = "";
      let quoted = false;
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const next = line[index + 1];
        if (!quoted && character === "/" && next === "/") break;
        if (quoted) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') quoted = false;
          output += " ";
        } else if (character === '"') {
          quoted = true;
          output += " ";
        } else {
          output += character;
        }
      }
      assert.equal(quoted, false, `Kapanmayan metin: ${line}`);
      return output;
    })
    .join("\n");
}

function assertBalanced(text, label) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const closing = new Set(Object.values(pairs));
  const stack = [];
  for (const character of codeOnly(text)) {
    if (pairs[character]) stack.push(character);
    else if (closing.has(character)) {
      const opening = stack.pop();
      assert.equal(pairs[opening], character, `${label}: dengesiz ${character}`);
    }
  }
  assert.deepEqual(stack, [], `${label}: kapanmayan ayirac`);
}

const strategy = source(strategyPath);
const scanner = source(scannerPath);
const strategyCode = codeOnly(strategy);
const scannerCode = codeOnly(scanner);

for (const [label, text] of [["Strateji", strategy], ["Tarayici", scanner]]) {
  assert.match(text, /^\/\/@version=6/m, `${label}: Pine v6 eksik`);
  assertBalanced(text, label);
  const lookaheadLines = codeOnly(text).split("\n").filter((line) => line.includes("barmerge.lookahead_on"));
  assert.ok(lookaheadLines.length > 0, `${label}: kapanmis HTF teyidi eksik`);
  lookaheadLines.forEach((line) => assert.match(line, /\[1\]/, `${label}: ofsetsiz lookahead_on kullanimi`));
}

assert.match(strategyCode, /strategy\s*\(/);
assert.match(strategyCode, /strategy\.entry\s*\(/);
assert.match(strategyCode, /strategy\.exit\s*\(/);
assert.match(strategyCode, /strategy\.close_all\s*\(/);
assert.match(strategyCode, /request\.financial\s*\(/);
assert.match(strategyCode, /commission_value\s*=/);
assert.match(strategyCode, /maxDailyLoss/);
assert.match(strategyCode, /maxDrawdown/);
assert.match(strategyCode, /lossStreak/);
assert.match(strategyCode, /alert_message\s*=/);
assert.match(strategy, /Stop tetik \/ limit/);
assert.match(strategy, /Chrome panelinde/);
assert.match(strategy, /KAP yok · garanti yok/);

assert.match(scannerCode, /indicator\s*\(/);
const requests = scannerCode.match(/request\.[a-zA-Z_]+\s*\(/g) || [];
const plots = scannerCode.match(/\bplot\s*\(/g) || [];
assert.equal(requests.length, 5, "Tarayici tam bes request.* cagrisi kullanmali");
assert.ok(plots.length <= 10, "Tarayici en fazla on plot kullanmali");
assert.match(scannerCode, /alertcondition\s*\(/);
assert.match(scanner, /YATIR ön adayı/);

console.log(`FinPilot Pine static checks: OK (${requests.length} request, ${plots.length} plot)`);
