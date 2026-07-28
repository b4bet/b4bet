// Game logos — fetched from Supabase games table + storage
// Admin uploads custom logos which override default Lucide icons on game cards.
// Falls back to base64 data URL if Supabase Storage upload fails.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';

export type GameKey = 'crash' | 'mines' | 'sunvsmoon' | 'trading' | 'aviator';

type LogoEntry = { url: string; version: number };

class GameLogoStore {
  private logos: Record<string, LogoEntry> = {};

  constructor() {
    this.syncFromSupabase();
  }

  private async syncFromSupabase() {
    try {
      const { data } = await supabase.from('games').select('slug, icon_url');
      if (data) {
        for (const g of data) {
          if (g.icon_url) {
            const cleanUrl = g.icon_url.split('?')[0];
            this.logos[g.slug] = { url: cleanUrl, version: Date.now() };
          }
        }
        bus.emit(Topics.GameLogos, this.all());
      }
    } catch { /* use empty */ }
  }

  all(): Partial<Record<GameKey, string>> {
    const out: Partial<Record<GameKey, string>> = {};
    for (const [key, entry] of Object.entries(this.logos)) {
      const url = entry.url.startsWith('data:')
        ? entry.url
        : `${entry.url}?v=${entry.version}`;
      out[key as GameKey] = url;
    }
    return out;
  }

  async uploadAndSet(key: GameKey, file: File): Promise<string | null> {
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${key}-${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('game-logos')
        .upload(path, file, { upsert: false, contentType: file.type });

      if (!storageError) {
        const { data: urlData } = supabase.storage.from('game-logos').getPublicUrl(path);
        const publicUrl = urlData?.publicUrl;
        if (publicUrl) {
          await this.set(key, publicUrl);
          return publicUrl;
        }
      }
    } catch {
      // fall through to base64
    }

    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        await this.set(key, dataUrl);
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async set(key: GameKey, iconUrl: string) {
    const baseUrl = iconUrl.startsWith('data:') ? iconUrl : iconUrl.split('?')[0];
    this.logos[key] = { url: baseUrl, version: Date.now() };
    supabase
      .from('games')
      .update({ icon_url: baseUrl })
      .eq('slug', key)
      .then(() => {})
      .catch(() => {});
    bus.emit(Topics.GameLogos, this.all());
  }

  async remove(key: GameKey) {
    delete this.logos[key];
    supabase
      .from('games')
      .update({ icon_url: null })
      .eq('slug', key)
      .then(() => {})
      .catch(() => {});
    bus.emit(Topics.GameLogos, this.all());
  }
}

export const gameLogos = new GameLogoStore();
