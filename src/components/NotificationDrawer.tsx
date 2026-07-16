import { useNotifications } from '../lib/hooks';
import { store } from '../lib/store';
import { bus, Topics } from '../lib/bus';
import { X, CheckCircle2, AlertTriangle, Info, ShieldAlert } from 'lucide-react';

const kindIcon = {
  success: { icon: CheckCircle2, color: 'text-emeraldwin-400', bg: 'bg-emeraldwin-500/15 border-emeraldwin-500/40' },
  warn: { icon: AlertTriangle, color: 'text-amberx-400', bg: 'bg-amberx-500/15 border-amberx-500/40' },
  alert: { icon: ShieldAlert, color: 'text-coral-400', bg: 'bg-coral-500/15 border-coral-500/40' },
  info: { icon: Info, color: 'text-neon-300', bg: 'bg-neon-500/15 border-neon-500/40' },
} as const;

const CRASH_NOISE_RE = /(round\s*#|crash|multiplier|busted|bust point|cash ?out)/i;

export default function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const all = useNotifications();
  const notifications = all.filter((n) => !CRASH_NOISE_RE.test(n.title) && !CRASH_NOISE_RE.test(n.body));

  return (
    <>
      {open && <div className="fixed inset-0 z-50 bg-midnight-950/60 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-slatepanel-900 border-l border-borderline-900 transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-borderline-900">
          <h2 className="font-display font-bold text-lg text-white">Notifications</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => store.markAllRead()} className="text-xs font-semibold text-neon-300 hover:text-neon-200">Mark all read</button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center">
              <X className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto scrollbar-thin h-[calc(100%-65px)] p-3 space-y-2">
          {notifications.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No notifications</p>}
          {notifications.map((n) => {
            const k = kindIcon[n.kind];
            const Icon = k.icon;
            const isDeposit = /pending deposit|deposit request/i.test(n.title + ' ' + n.body);
            const onClick = isDeposit
              ? () => { bus.emit(Topics.AdminConfig + ':deeplink', { kind: 'deposit' }); onClose(); }
              : undefined;
            const cleaned = (n.body || '').replace(/^\s*(broadcast|system|alert)\s*[:\-–]\s*/i, '');
            const cleanedTitle = (n.title || '').replace(/^\s*(broadcast|system|alert)\s*[:\-–]\s*/i, '');
            return (
              <div
                key={n.id}
                onClick={onClick}
                className={`p-3 rounded-xl border ${k.bg} ${!n.read ? 'ring-1 ring-white/5' : 'opacity-70'} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-neon-400/40 transition-shadow' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${k.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{cleanedTitle}</p>
                    <p className="text-xs text-slate-300 mt-0.5">{cleaned}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{new Date(n.ts).toLocaleTimeString()}</p>
                    {isDeposit && <p className="text-[10px] text-neon-300 mt-1 font-semibold">Tap to open deposit panel →</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
