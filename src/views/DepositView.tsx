import type { Route } from '../components/BottomNav';
import PaymentMethodFlow from '../components/PaymentMethodFlow';

interface Props { onNavigate: (r: Route) => void; }

export default function DepositView({ onNavigate }: Props) {
  return (
    <>
      <PaymentMethodFlow flow="deposit" open={true} onClose={() => onNavigate('home')} />
    </>
  );
}
