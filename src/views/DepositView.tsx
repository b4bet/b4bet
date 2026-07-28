import { useEffect } from 'react';
import type { Route } from '../components/BottomNav';
import PaymentMethodFlow from '../components/PaymentMethodFlow';

interface Props { onNavigate: (r: Route) => void; }

export default function DepositView({ onNavigate }: Props) {
  // Push a history entry so mobile back button works
  useEffect(() => {
    window.history.pushState({ depositFlow: true }, '');
    const onPop = () => onNavigate('home');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onNavigate]);

  return (
    <>
      <PaymentMethodFlow flow="deposit" open={true} onClose={() => onNavigate('home')} />
    </>
  );
}
