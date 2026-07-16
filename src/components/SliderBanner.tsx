import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowRight, Sparkles, Trophy, Gift } from 'lucide-react';
import { useBanners } from '../lib/cmsHooks';

const promoSlides = [
  {
    title: 'Welcome Bonus',
    subtitle: 'Get up to ₹15,000 on your first deposit',
    cta: 'Claim Now',
    icon: Gift,
    gradient: 'from-neon-500/30 via-neon-600/10 to-transparent',
    accent: 'text-neon-300',
  },
  {
    title: 'Crash Champions',
    subtitle: 'Top multipliers win weekly leaderboard prizes',
    cta: 'Play Crash',
    icon: Trophy,
    gradient: 'from-emeraldwin-500/25 via-emeraldwin-600/10 to-transparent',
    accent: 'text-emeraldwin-400',
  },
  {
    title: 'Mines Mania',
    subtitle: 'Clear the grid for massive gem multipliers',
    cta: 'Play Mines',
    icon: Sparkles,
    gradient: 'from-coral-500/25 via-coral-600/10 to-transparent',
    accent: 'text-coral-400',
  },
];

export default function SliderBanner({ onCta }: { onCta: (i: number) => void }) {
  const banners = useBanners();
  const useAdmin = banners.length > 0;
  const count = useAdmin ? banners.length : promoSlides.length;
  const [idx, setIdx] = useState(0);

  const next = useCallback(() => setIdx((i) => (i + 1) % count), [count]);

  useEffect(() => {
    setIdx((i) => (i >= count ? 0 : i));
  }, [count]);

  useEffect(() => {
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [next]);

  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const handleTouchEnd = () => {
    if (touchStartX.current === null) return;
    const dx = touchDeltaX.current;
    if (Math.abs(dx) > 40) {
      setIdx((i) => (dx < 0 ? (i + 1) % count : (i - 1 + count) % count));
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-borderline-900" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {useAdmin
          ? banners.map((b) => (
              <a
                key={b.id}
                href={b.linkUrl || '#'}
                target={b.linkUrl ? '_blank' : undefined}
                rel="noreferrer"
                onClick={(e) => { if (!b.linkUrl) e.preventDefault(); }}
                className="min-w-full h-40 sm:h-48 relative block bg-slatepanel-900"
              >
                <img src={b.imageDataUrl} alt="Banner" className="w-full h-full object-cover" />
              </a>
            ))
          : promoSlides.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="min-w-full h-40 sm:h-48 relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient}`} />
                  <div className="absolute inset-0 bg-slatepanel-900" />
                  <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient}`} />
                  <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-neon-500/10 blur-2xl" />
                  <div className="relative h-full flex items-center justify-between px-5 sm:px-7">
                    <div className="max-w-[70%]">
                      <div className={`inline-flex items-center gap-1.5 chip bg-midnight-900/60 border border-borderline-900 ${s.accent} mb-2`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span className="uppercase tracking-wider text-[10px]">Promo</span>
                      </div>
                      <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white leading-tight">{s.title}</h2>
                      <p className="text-sm text-slate-300 mt-1">{s.subtitle}</p>
                      <button onClick={() => onCta(i)} className="btn-primary mt-3 px-4 py-2 text-sm">
                        {s.cta} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className={`hidden sm:grid place-items-center w-20 h-20 rounded-2xl bg-midnight-900/60 border border-borderline-900 ${s.accent}`}>
                      <Icon className="w-10 h-10" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-neon-400' : 'w-1.5 bg-slate-600'}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
