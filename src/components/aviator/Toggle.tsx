interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`toggle-track relative h-6 w-11 shrink-0 rounded-full ${
        checked ? 'bg-aviator-green-bright' : 'bg-ink-500'
      }`}
    >
      <span
        className={`toggle-knob absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
