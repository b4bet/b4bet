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
    if (cms.claimTicket(id, sessionId)) setOpenTicketId(id);
  };

  // Auto-close window if ticket was closed elsewhere
  useEffect(() => {
    if (openTicketId && !tickets.some((t) => t.id === openTicketId)) setOpenTicketId(null);
  }, [tickets, openTicketId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><Headphones className="w-5 h-5 text-neon-300" /> Live Support Tickets</h2>
          <p className="text-xs text-slate-500">{isManager ? 'Manager view — all tickets visible.' : 'Agent view — unassigned and your claimed tickets only.'}</p>
        </div>
        {isManager && (
          <span className="chip bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> Manager
          </span>
        )}
      </div>

      <Section title="Unassigned Queue" badge={unassigned.length} accent="text-coral-300">
        {unassigned.length === 0 ? <Empty msg="No new tickets waiting." /> : unassigned.map((t) => (
          <Row key={t.id} accountId={t.accountId} preview={lastBody(t.messages)}>
            <button onClick={() => claim(t.id)} className="btn-primary px-3 py-1.5 text-xs">
              <Lock className="w-3.5 h-3.5" /> Claim Ticket
            </button>
          </Row>
        ))}
      </Section>

      <Section title="My Active Tickets" badge={mine.length} accent="text-emeraldwin-300">
        {mine.length === 0 ? <Empty msg="You haven't claimed any tickets yet." /> : mine.map((t) => (
          <Row key={t.id} accountId={t.accountId} preview={lastBody(t.messages)}>
            <button onClick={() => setOpenTicketId(t.id)} className="btn-primary px-3 py-1.5 text-xs">
              <MessageSquare className="w-3.5 h-3.5" /> Open
            </button>
          </Row>
        ))}
      </Section>

      {isManager && (
        <Section title="Assigned to other agents" badge={othersAssigned.length} accent="text-slate-400">
          {othersAssigned.length === 0 ? <Empty msg="None." /> : othersAssigned.map((t) => {
            const assignee = staff.find((s) => s.id === t.assignedStaffId);
            return (
              <Row key={t.id} accountId={t.accountId} preview={lastBody(t.messages)}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{assignee?.name ?? 'Unknown'}</span>
                  <button onClick={() => setOpenTicketId(t.id)} className="btn-primary px-3 py-1.5 text-xs">
                    <Eye className="w-3.5 h-3.5" /> Monitor
                  </button>
                </div>
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

function Section({ title, badge, accent, children }: { title: string; badge: number; accent: string; children: any }) {
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-display font-bold text-sm ${accent}`}>{title}</h3>
        <span className="chip bg-midnight-850 border border-borderline-900 text-slate-300 text-[10px]">{badge}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ accountId, preview, children }: { accountId: string; preview: string; children: any }) {
  return (
    <div className="bg-midnight-850 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white">#{accountId}</div>
        <div className="text-[11px] text-slate-500 truncate">{preview}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) { return <p className="text-xs text-slate-500">{msg}</p>; }
