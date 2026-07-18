import { useState, useEffect, useRef } from 'react';
import { bus } from '../lib/bus';
import { auth } from '../lib/auth';

const GAMES = [
  { name: 'Aviator', emoji: '✈️', desc: 'Fly high, cash out before crash!', color: 'from-red-900/40 to-orange-900/40', badge: 'TRENDING' },
  { name: 'Wingo', emoji: '🎡', desc: 'Predict colors, win big.', color: 'from-neon-900/40 to-cyan-900/40', badge: 'POPULAR' },
  { name: 'Crash', emoji: '🚀', desc: 'Multiplier climbs until it crashes.', color: 'from-purple-900/40 to-indigo-900/40', badge: 'HOT' },
  { name: 'Mines', emoji: '💣', desc: 'Navigate the minefield for rewards.', color: 'from-amber-900/40 to-yellow-900/40', badge: 'NEW' },
  { name: 'K3', emoji: '🎲', desc: 'Three dice, infinite possibilities.', color: 'from-blue-900/40 to-teal-900/40', badge: '' },
  { name: '5D Lottery', emoji: '🎟️', desc: 'Five digits, one lucky winner.', color: 'from-pink-900/40 to-rose-900/40', badge: '' },
  { name: 'Trading', emoji: '📈', desc: 'Trade crypto-style predictions.', color: 'from-green-900/40 to-emerald-900/40', badge: '' },
  { name: 'Sun vs Moon', emoji: '☀️', desc: 'Classic dual-side betting.', color: 'from-orange-900/40 to-amber-900/40', badge: '' },
];

const FEATURES = [
  { icon: '🔒', title: 'Bank-Grade Security', desc: 'All transactions secured with end-to-end encryption. Your funds are always safe.' },
  { icon: '⚡', title: 'Instant Deposits', desc: 'Deposit via UPI, IMPS, NEFT instantly. Funds credited within seconds.' },
  { icon: '💸', title: 'Fast Withdrawals', desc: 'Withdraw to your UPI or bank. Most processed within 2 hours.' },
  { icon: '🎁', title: 'Welcome Bonus', desc: 'Get bonus on your first deposit. Plus daily bonuses and promotions.' },
  { icon: '📞', title: '24/7 Support', desc: 'Live chat support available around the clock. We\'re always here to help.' },
  { icon: '🏆', title: 'VIP Program', desc: 'Unlock exclusive rewards, higher limits and personal managers as you level up.' },
];

const STATS = [
  { value: '10L+', label: 'Happy Players' },
  { value: '₹50Cr+', label: 'Paid Out' },
  { value: '8', label: 'Live Games' },
  { value: '24/7', label: 'Support' },
];

interface Props { onNavigate: (r: string) => void; }

