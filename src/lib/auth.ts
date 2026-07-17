import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb, getSetting, setSetting } from "@/lib/db";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SITE_SESSION_COOKIE = "site_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

type Scope = "admin" | "site";

interface AuthRow {
  password_hash: string | null;
  session_secret: string;
}

function getAdminAuthRow(): AuthRow {
  const db = getDb();
  return db
    .prepare("SELECT password_hash, session_secret FROM admin_auth WHERE id = 1")
    .get() as AuthRow;
}

// ---------- 관리자 비밀번호 ----------

export function hasAdminPassword(): boolean {
  return getAdminAuthRow().password_hash != null;
}

export function setAdminPassword(password: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE admin_auth SET password_hash = ?, updated_at = datetime('now') WHERE id = 1").run(
    hash
  );
}

export function verifyAdminPassword(password: string): boolean {
  const row = getAdminAuthRow();
  if (!row.password_hash) return false;
  return bcrypt.compareSync(password, row.password_hash);
}

// 서버 환경변수(ADMIN_RECOVERY_CODE)를 아는 사람만 비밀번호를 재설정할 수 있는 복구 수단
export function hasRecoveryCodeConfigured(): boolean {
  return !!process.env.ADMIN_RECOVERY_CODE;
}

export function verifyRecoveryCode(code: string): boolean {
  const expected = process.env.ADMIN_RECOVERY_CODE;
  if (!expected || code.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected));
}

// ---------- 현장(작업자) 공용 비밀번호 ----------

const SITE_PASSWORD_KEY = "site_password_hash";

export function hasSitePassword(): boolean {
  return getSetting(SITE_PASSWORD_KEY) != null;
}

export function setSitePassword(password: string): void {
  setSetting(SITE_PASSWORD_KEY, bcrypt.hashSync(password, 10));
}

export function verifySitePassword(password: string): boolean {
  const hash = getSetting(SITE_PASSWORD_KEY);
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

export function clearSitePassword(): void {
  setSetting(SITE_PASSWORD_KEY, "");
}

// ---------- 세션 토큰 (관리자/현장 공용 서명 로직, scope로 구분) ----------

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(scope: Scope): string {
  const { session_secret } = getAdminAuthRow();
  const payload = Buffer.from(JSON.stringify({ scope, exp: Date.now() + SESSION_TTL_MS })).toString(
    "base64url"
  );
  return `${payload}.${sign(payload, session_secret)}`;
}

export function verifySessionToken(token: string | undefined | null, scope: Scope): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const { session_secret } = getAdminAuthRow();
  if (sign(payload, session_secret) !== sig) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return parsed.scope === scope && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export function isAdminRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value, "admin");
}

export function isSiteRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  return (
    verifySessionToken(req.cookies.get(SITE_SESSION_COOKIE)?.value, "site") || isAdminRequest(req)
  );
}

// ---------- 로그인 시도 제한 (무차별 대입 방지) ----------

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5분
const attempts = new Map<string, { count: number; lockedUntil: number }>();

export function isLoginLocked(key: string): number {
  const rec = attempts.get(key);
  if (!rec) return 0;
  const remaining = rec.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function recordLoginFailure(key: string): void {
  const rec = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  attempts.set(key, rec);
}

export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}
