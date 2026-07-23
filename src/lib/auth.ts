import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SITE_SESSION_COOKIE = "site_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

type Scope = "admin" | "site";
export type AccountRole = "viewer" | "editor" | "modifier";

interface TokenPayload {
  scope: Scope;
  exp: number;
  accountId?: number;
  role?: AccountRole;
  name?: string; // 관리자(공용 비밀번호) 로그인 시 실제 입력한 사람 이름
}

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

// ---------- 개인별 계정 (아이디/비밀번호 + 조회/입력 권한) ----------

export interface UserAccount {
  id: number;
  username: string;
  display_name: string | null;
  role: AccountRole;
  active: number;
  created_at: string;
  updated_at: string;
}

const ACCOUNT_COLUMNS = "id, username, display_name, role, active, created_at, updated_at";

export function hasAnyAccount(): boolean {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as c FROM user_account").get() as { c: number };
  return row.c > 0;
}

export function listAccounts(): UserAccount[] {
  const db = getDb();
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM user_account ORDER BY username`)
    .all() as UserAccount[];
}

export function getAccountById(id: number): UserAccount | undefined {
  const db = getDb();
  return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM user_account WHERE id = ?`).get(id) as
    | UserAccount
    | undefined;
}

export function createAccount(
  username: string,
  password: string,
  role: AccountRole,
  displayName: string | null
): UserAccount {
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO user_account (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(username, displayName, hash, role);
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM user_account WHERE id = ?`)
    .get(info.lastInsertRowid) as UserAccount;
}

export function updateAccount(
  id: number,
  updates: { displayName?: string | null; role?: AccountRole; active?: boolean }
): UserAccount {
  const db = getDb();
  const current = db.prepare("SELECT * FROM user_account WHERE id = ?").get(id) as
    | (UserAccount & { password_hash: string })
    | undefined;
  if (!current) throw new Error("계정을 찾을 수 없습니다.");
  const displayName = updates.displayName !== undefined ? updates.displayName : current.display_name;
  const role = updates.role ?? current.role;
  const active = updates.active !== undefined ? (updates.active ? 1 : 0) : current.active;
  db.prepare(
    "UPDATE user_account SET display_name = ?, role = ?, active = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(displayName, role, active, id);
  return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM user_account WHERE id = ?`).get(id) as UserAccount;
}

export function resetAccountPassword(id: number, newPassword: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, 10);
  const info = db
    .prepare("UPDATE user_account SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hash, id);
  if (info.changes === 0) throw new Error("계정을 찾을 수 없습니다.");
}

export function verifyAccountLogin(
  username: string,
  password: string
): { id: number; role: AccountRole; displayName: string | null } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash, role, display_name, active FROM user_account WHERE username = ?")
    .get(username) as
    | { id: number; password_hash: string; role: AccountRole; display_name: string | null; active: number }
    | undefined;
  if (!row || !row.active) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, role: row.role, displayName: row.display_name };
}

// ---------- 세션 토큰 (관리자/개인계정 공용 서명 로직, scope로 구분) ----------

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function signPayload(payload: TokenPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

function decodeToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const { session_secret } = getAdminAuthRow();
  if (sign(payload, session_secret) !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenPayload;
    if (typeof parsed.exp !== "number" || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionToken(scope: "admin", name?: string): string {
  const { session_secret } = getAdminAuthRow();
  return signPayload({ scope, exp: Date.now() + SESSION_TTL_MS, name }, session_secret);
}

export function createUserSessionToken(accountId: number, role: AccountRole): string {
  const { session_secret } = getAdminAuthRow();
  return signPayload({ scope: "site", accountId, role, exp: Date.now() + SESSION_TTL_MS }, session_secret);
}

export function verifySessionToken(token: string | undefined | null, scope: Scope): boolean {
  return decodeToken(token)?.scope === scope;
}

export function getUserSession(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): { accountId: number; role: AccountRole } | null {
  const parsed = decodeToken(req.cookies.get(SITE_SESSION_COOKIE)?.value);
  if (!parsed || parsed.scope !== "site" || parsed.accountId == null || !parsed.role) return null;
  // 토큰 자체는 유효해도, 그 사이 관리자가 계정을 비활성화했다면 즉시 차단되도록
  // 매 요청마다 현재 활성 상태를 확인한다 (토큰 만료 전이라도 바로 로그아웃 효과).
  const db = getDb();
  const row = db.prepare("SELECT active FROM user_account WHERE id = ?").get(parsed.accountId) as
    | { active: number }
    | undefined;
  if (!row || !row.active) return null;
  return { accountId: parsed.accountId, role: parsed.role };
}

export function isAdminRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value, "admin");
}

// 관리자(공용 비밀번호)로 로그인할 때 입력한 실제 이름. 옛 토큰 등 이름이 없으면 null.
export function getAdminName(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  const parsed = decodeToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!parsed || parsed.scope !== "admin") return null;
  const name = parsed.name?.trim();
  return name ? name.slice(0, 40) : null;
}

export function isSiteRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  return getUserSession(req) !== null || isAdminRequest(req);
}

export function isEditorRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  if (isAdminRequest(req)) return true;
  const role = getUserSession(req)?.role;
  return role === "editor" || role === "modifier";
}

// "수정" 권한 계정(기존 기록의 수정/삭제까지 가능한 등급). 관리자(공용 비밀번호)는 별개 개념이라
// 여기 포함하지 않는다 — 관리자는 "승인/승인해제"만 담당하고, 승인되지 않은 기록의 수정/삭제
// 권한은 이 "수정" 등급 계정에게 있다.
export function isModifierRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  return getUserSession(req)?.role === "modifier";
}

interface LockableRecord {
  locked: number | boolean;
  approved_at?: string | null;
}

// 승인(잠금)된 기록은 관리자를 포함해 누구도 수정할 수 없다 (관리자가 승인해제해야 다시 가능).
export function canEditRecord(
  req: { cookies: { get(name: string): { value: string } | undefined } },
  row: LockableRecord
): boolean {
  if (row.locked) return false;
  return isAdminRequest(req) || isModifierRequest(req);
}

// 삭제는 수정보다 엄격하다: 승인된 적이 있는 기록은 해제되어도 "수정"등급 계정은 삭제할 수 없다
// (관리자는 승인 이력과 무관하게, 잠기지만 않았으면 삭제 가능).
export function canDeleteRecord(
  req: { cookies: { get(name: string): { value: string } | undefined } },
  row: LockableRecord
): boolean {
  if (row.locked) return false;
  if (isAdminRequest(req)) return true;
  if (!isModifierRequest(req)) return false;
  return !row.approved_at;
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
