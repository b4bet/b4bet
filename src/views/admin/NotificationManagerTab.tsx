import { useEffect, useState } from 'react';
import { cms, type NotificationTemplate, type NotificationTemplateKind } from '../../lib/cms';
import { bus } from '../../lib/bus';
import { BellRing, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle, Edit2, Check, X } from 'lucide-react';
import SelectModal from '../../components/SelectModal';

function useNotificationTemplates() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>(() => cms.notificationTemplates);
  useEffect(() => {
    const unsub = bus.on('cms:notif_templates', (payload) => {
      setTemplates(payload as NotificationTemplate[]);
    });
    return () => unsub();
  }, []);
  return templates;
}

const KIND_LABELS: Record<NotificationTemplateKind, string> = {
  info: 'Info',
  success: 'Success',
  warn: 'Warning',
  alert: 'Alert',
};

const KIND_COLORS: Record<NotificationTemplateKind, string> = {
  info: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  success: 'bg-emeraldwin-500/20 text-emeraldwin-300 border-emeraldwin-500/30',
  warn: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  alert: 'bg-coral-500/20 text-coral-300 border-coral-500/30',
};

const kindOptionsStr = (Object.keys(KIND_LABELS) as NotificationTemplateKind[]).map((k) => ({
  value: k,
  label: KIND_LABELS[k],
}));

export default function NotificationManagerTab() {
  const templates = useNotificationTemplates();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // New template form state
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newKind, setNewKind] = useState<NotificationTemplateKind>('info');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editKind, setEditKind] = useState<NotificationTemplateKind>('info');

  function startEditing(tpl: NotificationTemplate) {
    setEditingId(tpl.id);
    setEditTitle(tpl.title);
    setEditBody(tpl.body);
    setEditKind(tpl.kind);
  }

  function saveEdit() {
    if (!editTitle.trim() || !editBody.trim()) {
      setError('Title and message body are required.');
      return;
    }
    if (editingId) {
      cms.updateNotificationTemplate(editingId, { title: editTitle.trim(), body: editBody.trim(), kind: editKind });
    }
    setEditingId(null);
    setError('');
  }

  function handleCreate() {
    if (!newTitle.trim() || !newBody.trim()) {
      setError('Title and message body are required.');
      return;
    }
    cms.addNotificationTemplate({ title: newTitle.trim(), body: newBody.trim(), kind: newKind, isActive: true });
    setNewTitle('');
    setNewBody('');
    setNewKind('info');
    setCreating(false);
    setError('');
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-neon-400" />
          <h2 className="font-display font-bold text-white text-lg">Notification Manager</h2>
          <span className="chip bg-neon-500/20 text-neon-300 text-[10px]">{templates.filter((t) => t.isActive).length} active</span>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neon-500/20 border border-neon-500/30 text-neon-300 text-sm font-semibold hover:bg-neon-500/30 transition-colors"
          >
            <Plus className="w-4 h-4" /> New
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coral-500/15 border border-coral-500/30 text-coral-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="panel p-4 space-y-3 border border-neon-500/20">
          <p className="text-xs font-semibold text-neon-400 uppercase tracking-wider">New Notification Template</p>
          <input
            className="input w-full text-sm"
            placeholder="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="input w-full text-sm h-20 resize-none"
            placeholder="Message body"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-12">Kind:</label>
            <SelectModal
              value={newKind}
              options={kindOptionsStr}
              onChange={(v) => setNewKind(v as NotificationTemplateKind)}
              className="flex-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setError(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600 transition-colors flex items-center justify-center gap-1.5">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleCreate} className="flex-1 py-2 rounded-xl bg-neon-500/90 text-midnight-900 text-sm font-bold hover:bg-neon-400 transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Create
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="panel p-6 text-center text-slate-500 text-sm">No notification templates yet.</div>
        )}
        {templates.map((tpl) => {
          const isEditing = editingId === tpl.id;
          return (
            <div key={tpl.id} className={`panel p-4 space-y-3 transition-all ${tpl.isActive ? '' : 'opacity-60'}`}>
              {isEditing ? (
                <>
                  <input
                    className="input w-full text-sm font-semibold"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <textarea
                    className="input w-full text-sm h-20 resize-none"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 w-12">Kind:</label>
                    <SelectModal
                      value={editKind}
                      options={kindOptionsStr}
                      onChange={(v) => setEditKind(v as NotificationTemplateKind)}
                      className="flex-1 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(null); setError(''); }} className="flex-1 py-1.5 rounded-xl bg-slatepanel-700 text-slate-300 text-xs hover:bg-slatepanel-600 transition-colors flex items-center justify-center gap-1">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button onClick={saveEdit} className="flex-1 py-1.5 rounded-xl bg-neon-500/90 text-midnight-900 text-xs font-bold hover:bg-neon-400 transition-colors flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">{tpl.title}</span>
                        <span className={`chip text-[10px] border ${KIND_COLORS[tpl.kind]}`}>{KIND_LABELS[tpl.kind]}</span>
                        {tpl.isAutoGenerated && (
                          <span className="chip text-[10px] bg-slate-700/50 text-slate-400">Built-in</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tpl.body}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Toggle on/off */}
                      <button
                        onClick={() => cms.toggleNotificationTemplate(tpl.id, !tpl.isActive)}
                        title={tpl.isActive ? 'Disable' : 'Enable'}
                        className="w-8 h-8 rounded-lg grid place-items-center hover:bg-slatepanel-700 transition-colors"
                      >
                        {tpl.isActive ? (
                          <ToggleRight className="w-5 h-5 text-neon-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-slate-500" />
                        )}
                      </button>
                      {/* Edit */}
                      <button
                        onClick={() => startEditing(tpl)}
                        title="Edit"
                        className="w-8 h-8 rounded-lg grid place-items-center hover:bg-slatepanel-700 transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-slate-400" />
                      </button>
                      {/* Delete (only custom templates) */}
                      {!tpl.isAutoGenerated && (
                        <button
                          onClick={() => cms.deleteNotificationTemplate(tpl.id)}
                          title="Delete"
                          className="w-8 h-8 rounded-lg grid place-items-center hover:bg-coral-500/20 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-coral-400" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-600">
                    <span>
                      Status:{' '}
                      <span className={tpl.isActive ? 'text-neon-400' : 'text-slate-500'}>
                        {tpl.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </span>
                    <span>{new Date(tpl.createdAt).toLocaleDateString()}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
