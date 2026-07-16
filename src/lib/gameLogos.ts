// Game logo registry — admin uploads custom logos (stored as data URLs in
// localStorage) which override the default lucide icons on game cards.
// Cache-busting via a per-logo version/timestamp forces the UI to reload the
// image immediately after every admin update.
import { bus, Topics } from './bus';

const STORAGE_KEY = 'b4bet.gameLogos';

export type GameKey = 'crash' | 'mines' | 'wingo' | 'k3' | 'fived' | 'sunvsmoon' | 'trading' | 'aviator';

type LogoEntry = { url: string; version: number };

// Internal storage may be either the new object shape or a plain string
// (legacy format before cache-busting). We treat both gracefully on load.
type StoredLogoMap = Partial<Record<GameKey, LogoEntry | string>>;

function load(): StoredLogoMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredLogoMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const migrated: StoredLogoMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
        migrated[key as GameKey] = { url: val, version: Date.now() };
      } else if (val && typeof val === 'object' && 'url' in val) {
        migrated[key as GameKey] = val as LogoEntry;
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

function save(map: StoredLogoMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function bustCache(url: string, version: number): string {
  if (url.startsWith('data:')) return `${url}#v=${version}`;
  if (url.includes('?')) return `${url}&v=${version}`;
  return `${url}?v=${version}`;
}

class GameLogoStore {
  private logos: StoredLogoMap = load();

  get(key: GameKey): string | undefined {
    const entry = this.logos[key];
    if (!entry) return undefined;
    if (typeof entry === 'string') return bustCache(entry, Date.now());
    return bustCache(entry.url, entry.version);
  }

  all(): Partial<Record<GameKey, string>> {
    const out: Partial<Record<GameKey, string>> = {};
    for (const [key, entry] of Object.entries(this.logos)) {
      if (!entry) continue;
      if (typeof entry === 'string') {
        out[key as GameKey] = bustCache(entry, Date.now());
      } else {
        out[key as GameKey] = bustCache(entry.url, entry.version);
      }
    }
    return out;
  }

  set(key: GameKey, dataUrl: string) {
    this.logos = { ...this.logos, [key]: { url: dataUrl, version: Date.now() } };
    save(this.logos);
    bus.emit(Topics.GameLogos, this.all());
  }

  remove(key: GameKey) {
    const next = { ...this.logos };
    delete next[key];
    this.logos = next;
    save(this.logos);
    bus.emit(Topics.GameLogos, this.all());
  }
}

export const gameLogos = new GameLogoStore();
