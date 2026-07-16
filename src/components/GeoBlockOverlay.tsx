import { Globe2 } from 'lucide-react';
import { useCountries } from '../lib/cmsHooks';
import { cms } from '../lib/cms';

export default function GeoBlockOverlay() {
  useCountries();
  if (!cms.isGeoBlocked()) return null;
  const c = cms.detectedCountry();
  return (
    <div className="fixed inset-0 z-[200] bg-midnight-900/95 backdrop-blur-sm grid place-items-center p-6">
      <div className="panel p-8 max-w-md text-center space-y-3">
        <Globe2 className="w-12 h-12 text-coral-400 mx-auto" />
        <h2 className="font-display font-extrabold text-2xl text-white">Not available in your country</h2>
        <p className="text-sm text-slate-400">
          Access to this platform from {c?.name ?? 'your region'} is currently restricted.
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}
