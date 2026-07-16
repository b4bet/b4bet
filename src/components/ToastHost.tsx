import { useEffect, useState } from 'react';
import { bus, Topics } from '../lib/bus';
import type { ToastEvent } from '../lib/cms';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

interface ActiveToast extends ToastEvent {}

/**
 * Global toast host. Listens to Topics.Toast events from the bus and renders
 * floating notification banners that auto-dismiss after exactly 3 seconds.
 */
export default function ToastHost() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    return bus.on(Topics.Toast, (payload) => {
      const t = payload as ToastEvent;
      setToasts((cur) => [...cur, t]);
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
      }, 3000);
    });
  }, []);

  const dismiss = (id: string) => setToasts((cur) => cur.filter((t) => t.id !== id));

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none">
      {toasts.map((t) => {
        const accent =
          t.kind === 'success' ? 'border-emeraldwin-500/50 text-emeraldwin-300' :
          t.kind === 'warn' ? 'border-amberx-500/50 text-amberx-300' :
          t.kind === 'alert' ? 'border-coral-500/50 text-coral-300' :
          'border-neon-500/50 text-neon-300';
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'alert' || t.kind === 'warn' ? AlertTriangle : Info;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto panel border ${accent} bg-midnight-900/95 backdrop-blur-xl px-4 py-3 flex items-start gap-3 animate-fade-in shadow-xl`}
          >
            <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white truncate">{t.title}</div>
              <div className="text-xs text-slate-400 mt-0.5">{t.body}</div>
            </div>
            <button onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
