import { useEffect } from 'react';
import type { Route } from '../components/BottomNav';
import PaymentMethodFlow from '../components/PaymentMethodFlow';

interface Props { onNavigate: (r: Route) => void; }

export default function WithdrawView({ onNavigate }: Props) {
  // Push a history entry so the mobile back button triggers onClose → home
  useEffect(() => {
    window.history.pushState({ withdrawView: true }, '');
    const handlePopstate = () => { onNavigate('home'); };
    window.addEventListener('popstate', handlePopstate);
    return () => { window.removeEventListener('popstate', handlePopstate); };
  }, [onNavigate]);

  return (
    <>
      <PaymentMethodFlow flow="withdrawal" open={true} onClose={() => onNavigate('home')} />
    </>
  );
}
