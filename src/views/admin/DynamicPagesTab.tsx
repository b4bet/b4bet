import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit3, X, Save, FileText, Code2 } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useDynamicPages } from '../../lib/cmsHooks';
import type { DynamicPage } from '../../lib/cms';

type Draft = Omit<DynamicPage, 'id' | 'ts'>;

const blank = (): Draft => ({
  title: '',
  html: '',
});

export default function DynamicPagesTab() {
  const pages = useDynamicPages();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);

  const openNew = () => setEditing({ id: null, draft: blank() });
  const openEdit = (p: DynamicPage) => setEditing({ id: p.id, draft: { title: p.title, html: p.html } });
  const close = () => setEditing(null);

  const save = () => {
    if (!editing) return;
    if (!editing.draft.title.trim()) {
      cms.toast({ title: 'Title required', body: 'Enter a page title like "Privacy Policy" or "Terms".', kind: 'alert' });
      return;
    }
    if (!editing.draft.html.trim()) {
      cms.toast({ title: 'HTML required', body: 'Enter the HTML content for this page.', kind: 'alert' });
      return;
    }
    if (editing.id) cms.updateDynamicPage(editing.id, editing.draft);
    else cms.addDynamicPage(editing.draft.title, editing.draft.html);
    setEditing(null);
    cms.toast({ title: 'Page saved', body: editing.draft.title, kind: 'success' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Dynamic Pages</h2>
          <p className="text-xs text-slate-500">
            Create custom pages (Privacy Policy, Terms, etc.) that appear in the user menu as floating popups.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary px-3 py-2 text-sm">
          <Plus className="w-4 h-4" /> Add Page
        </button>
      </div>

      <div className="panel p-3 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-neon-300" />
          <h3 className="font-display font-bold text-white text-sm">Pages</h3>
        </div>
        {pages.length === 0 ? (
          <p className="text-xs text-slate-500">No dynamic pages configured.</p>
        ) : (
          <div className="space-y-1.5">
            {pages.map((p) => (
              <div key={p.id} className="bg-midnight-850 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-neon-300" />
                  <div>
                    <div className="text-sm text-white truncate">{p.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {p.html ? 'HTML set' : 'No HTML'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => openEdit(p)} className="btn-ghost px-2 py-1 text-xs">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => cms.removeDynamicPage(p.id)} className="btn-coral px-2 py-1 text-xs">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal — renders directly on document.body, outside any scroll/transform containers */}
      {editing && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            style={{ width: '100%', maxWidth: '32rem', maxHeight: '85vh', overflowY: 'auto', borderRadius: '1rem', background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 60px rgba(0,0,0,0.8)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900">
              <h3 className="font-display font-bold text-white">
                {editing.id ? 'Edit Page' : 'New Dynamic Page'}
              </h3>
              <button onClick={close} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60">
                <X className="w-4 h-4 text-slate-300" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Page Title</label>
                <input
                  value={editing.draft.title}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })}
                  placeholder="Privacy Policy / Terms of Service"
                  className="input mt-1 w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">This title will appear in the user menu.</p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-2">
                  <Code2 className="w-3.5 h-3.5" /> HTML Content
                </label>
                <textarea
                  value={editing.draft.html ?? ''}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, html: e.target.value } })}
                  placeholder="<div>Your HTML content here</div>"
                  rows={8}
                  className="input mt-1 w-full font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Enter the full HTML content. It will be rendered in a full-screen floating popup for users.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={close} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
                <button onClick={save} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Page
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
