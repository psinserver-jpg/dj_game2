/**
 * Simple local player accounts: an ID + short password, no sign-up form.
 * The first time an ID is used it is registered; afterwards the password must match.
 * Everything lives in this browser's localStorage, so it is a convenience lock, not real security.
 */

const USERS_KEY = 'pulsebeat_users_v1';
const SESSION_KEY = 'pulsebeat_session_v1';

export const ID_RULE = /^[0-9A-Za-z가-힣_]{2,12}$/;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 20;

export interface UserAccount {
  key: string; // lower-cased ID, used as the storage key
  name: string; // ID as the player typed it
  passHash: string;
  createdAt: number;
  lastLoginAt: number;
  playCount: number;
}

export type LoginResult =
  | { ok: true; user: UserAccount; created: boolean }
  | { ok: false; error: string };

// cyrb53: small, fast string hash so the password is not stored as plain text
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const passHashFor = (key: string, password: string) => hash(`pulsebeat:${key}:${password}`);
export const toUserKey = (id: string) => id.trim().toLowerCase();

function readUsers(): Record<string, UserAccount> {
  try {
    const data = localStorage.getItem(USERS_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Ignore
  }
  return {};
}

function writeUsers(users: Record<string, UserAccount>) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    // Ignore
  }
}

export const userService = {
  getUsers(): Record<string, UserAccount> {
    return readUsers();
  },

  getUser(key: string): UserAccount | null {
    return readUsers()[key] ?? null;
  },

  /** Logged-in player, or null */
  getCurrentUser(): UserAccount | null {
    try {
      const key = localStorage.getItem(SESSION_KEY);
      return key ? readUsers()[key] ?? null : null;
    } catch {
      return null;
    }
  },

  /** IDs used on this device, most recent first (for quick pick in the login form) */
  getRecentIds(limit = 5): string[] {
    return Object.values(readUsers())
      .sort((a, b) => b.lastLoginAt - a.lastLoginAt)
      .slice(0, limit)
      .map((u) => u.name);
  },

  /** Log in with an existing ID, or register it on first use */
  login(id: string, password: string): LoginResult {
    const name = id.trim();
    if (!ID_RULE.test(name)) {
      return { ok: false, error: '아이디는 한글·영문·숫자·_ 로 2~12자여야 합니다.' };
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return { ok: false, error: `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.` };
    }

    const key = toUserKey(name);
    const users = readUsers();
    const existing = users[key];
    const now = Date.now();

    if (existing) {
      if (existing.passHash !== passHashFor(key, password)) {
        return { ok: false, error: '비밀번호가 맞지 않습니다. 이미 사용 중인 아이디라면 다른 아이디를 입력해 주세요.' };
      }
      existing.lastLoginAt = now;
      writeUsers(users);
      this.setSession(key);
      return { ok: true, user: existing, created: false };
    }

    const user: UserAccount = {
      key,
      name,
      passHash: passHashFor(key, password),
      createdAt: now,
      lastLoginAt: now,
      playCount: 0,
    };
    users[key] = user;
    writeUsers(users);
    this.setSession(key);
    return { ok: true, user, created: true };
  },

  setSession(key: string) {
    try {
      localStorage.setItem(SESSION_KEY, key);
    } catch {
      // Ignore
    }
  },

  logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore
    }
  },

  incrementPlayCount(key: string) {
    const users = readUsers();
    if (!users[key]) return;
    users[key].playCount += 1;
    writeUsers(users);
  },
};
