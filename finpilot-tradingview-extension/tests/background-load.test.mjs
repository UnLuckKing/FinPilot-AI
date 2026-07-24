import test from "node:test";
import assert from "node:assert/strict";

test("MV3 service worker loads with the declared Chrome APIs", async () => {
  const listeners = [];
  const event = { addListener(listener) { listeners.push(listener); } };
  globalThis.chrome = {
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    sidePanel: {
      setPanelBehavior: async () => {},
      setOptions: async () => {}
    },
    tabs: {
      onUpdated: event,
      onRemoved: event,
      query: async () => [],
      sendMessage: async () => ({})
    },
    alarms: {
      onAlarm: event,
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
  await import(`../background.js?test=${Date.now()}`);
  assert.ok(listeners.length >= 6);
  delete globalThis.chrome;
});
