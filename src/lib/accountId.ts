// 6-digit numeric account ID (strictly 100000–999999) — uniqueness mocked locally.
const KEY = 'b4bet.accountId.v1';

export function generateAccountId(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function getOrCreateAccountId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^\d{6}$/.test(existing)) return existing;
  } catch { /* ignore */ }
  const id = generateAccountId();
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  return id;
}
