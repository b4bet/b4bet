import AviatorGame from '../components/aviator/AviatorGame';

interface Props { onBack?: () => void; }

export default function AviatorView({ onBack }: Props) {
  // AviatorGame uses h-full internally. The parent <div> in App.tsx has
  // pt-[62px] pb-16 but no fixed height, so h-full collapses.
  // Fix: use a calc() height that fills the remaining viewport after header + bottom nav.
  return (
    <div style={{ height: 'calc(100dvh - 62px - 64px)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <AviatorGame onBack={onBack} />
    </div>
  );
}
