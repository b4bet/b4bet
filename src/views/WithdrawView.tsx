import type { Route } from '../components/BottomNav';
import PaymentMethodFlow from '../components/PaymentMethodFlow';

interface Props { onNavigate: (r: Route) => void; }

export default function WithdrawView({ onNavigate }: Props) {
  return (
    <>
      <PaymentMethodFlow flow="withdrawal" open={true} onClose={() => onNavigate('home')} />
    </>
  );
}
