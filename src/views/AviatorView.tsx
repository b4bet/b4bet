import AviatorGame from '../components/aviator/AviatorGame';

interface Props { onBack?: () => void; }

export default function AviatorView({ onBack }: Props) {
  // Full height minus bottom nav (60px). Flex column so AviatorGame can fill it.
  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 60px)' }}>
      <AviatorGame onBack={onBack} />
    </div>
  );
}
