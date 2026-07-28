// PasswordRecoveryHandler.tsx
// Mounts globally and listens for Supabase PASSWORD_RECOVERY event.
// When triggered (user clicked password reset link in email), opens AuthModal in 'change' mode.
import { useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { bus } from '../lib/bus';

interface Props {
  onOpenChange: () => void;
}

/**
 * Mount this component once near the top of the app (e.g. in App.tsx).
 * It fires onOpenChange when Supabase detects the user came from a password-reset email link.
 */
export default function PasswordRecoveryHandler({ onOpenChange }: Props) {
  useEffect(() => {
    // Listen for Supabase PASSWORD_RECOVERY session event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        onOpenChange();
      }
    });

    // Also handle the bus event emitted by AuthModal (if mounted)
    const off = bus.on('auth:recovery', () => onOpenChange());

    return () => {
      subscription.unsubscribe();
      off();
    };
  }, [onOpenChange]);

  return null;
}
