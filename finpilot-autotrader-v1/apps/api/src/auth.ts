import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "./env.js";

interface Session {
  csrfToken: string;
  expiresAt: number;
}

export class SessionAuth {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly env: AppEnv) {}

  login(password: string, response: Response): { csrfToken: string } | null {
    if (!safeEqual(password, this.env.ADMIN_PASSWORD)) return null;
    const id = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    this.sessions.set(id, { csrfToken, expiresAt });
    const signed = `${id}.${this.sign(id)}`;
    response.cookie("finpilot_session", signed, {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/"
    });
    return { csrfToken };
  }

  logout(request: Request, response: Response): void {
    const id = this.sessionId(request);
    if (id) this.sessions.delete(id);
    response.clearCookie("finpilot_session", { path: "/", sameSite: "strict" });
  }

  authorizeWebSocket(cookieHeader: string | undefined, remoteAddress: string | undefined): boolean {
    if (this.env.ALLOW_LOCAL_PAPER_NO_AUTH && this.env.TRADING_MODE === "PAPER" && isLoopback(remoteAddress ?? "")) return true;
    const cookies = Object.fromEntries((cookieHeader ?? "").split(";").map((item) => {
      const separator = item.indexOf("=");
      return separator < 0 ? [item.trim(), ""] : [item.slice(0, separator).trim(), safeDecode(item.slice(separator + 1))];
    }));
    const id = this.verifiedSessionId(cookies.finpilot_session);
    if (!id) return false;
    const session = this.sessions.get(id);
    return Boolean(session && session.expiresAt >= Date.now());
  }

  readonly requireRead = (request: Request, response: Response, next: NextFunction): void => {
    if (this.allowUnauthenticatedLocalPaper(request)) return next();
    if (!this.validSession(request)) {
      response.status(401).json({ error: "Oturum gerekli" });
      return;
    }
    next();
  };

  readonly requireWrite = (request: Request, response: Response, next: NextFunction): void => {
    if (this.allowUnauthenticatedLocalPaper(request)) return next();
    const session = this.validSession(request);
    if (!session) {
      response.status(401).json({ error: "Oturum gerekli" });
      return;
    }
    const csrf = request.header("x-csrf-token") ?? "";
    if (!safeEqual(csrf, session.csrfToken)) {
      response.status(403).json({ error: "CSRF doğrulaması başarısız" });
      return;
    }
    next();
  };

  private validSession(request: Request): Session | null {
    const id = this.sessionId(request);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  private sessionId(request: Request): string | null {
    const value = request.cookies?.finpilot_session as string | undefined;
    return this.verifiedSessionId(value);
  }

  private verifiedSessionId(value: string | undefined): string | null {
    if (!value) return null;
    const separator = value.lastIndexOf(".");
    if (separator < 1) return null;
    const id = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    return safeEqual(signature, this.sign(id)) ? id : null;
  }

  private sign(id: string): string {
    return createHmac("sha256", this.env.SESSION_SECRET).update(id).digest("base64url");
  }

  private allowUnauthenticatedLocalPaper(request: Request): boolean {
    if (!this.env.ALLOW_LOCAL_PAPER_NO_AUTH || this.env.TRADING_MODE !== "PAPER") return false;
    const ip = request.socket.remoteAddress ?? "";
    return isLoopback(ip);
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
