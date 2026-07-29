import AviatorGame from '../components/aviator/AviatorGame';

interface Props { onBack?: () => void; }

export default function AviatorView({ onBack }: Props) {
  return (
    // Fixed height — not minHeight — so the inner flex+overflow container
    // gets a real constrained height and sticky positioning works.
    <div style={{ height: 'calc(100dvh - 62px - 64px)', overflow: 'hidden' }}>
      <AviatorGame onBack={onBack} />
    </div>
  );
}
