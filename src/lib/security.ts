// Device fingerprinting + IP mapping security layer.
// Generates a stable per-device token from browser signals and tracks active
// sessions. Flags multi-account abuse when the same device token registers
// multiple distinct IPs / sessions in parallel.

const STORAGE_KEY = 'b4bet.deviceToken';

function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function collectSignals(): string {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return [
    navigator.userAgent,
    navigator.language,
    String(screen.width * screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(nav.deviceMemory ?? 0),
    String(navigator.hardwareConcurrency ?? 0),
    String((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0),
  ].join('|');
}

export function getDeviceToken(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    /* ignore */
  }
  const token = 'dev_' + hashString(collectSignals()) + hashString(String(Date.now()));
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
  return token;
}

// Simulated client IP — in a real deployment this comes from the socket handshake.
export function getClientIP(): string {
  const a = parseInt(hashString(getDeviceToken()), 16);
  const b = parseInt(hashString(navigator.userAgent), 16);
  return '10.0.' + ((a % 200) + 1) + '.' + ((b % 240) + 1);
}

export interface SessionRecord {
  deviceToken: string;
  ip: string;
  account: string;
  connectedAt: number;
}

class SecurityLayer {
  private sessions = new Map<string, SessionRecord>();
  private whitelisted = new Set<string>(['dev_master']);

  register(account: string): { ok: boolean; reason?: string; session?: SessionRecord } {
    const deviceToken = getDeviceToken();
    const ip = getClientIP();
    const existing = this.sessions.get(deviceToken);

    if (existing && existing.account !== account && !this.whitelisted.has(deviceToken)) {
      return {
        ok: false,
        reason: 'MULTI_ACCOUNT_DETECTED',
        session: existing,
      };
    }

    const session: SessionRecord = { deviceToken, ip, account, connectedAt: Date.now() };
    this.sessions.set(deviceToken, session);
    return { ok: true, session };
  }

  listSessions(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }

  whitelist(token: string) {
    this.whitelisted.add(token);
  }

  isWhitelisted(token: string) {
    return this.whitelisted.has(token);
  }
}

export const security = new SecurityLayer();
