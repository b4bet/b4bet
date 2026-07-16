interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: { text: 'text-2xl' },
  md: { text: 'text-3xl' },
  lg: { text: 'text-5xl' },
};

export function AviatorLogo({ size = 'md' }: LogoProps) {
  const s = sizeMap[size];
  return (
    <div className="flex items-center gap-2 select-none">
      <span className={`logo-wordmark ${s.text} flex`}>
        <span className="text-aviator-red">Aero</span>
        <span className="text-white">nix</span>
      </span>
    </div>
  );
}
