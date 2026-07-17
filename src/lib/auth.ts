import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

interface AuthRow {
  password_hash: string | null;
  session_secret: string;
}

function getAuthRow(): AuthRow {
  const db = getDb();
  return db
    .prepare("SELECT password_hash, session_secret FROM admin_auth WHERE id = 1")
    .get() as AuthRow;
}

export function hasAdminPassword(): boolean {
  return getAuthRow().password_hash != null;
}

export function setAdminPassword(password: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE admin_auth SET password_hash = ?, updated_at = datetime('now') WHERE id = 1").run(
    hash
  );
}

export function verifyAdminPassword(password: string): boolean {
  const row = getAuthRow();
  if (!row.password_hash) return false;
  return bcrypt.compareSync(password, row.password_hash);
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(): string {
  const { session_secret } = getAuthRow();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString(
    "base64url"
  );
  return `${payload}.${sign(payload, session_secret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const { session_secret } = getAuthRow();
  if (sign(payload, session_secret) !== sig) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export const ADMIN_SESSION_COOKIE = SESSION_COOKIE;

export function isAdminRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): boolean {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}
