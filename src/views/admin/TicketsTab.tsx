import { useEffect, useState } from 'react';
import { Headphones, Lock, MessageSquare, Eye, ShieldCheck } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useTickets, useStaffSession, useStaff } from '../../lib/cmsHooks';
import TicketChatWindow from '../../components/TicketChatWindow';

export default function TicketsTab() {
  const tickets = useTickets();
  const sessionId = useStaffSession();
  const staff = useStaff();
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const me = staff.find((s) => s.id === sessionId) ?? null;
  const isManager = me?.isOwner === true || me?.permissions?.staff === true;

  // Manager sees ALL tickets; agents only see unassigned + their own
  const visibleTickets = isManager ? tickets : tickets.filter((t) =>
    t.status === 'unassigned' || t.assignedStaffId === sessionId
  );

  const unassigned = visibleTickets.filter((t) => t.status === 'unassigned');
  const mine = visibleTickets.filter((t) => t.status === 'assigned' && t.assignedStaffId === sessionId);
  const othersAssigned = isManager
    ? visibleTickets.filter((t) => t.status === 'assigned' && t.assignedStaffId !== sessionId)
    : [];

  const claim = (id: string) => {
    if (!sessionId) { cms.toast({ title: 'Sign in', body: 'Pick an operator session first.', kind: 'alert' }); return; }
    // assignTicket is the correct method — sets status='assigned' and assignedStaffId=staffId
    cms.assignTicket(id, sessionId);
    setOpenTicketId(id);
  };

  // Auto-close window if ticket was closed elsewhere
  useEffect(() => {
    if (openTicketId && !tickets.some((t) => t.id === openTicketId)) setOpenTicketId(null);
  }, [tickets, openTicketId]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Live Support Tickets</h2>
          <p className="text-xs text-slate-500">
            {isManager ? 'Manager view — all tickets visible.' : 'Agent view — unassigned and your claimed tickets only.'}
          </p>
        </div>
        {isManager && (
          <span className="chip bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Manager
          </span>
        )}
      </div>

      <Section title="Unassigned" badge={unassigned.length} accent="text-amberx-400">
        {unassigned.length === 0 ? <Empty msg="No unassigned tickets." /> : unassigned.map((t) => (
          <Row key={t.id} accountId={t.accountId} preview={lastBody(t.messages)}>
            <button onClick={() => claim(t.id)} className="btn-primary px-3 py-1.5 text-xs">
              Claim Ticket
            </button>
          </Row>
        ))}
      </Section>

      <Section title="My Tickets" badge={mine.length} accent="text-neon-400">
        {mine.length === 0 ? <Empty msg="No tickets assigned to you." /> : mine.map((t) => (
          <Row key={t.id} accountId={t.accountId} preview={lastBody(t.messages)}>
            <button onClick={() => setOpenTicketId(t.id)} className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Open
            </button>
          </Row>
        ))}
      </Section>

      {isManager && (
        <Section title="Others' Tickets" badge={othersAssigned.length} accent="text-slate-400">
          {othersAssigned.length === 0 ? <Empty msg="No other assigned tickets." /> : othersAssigned.map((t) => {
            const assignee = staff.find((s) => s.id === t.assignedStaffId);
            return (
              <Row key={t.id} accountId={t.accountId} preview={lastBody(t.messages)}>
                <span className="chip text-[10px] bg-slatepanel-800 text-slate-400 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> {assignee?.name ?? 'Unknown'}
                </span>
                <button onClick={() => setOpenTicketId(t.id)} className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Monitor
                </button>
              </Row>
            );
          })}
        </Section>
      )}

      {openTicketId && sessionId && (
        <TicketChatWindow ticketId={openTicketId} staffId={sessionId} onClose={() => setOpenTicketId(null)} />
      )}
    </div>
  );
}

function lastBody(messages: { body: string }[]) {
  return messages.length ? messages[messages.length - 1].body.slice(0, 80) : '';
}

function Section({ title, badge, accent, children }: { title: string; badge: number; accent: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className={`text-sm font-bold ${accent}`}>{title}</h3>
        <span className="chip text-[10px] bg-slatepanel-800 text-slate-400">{badge}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ accountId, preview, children }: { accountId: string; preview: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-slatepanel-800 border border-borderline-900 rounded-xl px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">#{accountId}</p>
        <p className="text-[11px] text-slate-500 truncate">{preview}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) { return <p className="text-xs text-slate-500 py-2">{msg}</p>; }
