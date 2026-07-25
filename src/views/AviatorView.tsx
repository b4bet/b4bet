import AviatorGame from '../components/aviator/AviatorGame';

interface Props { onBack?: () => void; }

export default function AviatorView({ onBack }: Props) {
  return (
    <div style={{ minHeight: 'calc(100dvh - 62px - 64px)' }}>
      <AviatorGame onBack={onBack} />
    </div>
  );
}
