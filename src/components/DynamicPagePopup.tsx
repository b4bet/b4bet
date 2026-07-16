import { X } from 'lucide-react';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import type { DynamicPage } from '../lib/cms';

interface Props {
  page: DynamicPage | null;
  open: boolean;
  onClose: () => void;
}

export default function DynamicPagePopup({ page, open, onClose }: Props) {
  if (!open || !page) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[250] bg-midnight-950/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Popup */}
      <div className="fixed inset-0 z-[251] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 flex-shrink-0">
            <h3 className="font-display font-bold text-lg text-white">{page.title}</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors"
            >
              <X className="w-4 h-4 text-slate-300" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div
              className="prose prose-invert max-w-none p-6 text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.html) }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
