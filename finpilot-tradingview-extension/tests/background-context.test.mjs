import test from "node:test";
import assert from "node:assert/strict";

test("active chart detection self-heals a missing content script", async () => {
  const noopEvent = { addListener() {} };
  let messageListener;
  let sendAttempts = 0;
  let injections = 0;
  const updates = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: noopEvent,
      onStartup: noopEvent,
      onMessage: { addListener(listener) { messageListener = listener; } }
    },
    sidePanel: {
      setPanelBehavior: async () => {},
      setOptions: async () => {}
    },
    tabs: {
      onUpdated: noopEvent,
      onRemoved: noopEvent,
      query: async () => [{
        id: 7,
        active: true,
        url: "https://tr.tradingview.com/chart/saved-layout/"
      }],
      sendMessage: async () => {
        sendAttempts += 1;
        if (sendAttempts === 1) throw new Error("Receiving end does not exist");
        return {
          context: {
            symbol: "BIST:BIMAS",
            timeframe: "15",
            source: "grafik başlığı",
            confidence: 91,
            detectedAt: new Date().toISOString()
          }
        };
      },
      update: async (tabId, update) => updates.push({ tabId, update })
    },
    scripting: {
      executeScript: async ({ target, files }) => {
        injections += 1;
        assert.equal(target.tabId, 7);
        assert.deepEqual(files, ["lib/detection-global.js", "content-script.js"]);
      }
    },
    alarms: {
      onAlarm: noopEvent,
      get: async () => null,
      create: async () => {}
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      }
    },
    notifications: { create: async () => {} }
  };

  await import(`../background.js?context-test=${Date.now()}`);
  const contextResponse = await invoke(messageListener, { action: "GET_ACTIVE_CONTEXT" });
  assert.equal(contextResponse.ok, true);
  assert.equal(contextResponse.context.symbol, "BIST:BIMAS");
  assert.equal(contextResponse.context.source, "grafik başlığı");
  assert.equal(injections, 1);
  assert.equal(sendAttempts, 2);

  const openResponse = await invoke(messageListener, { action: "OPEN_CHART_SYMBOL", symbol: "BIST:THYAO" });
  assert.equal(openResponse.ok, true);
  assert.equal(updates.length, 1);
  assert.match(updates[0].update.url, /symbol=BIST%3ATHYAO/u);
  delete globalThis.chrome;
});

function invoke(listener, message) {
  return new Promise((resolve) => {
    assert.equal(listener(message, {}, resolve), true);
  });
}
