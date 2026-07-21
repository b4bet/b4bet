import { useEffect, useRef, useState } from 'react';
import type { CrashState } from '../lib/crashEngine';
import { bus } from '../lib/bus';
import { getSettings, CrashSettingsTopic, type CrashUiSettings } from '../lib/crashAudio';

interface Props {
  state: CrashState;
}

export default function CrashCanvas({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef<CrashUiSettings>(getSettings());
  const [, force] = useState(0);
  useEffect(() => bus.on(CrashSettingsTopic, (s) => { settingsRef.current = s as CrashUiSettings; force((n) => n + 1); }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a0c1a');
      bg.addColorStop(1, '#070913');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(31, 36, 74, 0.6)';
      ctx.lineWidth = 1;
      const cols = 10;
      const rows = 6;
      for (let i = 1; i < cols; i++) {
        const x = (w / cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let i = 1; i < rows; i++) {
        const y = (h / rows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const s = stateRef.current;
      const padX = 24;
      const padY = 24;
      const plotW = w - padX * 2;
      const plotH = h - padY * 2;

      // Axes
      ctx.strokeStyle = 'rgba(58, 65, 128, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padX, h - padY);
      ctx.lineTo(w - padX, h - padY);
      ctx.moveTo(padX, padY);
      ctx.lineTo(padX, h - padY);
      ctx.stroke();

      if (settingsRef.current.animation && (s.phase === 'flying' || s.phase === 'busted')) {
        const m = s.multiplier;
        // Map multiplier to curve. Use log scale capped.
        const maxM = Math.max(2, m * 1.25);
        const xRatio = Math.min(1, (Math.log(m)) / Math.log(maxM));
        const yRatio = 1 - Math.min(1, (m - 1) / (maxM - 1));
        const endX = padX + plotW * Math.max(0.05, xRatio);
        const endY = padY + plotH * yRatio;

        const color = s.phase === 'busted' ? '#ff3366' : '#b15eff';
        // Area fill
        const grad = ctx.createLinearGradient(0, padY, 0, h - padY);
        grad.addColorStop(0, color + '55');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(padX, h - padY);
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const mx = 1 + (m - 1) * (Math.log(1 + t * (m - 1)) / Math.log(1 + (m - 1) || 1));
          const xx = padX + plotW * Math.max(0.05, (Math.log(mx)) / Math.log(maxM));
          const yy = padY + plotH * (1 - Math.min(1, (mx - 1) / (maxM - 1)));
          ctx.lineTo(xx, yy);
        }
        ctx.lineTo(endX, h - padY);
        ctx.closePath();
        ctx.fill();

        // Curve line
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(padX, h - padY);
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const mx = 1 + (m - 1) * (Math.log(1 + t * (m - 1)) / Math.log(1 + (m - 1) || 1));
          const xx = padX + plotW * Math.max(0.05, (Math.log(mx)) / Math.log(maxM));
          const yy = padY + plotH * (1 - Math.min(1, (mx - 1) / (maxM - 1)));
          ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Rocket / bust marker
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(endX, endY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color + '33';
        ctx.beginPath();
        ctx.arc(endX, endY, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center multiplier text — responsive sizing for large multipliers
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const m = s.multiplier;
      let label = m.toFixed(2) + 'x';
      let labelColor = '#b15eff';
      let labelSize = Math.max(18, 38 - Math.log(m) * 3); // Shrink for very large multipliers
      if (s.phase === 'countdown') {
        label = Math.ceil(s.countdown).toString();
        labelColor = '#ffcc4d';
        labelSize = 38;
      } else if (s.phase === 'busted') {
        // Compact, smaller bust label.
        label = 'FLEW AWAY ' + s.bustPoint.toFixed(2) + 'x';
        labelColor = '#ff3366';
        labelSize = Math.max(14, 18 - Math.log(s.bustPoint) * 1.5);
      }
      ctx.font = `700 ${labelSize}px Sora, sans-serif`;
      ctx.fillStyle = labelColor;
      ctx.shadowColor = labelColor;
      ctx.shadowBlur = s.phase === 'busted' ? 8 : 16;
      ctx.fillText(label, w / 2, h / 2);
      ctx.shadowBlur = 0;

      if (s.phase === 'countdown') {
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Next round starts in', w / 2, h / 2 - 28);
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="relative rounded-2xl border border-borderline-900 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-44 sm:h-52 md:h-60 block" />
      {state.phase === 'flying' && (
        <div className="absolute top-3 left-3 chip bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 animate-pulse-glow">
          <span className="w-1.5 h-1.5 rounded-full bg-emeraldwin-500 animate-ticker-blink" />
          LIVE
        </div>
      )}
    </div>
  );
}
