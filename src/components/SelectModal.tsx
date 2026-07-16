import { useEffect, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}

interface Props<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Universal custom-modal selector — replaces native <select> across the app.
 * Renders a Tailwind overlay sheet on mobile / centered modal on desktop.
 */
export default function SelectModal<T extends string | number>({
  value, options, onChange, placeholder = 'Select…', label, disabled, className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`input flex items-center justify-between gap-2 text-left disabled:opacity-50 ${className}`}
      >
        <span className="flex items-center gap-2 truncate">
          {active?.icon}
          <span className={active ? 'text-white' : 'text-slate-500'}>
            {active?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-midnight-950/70 backdrop-blur-sm p-0 sm:p-4"
             onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md bg-slatepanel-900 border border-borderline-900 rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-borderline-900">
              <h3 className="font-display font-bold text-base text-white">{label ?? 'Select an option'}</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center">
                <X className="w-4 h-4 text-slate-300" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
              {options.map((opt) => {
                const sel = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${sel ? 'bg-neon-500/15 border border-neon-500/40' : 'hover:bg-slatepanel-800 border border-transparent'}`}
                  >
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{opt.label}</span>
                      {opt.hint && <span className="block text-[11px] text-slate-500 truncate">{opt.hint}</span>}
                    </span>
                    {sel && <Check className="w-4 h-4 text-neon-300 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
