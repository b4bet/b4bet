import { PerGameBetLimitsPanel, GlobalBetLimitsPanel } from './GameAlgosTab';

export default function GameSettingsTab() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="font-display font-bold text-lg text-white">8-Game Settings</h2>
        <p className="text-xs text-slate-500">
          Configure global min/max bet limits and override them per game for all 8 games: Crash, Mines, Aviator, Win Go, K3, 5D, Sun vs Moon and Trading.
        </p>
      </div>
      <GlobalBetLimitsPanel />
      <PerGameBetLimitsPanel />
    </div>
  );
}
