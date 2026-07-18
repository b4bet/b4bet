interface Props { onBack?: () => void; }

export default function LudoView({ onBack }: Props) {
 return (
 <div className="min-h-screen bg-slatepanel-900 flex items-center justify-center">
 <div className="text-center space-y-4">
 <div className="text-6xl">🎲</div>
 <h2 className="text-2xl font-bold text-white">Ludo</h2>
 <p className="text-slate-400">Coming soon!</p>
 {onBack && (
 <button
 onClick={onBack}
 className="mt-4 px-6 py-2 bg-neon-500/20 text-neon-300 rounded-lg hover:bg-neon-500/30 transition"
 >
 ← Back
 </button>
 )}
 </div>
 </div>
 );
}
