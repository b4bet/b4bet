import { X } from 'lucide-react';
import { useEffect } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { useLogo, useTextLogo } from '../lib/cmsHooks';
import type { DynamicPage } from '../lib/cms';

interface Props {
  page: DynamicPage | null;
  open: boolean;
  onClose: () => void;
}

export default function DynamicPagePopup({ page, open, onClose }: Props) {
  const logo = useLogo();
  const textLogo = useTextLogo();

  // Push a history entry when popup opens so mobile back button closes it
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ dynamicPage: true }, '');
    const handlePopstate = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopstate);
    return () => {
      window.removeEventListener('popstate', handlePopstate);
    };
  }, [open, onClose]);

  if (!open || !page) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[250] bg-midnight-950/60 backdrop-blur-sm" onClick={onClose} />

      {/* Popup */}
      <div className="fixed inset-0 z-[251] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header — 72px tall, logo left, title centred, close right */}
          <div
            className="relative flex items-center px-4 border-b border-borderline-900 flex-shrink-0"
            style={{ height: '72px' }}
          >
            {/* Left: site logo */}
            <div className="flex items-center gap-2 z-10">
              {logo ? (
                <img
                  src={logo}
                  alt="logo"
                  style={{ height: '50px', width: 'auto', maxWidth: '54px', objectFit: 'contain' }}
                />
              ) : (
                <div
                  className="rounded-lg bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center shrink-0"
                  style={{ width: '42px', height: '42px' }}
                >
                  <span className="text-white font-black text-sm">M</span>
                </div>
              )}
              {textLogo && (
                <img src={textLogo} alt="" className="h-6 w-auto max-w-[80px] object-contain" />
              )}
            </div>

            {/* Centre: page title (absolutely positioned so logo/close don't push it) */}
            <h3 className="absolute inset-x-0 text-center font-display font-bold text-lg text-white pointer-events-none px-20 truncate">
              {page.title}
            </h3>

            {/* Right: close button */}
            <button
              onClick={onClose}
              className="ml-auto w-9 h-9 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors z-10"
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
