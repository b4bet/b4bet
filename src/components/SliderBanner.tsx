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

export default function SliderBanner({ onSlideClick }: { onSlideClick: (i: number) => void }) {
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
    <div
      className="relative w-full overflow-hidden bg-slatepanel-900"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides track */}
      <div
        className="flex transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {useAdmin
          ? banners.map((b, i) => (
              <a
                key={i}
                href={b.linkUrl || '#'}
                onClick={(e) => { if (!b.linkUrl) e.preventDefault(); }}
                className="min-w-full h-40 sm:h-48 relative block bg-slatepanel-900 shrink-0"
              >
                <img
                  src={b.imageUrl}
                  alt={b.title || ''}
                  className="w-full h-full object-cover"
                />
              </a>
            ))
          : promoSlides.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  className="min-w-full h-40 sm:h-48 relative overflow-hidden bg-slatepanel-900 shrink-0"
                >
                  <div className={`absolute inset-0 bg-gradient-to-r ${s.gradient}`} />
                  <div className="relative z-10 h-full flex flex-col justify-center px-5 gap-1">
                    <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest ${s.accent}`}>
                      <Icon className="w-3 h-3" />
                      Promo
                    </div>
                    <div className="text-xl font-black text-white leading-tight">{s.title}</div>
                    <div className="text-xs text-slate-400 max-w-[220px]">{s.subtitle}</div>
                    <button
                      onClick={() => onSlideClick(i)}
                      className="btn-primary mt-3 px-4 py-2 text-sm self-start flex items-center gap-1"
                    >
                      {s.cta} <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
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
