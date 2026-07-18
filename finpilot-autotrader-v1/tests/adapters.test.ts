import { describe, expect, it } from "vitest";
import { EncryptedSecretVault, renderTemplate, validateTemplate } from "@finpilot/brokers";

describe("resmî şablon adaptörü", () => {
  it("yalnız izinli değişkenleri resmî şablona yerleştirir", () => {
    const template = { command: "{{side}}", instrument: "{{symbol}}", amount: "{{quantity}}", note: "FinPilot-{{clientOrderId}}" };
    validateTemplate(template);
    expect(renderTemplate(template, { side: "BUY", symbol: "ASELS", quantity: 5, clientOrderId: "abc" })).toEqual({ command: "BUY", instrument: "ASELS", amount: 5, note: "FinPilot-abc" });
  });

  it("uydurulmuş veya desteklenmeyen şablon alanını reddeder", () => {
    expect(() => validateTemplate({ side: "{{side}}", symbol: "{{symbol}}", quantity: "{{quantity}}", admin: "{{privateEndpoint}}" })).toThrow("desteklenmeyen");
  });

  it("sırları AES-GCM ile mühürler ve yanlış anahtarla açmaz", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const other = Buffer.alloc(32, 8).toString("base64");
    const vault = new EncryptedSecretVault(key);
    const sealed = vault.seal("sensitive-token");
    expect(sealed).not.toContain("sensitive-token");
    expect(vault.open(sealed)).toBe("sensitive-token");
    expect(() => new EncryptedSecretVault(other).open(sealed)).toThrow();
  });
});
