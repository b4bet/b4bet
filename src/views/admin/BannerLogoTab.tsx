import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload, Link as LinkIcon, Sparkles, Type, Globe } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useBanners, useLogo, useTextLogo, useFavicon, readFileAsDataUrl } from '../../lib/cmsHooks';

export default function BannerLogoTab() {
  const banners = useBanners();
  const logo = useLogo();
  const textLogo = useTextLogo();
  const favicon = useFavicon();
  const logoInput = useRef<HTMLInputElement>(null);
  const textLogoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [newLink, setNewLink] = useState('');

  const onLogoPick = async (f: File | null) => {
    if (!f) return;
    cms.setLogo(await readFileAsDataUrl(f));
    cms.toast({ title: 'Website logo updated', body: 'Header logo replaced globally.', kind: 'success' });
  };

  const onTextLogoPick = async (f: File | null) => {
    if (!f) return;
    cms.setTextLogo(await readFileAsDataUrl(f));
    cms.toast({ title: 'Text logo updated', body: 'Brand text image replaced.', kind: 'success' });
  };

  const onFaviconPick = async (f: File | null) => {
    if (!f) return;
    cms.setFavicon(await readFileAsDataUrl(f));
    cms.toast({ title: 'Favicon updated', body: 'Browser tab icon refreshed.', kind: 'success' });
  };

  const onBannerPick = async (f: File | null) => {
    if (!f) return;
    cms.addBanner(await readFileAsDataUrl(f), newLink.trim());
    setNewLink('');
    cms.toast({ title: 'Banner added', body: 'Slider updated.', kind: 'success' });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Banner Slider & Logo Manager</h2>
        <p className="text-xs text-slate-500">Upload slider images with outbound links and replace the global website logo.</p>
      </div>

      {/* Logo manager */}
      <div className="panel p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-neon-300" />
          <h3 className="font-display font-bold text-white">Website Logo</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Icon logo */}
          <div className="rounded-xl border border-borderline-900 bg-midnight-850 p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Icon Logo</p>
            <div className="w-full h-24 rounded-lg bg-midnight-900 border border-borderline-900 grid place-items-center overflow-hidden mb-2">
              {logo ? <img src={logo} alt="logo" className="max-w-full max-h-full object-contain" /> : <span className="text-slate-500 text-xs">No logo</span>}
            </div>
            <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)} />
            <div className="flex gap-2">
              <button onClick={() => logoInput.current?.click()} className="btn-primary px-3 py-1.5 text-xs flex-1">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
              {logo && (
                <button onClick={() => cms.setLogo(null)} className="btn-ghost px-2 py-1.5 text-xs">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Text logo */}
          <div className="rounded-xl border border-borderline-900 bg-midnight-850 p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><Type className="w-3.5 h-3.5" /> Text Logo (image)</p>
            <div className="w-full h-24 rounded-lg bg-midnight-900 border border-borderline-900 grid place-items-center overflow-hidden mb-2">
              {textLogo ? <img src={textLogo} alt="text logo" className="max-w-full max-h-full object-contain" /> : <span className="text-slate-500 text-xs">No text logo</span>}
            </div>
            <input ref={textLogoInput} type="file" accept="image/*" hidden onChange={(e) => onTextLogoPick(e.target.files?.[0] ?? null)} />
            <div className="flex gap-2">
              <button onClick={() => textLogoInput.current?.click()} className="btn-primary px-3 py-1.5 text-xs flex-1">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
              {textLogo && (
                <button onClick={() => cms.setTextLogo(null)} className="btn-ghost px-2 py-1.5 text-xs">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Favicon */}
          <div className="rounded-xl border border-borderline-900 bg-midnight-850 p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Favicon</p>
            <div className="w-full h-24 rounded-lg bg-midnight-900 border border-borderline-900 grid place-items-center overflow-hidden mb-2">
              {favicon ? <img src={favicon} alt="favicon" className="w-12 h-12 object-contain" /> : <span className="text-slate-500 text-xs">Default</span>}
            </div>
            <input ref={faviconInput} type="file" accept="image/png,image/jpeg,image/x-icon,image/svg+xml" hidden onChange={(e) => onFaviconPick(e.target.files?.[0] ?? null)} />
            <div className="flex gap-2">
              <button onClick={() => faviconInput.current?.click()} className="btn-primary px-3 py-1.5 text-xs flex-1">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
              {favicon && (
                <button onClick={() => cms.setFavicon(null)} className="btn-ghost px-2 py-1.5 text-xs">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Banner manager */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-neon-300" />
          <h3 className="font-display font-bold text-white">Slider Banners</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="Destination URL (e.g. https://...)"
              className="input pl-9"
            />
          </div>
          <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(e) => onBannerPick(e.target.files?.[0] ?? null)} />
          <button onClick={() => bannerInput.current?.click()} className="btn-primary px-3 py-2 text-sm whitespace-nowrap">
            <Upload className="w-4 h-4" /> Upload Slide
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {banners.length === 0 && <div className="text-slate-500 text-sm">No banners yet.</div>}
          {banners.map((b) => (
            <div key={b.id} className="panel p-3 flex gap-3">
              <img src={b.imageDataUrl} alt="banner" className="w-28 h-20 object-cover rounded-lg border border-borderline-900" />
              <div className="flex-1 min-w-0">
                <input
                  value={b.linkUrl}
                  onChange={(e) => cms.updateBanner(b.id, { linkUrl: e.target.value })}
                  placeholder="https://..."
                  className="input text-xs py-1.5"
                />
                <div className="flex items-center justify-between mt-2">
                  <a href={b.linkUrl || '#'} target="_blank" rel="noreferrer" className="text-[10px] text-neon-300 underline truncate max-w-[160px]">
                    {b.linkUrl || '(no link)'}
                  </a>
                  <button onClick={() => cms.removeBanner(b.id)} className="text-coral-400 hover:text-coral-300 text-xs flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
