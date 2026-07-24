import AviatorGame from '../components/aviator/AviatorGame';

interface Props { onBack?: () => void; }

export default function AviatorView({ onBack }: Props) {
  return <AviatorGame onBack={onBack} />;
}
