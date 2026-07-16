import { useEffect, useRef, useState } from 'react';
import { X, Send, Paperclip, Headphones, FileText } from 'lucide-react';
import { getOrCreateAccountId } from '../lib/accountId';
import { readFileAsDataUrl, useTickets, markChatAsRead } from '../lib/cmsHooks';
import { cms } from '../lib/cms';
import type { TicketAttachment, TicketMessage } from '../lib/cms';

const STORE_KEY = 'b4bet.support.thread.v1';

interface Props { open: boolean; onClose: () => void; }

export default function SupportChat({ open, onClose }: Props) {
  const accountId = getOrCreateAccountId();
  const tickets = useTickets();
  const ticket = tickets.find((t) => t.accountId === accountId && t.status !== 'closed') ?? null;
  const messages: TicketMessage[] = ticket?.messages ?? [];

  const [text, setText] = useState('');
  const [pending, setPending] = useState<TicketAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // legacy local cache (kept for backward compat)
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(messages)); } catch { /* noop */ }
  }, [messages]);

  useEffect(() => {
    if (open) {
      markChatAsRead();
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages.length]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: TicketAttachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 5 * 1024 * 1024) continue;
      const data = await readFileAsDataUrl(f);
      if (f.type === 'application/pdf') next.push({ kind: 'pdf', dataUrl: data, name: f.name });
      else if (f.type === 'image/jpeg' || f.type === 'image/png') next.push({ kind: 'image', dataUrl: data, name: f.name });
    }
    setPending((p) => [...p, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = () => {
    if (!text.trim() && pending.length === 0) return;
    cms.postTicketMessage(accountId, text.trim(), pending.length ? pending : undefined);
    setText('');
    setPending([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-midnight-950">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-borderline-900 bg-slatepanel-900">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
          <Headphones className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-white leading-none">Support 24/7</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Ref ID #{accountId} · {ticket?.status === 'assigned' ? 'Agent connected' : ticket ? 'Waiting for agent…' : 'Send a message to start'}
          </p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
          <X className="w-4 h-4 text-slate-300" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-500 py-10">Say hi 👋 — our team is ready to help.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.role === 'user' ? 'bg-gradient-to-br from-neon-500 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-100'}`}>
              {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
              {m.attachments && (
                <div className="mt-2 space-y-1.5">
                  {m.attachments.map((a, i) =>
                    a.kind === 'image' ? (
                      <img key={i} src={a.dataUrl} alt={a.name} className="rounded-lg max-h-48 object-cover" />
                    ) : (
                      <a key={i} href={a.dataUrl} target="_blank" rel="noreferrer"
                         className="flex items-center gap-2 bg-midnight-850 border border-borderline-900 rounded-lg px-2 py-1.5 text-xs text-slate-200">
                        <FileText className="w-4 h-4" /> {a.name}
                      </a>
                    )
                  )}
                </div>
              )}
              <p className="text-[10px] opacity-60 mt-1">{new Date(m.ts).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="px-3 py-2 border-t border-borderline-900 bg-slatepanel-900 flex flex-wrap gap-2">
          {pending.map((p, i) => (
            <div key={i} className="chip bg-slatepanel-800 border border-borderline-900 text-slate-300 text-[11px]">
              {p.kind === 'image' ? '🖼' : '📄'} {p.name}
              <button onClick={() => setPending((q) => q.filter((_, j) => j !== i))} className="text-slate-500 hover:text-coral-400 ml-1"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <footer className="p-3 border-t border-borderline-900 bg-slatepanel-900 flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <button onClick={() => fileRef.current?.click()} className="w-10 h-10 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center flex-shrink-0">
          <Paperclip className="w-4 h-4 text-slate-300" />
        </button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type your message…"
          className="input resize-none max-h-32 py-2.5"
        />
        <button onClick={send} className="btn-primary h-10 px-4 flex-shrink-0">
          <Send className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}
