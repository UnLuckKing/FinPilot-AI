import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class EncryptedSecretVault {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) throw new Error("FINPILOT_MASTER_KEY base64 biçiminde 32 bayt olmalıdır");
  }

  seal(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
  }

  open(payload: string): string {
    const [version, ivValue, tagValue, encryptedValue] = payload.split(".");
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Şifreli sır biçimi geçersiz");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  }
}
