import AviatorGame from '../components/aviator/AviatorGame';

interface Props { onBack?: () => void; }

export default function AviatorView({ onBack }: Props) {
  return (
    <div style={{ height: 'calc(100vh - 62px - 56px)' }}>
      <AviatorGame onBack={onBack} />
    </div>
  );
}