export default function LandingPage({ onNavigate }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [count, setCount] = useState({ players: 0, paid: 0 });
  const isLoggedIn = !!auth.getSession();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animated counters
  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const duration = 1800;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount({ players: Math.floor(ease * 1000000), paid: Math.floor(ease * 500000000) });
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const openAuth = (mode: 'login' | 'signup') => bus.emit('auth:open_modal', mode);

  return (
    <div className="min-h-screen bg-[#050a14] text-white">
      {/* Sticky Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all ${
        scrolled ? 'bg-[#050a14]/95 backdrop-blur-md border-b border-white/5 shadow-2xl' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-neon-400 to-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-black font-black text-sm">B4</span>
            </div>
            <span className="font-black text-xl tracking-wide">B4BET</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#games" className="hover:text-white transition">Games</a>
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#affiliate" className="hover:text-white transition">Affiliate</a>
          </nav>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <button onClick={() => onNavigate('home')}
                className="px-4 py-2 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl text-sm transition">
                Play Now →
              </button>
            ) : (
              <>
                <button onClick={() => openAuth('login')}
                  className="px-4 py-2 text-slate-300 hover:text-white text-sm transition">Login</button>
                <button onClick={() => openAuth('signup')}
                  className="px-4 py-2 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl text-sm transition">
                  Join Free →
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-24 pb-20 px-4 overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-neon-500/10 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-t from-[#050a14] to-transparent" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-neon-500/10 border border-neon-500/30 rounded-full text-sm text-neon-300">
            🔥 India\'s Most Trusted Betting Platform
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-tight">
            Win Big with{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-400 to-cyan-400">B4BET</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Play Aviator, Crash, Wingo and 5+ more exciting games. Instant UPI deposits, fast withdrawals, and huge bonuses.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => openAuth('signup')}
              className="px-8 py-4 bg-gradient-to-r from-neon-500 to-cyan-500 text-black font-black text-lg rounded-2xl hover:shadow-lg hover:shadow-neon-500/25 transition-all">
              Start Playing Free →
            </button>
            {isLoggedIn && (
              <button onClick={() => onNavigate('home')}
                className="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition">
                Continue Playing
              </button>
            )}
          </div>
          {/* Live stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8">
            <div className="bg-white/5 rounded-2xl p-4">
              <div className="text-3xl font-black text-neon-400">{(count.players / 100000).toFixed(1)}L+</div>
              <div className="text-slate-400 text-sm">Happy Players</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4">
              <div className="text-3xl font-black text-neon-400">₹{Math.floor(count.paid / 10000000)}Cr+</div>
              <div className="text-slate-400 text-sm">Paid Out</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4">
              <div className="text-3xl font-black text-purple-400">8</div>
              <div className="text-slate-400 text-sm">Live Games</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4">
              <div className="text-3xl font-black text-amber-400">24/7</div>
              <div className="text-slate-400 text-sm">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-black mb-3">All Games</h2>
            <p className="text-slate-400">8 exciting games with provably fair results</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {GAMES.map(g => (
              <button key={g.name} onClick={() => isLoggedIn ? onNavigate(g.name.toLowerCase().replace(' ', '')) : openAuth('signup')}
                className={`relative bg-gradient-to-br ${g.color} border border-white/10 rounded-2xl p-5 text-left hover:border-neon-500/40 hover:shadow-lg transition-all group`}>
                {g.badge && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 bg-neon-500/20 text-neon-400 text-[10px] font-bold rounded-full">{g.badge}</span>
                )}
                <div className="text-3xl mb-3">{g.emoji}</div>
                <h3 className="font-bold text-sm mb-1">{g.name}</h3>
                <p className="text-slate-400 text-xs">{g.desc}</p>
                <div className="mt-3 text-neon-400 text-xs font-semibold group-hover:translate-x-1 transition-transform">Play Now →</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4 bg-white/2">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-black mb-3">Why B4Bet?</h2>
            <p className="text-slate-400">Trusted by lakhs of players across India</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-neon-500/20 transition">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Affiliate CTA */}
      <section id="affiliate" className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-neon-900/30 to-purple-900/30 border border-neon-500/20 rounded-3xl p-8 md:p-12 text-center space-y-6">
            <div className="text-5xl">💰</div>
            <h2 className="text-3xl md:text-4xl font-black">Earn With Our Affiliate Program</h2>
            <p className="text-slate-300 max-w-xl mx-auto">
              Earn up to <span className="text-neon-400 font-bold">₹500 CPA</span> per depositing player or{' '}
              <span className="text-purple-400 font-bold">10% RevShare</span> for lifetime. No cap, no limits.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div className="bg-slatepanel-800/60 rounded-xl p-3">
                <div className="text-neon-400 font-black text-lg">₹500</div>
                <div className="text-slate-400 text-xs">CPA Rate</div>
              </div>
              <div className="bg-slatepanel-800/60 rounded-xl p-3">
                <div className="text-purple-400 font-black text-lg">10%</div>
                <div className="text-slate-400 text-xs">RevShare</div>
              </div>
              <div className="bg-slatepanel-800/60 rounded-xl p-3">
                <div className="text-amber-400 font-black text-lg">∞</div>
                <div className="text-slate-400 text-xs">No Cap</div>
              </div>
            </div>
            <button onClick={() => onNavigate('affiliate')}
              className="px-8 py-4 bg-gradient-to-r from-neon-500 to-cyan-500 text-black font-black text-lg rounded-2xl hover:shadow-lg hover:shadow-neon-500/25 transition-all">
              Join Affiliate Program →
            </button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-4xl md:text-5xl font-black">
            Ready to Win?
          </h2>
          <p className="text-slate-400 text-lg">Join thousands of players winning daily on B4Bet.</p>
          <button onClick={() => openAuth('signup')}
            className="px-10 py-5 bg-gradient-to-r from-neon-500 to-cyan-500 text-black font-black text-xl rounded-2xl hover:shadow-xl hover:shadow-neon-500/30 transition-all">
            Create Free Account →
          </button>
          <p className="text-slate-500 text-sm">No deposit required to register. 18+ only. Play responsibly.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-neon-400 to-cyan-500 rounded flex items-center justify-center">
              <span className="text-black font-black text-[10px]">B4</span>
            </div>
            <span className="font-bold text-slate-400">B4BET</span>
          </div>
          <p>© {new Date().getFullYear()} B4Bet. All rights reserved. 18+ only. Gamble responsibly.</p>
          <div className="flex gap-4">
            <button onClick={() => onNavigate('home')} className="hover:text-white transition">Terms</button>
            <button onClick={() => onNavigate('home')} className="hover:text-white transition">Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
