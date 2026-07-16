import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  reveal?: boolean; // force-revealed (admin view)
}

const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { reveal, className = '', ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  const visible = reveal || show;
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={`input pr-10 ${className}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center text-slate-400 hover:text-white"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
});

export default PasswordInput;
