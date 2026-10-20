import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { type NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "trao_session";
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Use SESSION_SECRET from environment or generate a stable fallback for dev
const SECRET = process.env.SESSION_SECRET || "trao-default-secret-change-in-production-min-32-chars";

export interface SessionPayload {
  userId: string;
  iat: number;
  exp: number;
}

export function signToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [data, signature] = parts;
    const expectedSignature = createHmac("sha256", SECRET)
      .update(data)
      .digest("base64url");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    );

    if (!payload.userId || !payload.exp || Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    userId,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  });
}

export function getSessionFromRequest(request: NextRequest): { userId: string } | null {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return null;

  const payload = verifyToken(cookie.value);
  if (!payload) return null;

  return { userId: payload.userId };
}

export function getSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`;
}

export function getClearSessionCookieHeader(): string {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
