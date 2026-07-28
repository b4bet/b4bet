// PasswordRecoveryHandler.tsx
// Mounts globally and listens for Supabase PASSWORD_RECOVERY event.
// When triggered (user clicked password reset link in email), opens AuthModal in 'change' mode.
import { useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';

interface Props {
  onOpenChange: () => void;
}

/**
 * Mount this component once in App.tsx.
 * It fires onOpenChange when Supabase detects the user came from a password-reset email link.
 * Usage in App.tsx:
 *   <PasswordRecoveryHandler onOpenChange={() => openAuthModal('change')} />
 */
export default function PasswordRecoveryHandler({ onOpenChange }: Props) {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        onOpenChange();
      }
    });
    return () => subscription.unsubscribe();
  }, [onOpenChange]);

  return null;
}
