import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { bus } from '../../lib/bus';
import { Save, Globe } from 'lucide-react';

const PLATFORMS = [
  {
    key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourpage',
    bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
    svg: '<svg viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
  },
  {
    key: 'twitter', label: 'X (Twitter)', placeholder: 'https://x.com/yourprofile',
    bg: '#000000',
    svg: '<svg viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  },
  {
    key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/yourchannel',
    bg: '#229ED9',
    svg: '<svg viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  },
  {
    key: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/yourprofile',
    bg: '#E60023',
    svg: '<svg viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>',
  },
  {
    key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel',
    bg: '#FF0000',
    svg: '<svg viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  },
  {
    key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/91XXXXXXXXXX',
    bg: '#25D366',
    svg: '<svg viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
  },
];

type LinkEntry = { url: string; enabled: boolean };
type LinksState = Record<string, LinkEntry>;

export default function SocialLinksTab() {
  const [links, setLinks] = useState<LinksState>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.rpc('admin_get_settings').then(({ data }) => {
      const rows = (data ?? []) as { key: string; value: unknown }[];
      const row = rows.find(r => r.key === 'social_links');
      if (row?.value) setLinks(row.value as LinksState);
      else {
        // Init defaults
        const defaults: LinksState = {};
        PLATFORMS.forEach(p => { defaults[p.key] = { url: '', enabled: false }; });
        setLinks(defaults);
      }
    });
  }, []);

  const toggle = (key: string) => {
    setLinks(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key]?.enabled } }));
  };

  const setUrl = (key: string, url: string) => {
    setLinks(prev => ({ ...prev, [key]: { ...prev[key], url } }));
  };

  async function save() {
    setSaving(true);
    await supabase.rpc('admin_update_setting', { p_key: 'social_links', p_value: links });
    bus.emit('social_links:updated', links);
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Social Media Links</h2>
          <p className="text-slate-500 text-sm">Enable links to show social icons in the app menu</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-neon-500 hover:bg-neon-600 text-white font-bold rounded-xl transition disabled:opacity-50 text-sm">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Preview row */}
      <div className="bg-slatepanel-800 border border-borderline-900 rounded-2xl p-4">
        <p className="text-xs text-slate-500 mb-3">Preview (active links):</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.filter(p => links[p.key]?.enabled && links[p.key]?.url).map(p => (
            <div key={p.key}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: p.bg }}
              title={p.label}
              dangerouslySetInnerHTML={{ __html: `<span style="width:18px;height:18px;display:flex;align-items:center;justify-content:center">${p.svg}</span>` }}
            />
          ))}
          {!PLATFORMS.some(p => links[p.key]?.enabled && links[p.key]?.url) && (
            <span className="text-slate-500 text-xs">No active links yet</span>
          )}
        </div>
      </div>

      {/* Platform rows */}
      <div className="space-y-3">
        {PLATFORMS.map(p => (
          <div key={p.key} className="bg-slatepanel-800 border border-borderline-900 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              {/* Brand icon */}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: p.bg }}
                dangerouslySetInnerHTML={{ __html: `<span style="width:20px;height:20px;display:flex;align-items:center;justify-content:center">${p.svg}</span>` }}
              />
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">{p.label}</p>
              </div>
              {/* Toggle */}
              <button onClick={() => toggle(p.key)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  links[p.key]?.enabled ? 'bg-neon-500' : 'bg-slatepanel-600'
                }`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  links[p.key]?.enabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="url"
                value={links[p.key]?.url ?? ''}
                onChange={e => setUrl(p.key, e.target.value)}
                placeholder={p.placeholder}
                className="flex-1 bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
