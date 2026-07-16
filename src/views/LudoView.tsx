interface Props { onBack?: () => void; }

export default function LudoView({ onBack: _onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="panel p-8 text-center space-y-3">
        <div className="text-5xl">🎲</div>
        <h2 className="font-display font-bold text-xl text-white">Ludo</h2>
        <p className="text-sm text-slate-400">Coming soon — classic board game fun!</p>
      </div>
    </div>
  );
}
