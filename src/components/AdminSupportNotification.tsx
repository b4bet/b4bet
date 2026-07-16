import { useEffect, useState } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cms } from '../lib/cms';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import { useStaffSession } from '../lib/cmsHooks';
import type { SupportTicket } from '../lib/cms';

export default function AdminSupportNotification() {
  const staffSession = useStaffSession();
  const tickets = useBus<SupportTicket[]>(Topics.Tickets, cms.tickets);
  const [visible, setVisible] = useState<SupportTicket | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    const unassigned = tickets.find(t => t.status === 'unassigned' && !t.acknowledged);
    if (unassigned && !visible) {
      setVisible(unassigned);
      setTimeLeft(60);
    }
  }, [tickets, visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setVisible(null);
          return 60;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[calc(100vw-2rem)] max-w-xs sm:max-w-[280px]">
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-xl overflow-hidden animate-slide-up">
        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-2 flex-1">
              <AlertCircle className="w-5 h-5 text-coral-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">New Support Ticket</p>
                <p className="text-xs text-slate-400">From user</p>
              </div>
            </div>
            <button onClick={() => setVisible(null)} className="w-6 h-6 rounded-lg hover:bg-slatepanel-800 grid place-items-center flex-shrink-0">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="bg-midnight-850 rounded-lg p-2.5 border border-borderline-900">
            <p className="text-xs text-slate-300 line-clamp-2">{visible.messages?.[0]?.body || 'Support message'}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (staffSession) cms.claimTicket(visible.id, staffSession);
                setVisible(null);
              }}
              className="flex-1 btn-emerald py-2 px-2 text-xs font-semibold flex items-center justify-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Accept
            </button>
            <button
              onClick={() => {
                cms.closeTicket(visible.id);
                setVisible(null);
              }}
              className="flex-1 btn-coral py-2 px-2 text-xs font-semibold flex items-center justify-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>

          <div className="text-[10px] text-slate-500 text-center">
            Auto-dismiss in {timeLeft}s
          </div>
        </div>
      </div>
    </div>
  );
}
