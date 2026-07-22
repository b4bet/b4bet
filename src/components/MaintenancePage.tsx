import { Wrench, Clock } from 'lucide-react';

interface MaintenancePageProps {
  title?: string;
  message?: string;
  estimatedTime?: string;
}

export default function MaintenancePage({
  title = 'Under Maintenance',
  message = 'We are currently performing scheduled maintenance. We will be back shortly. Thank you for your patience!',
  estimatedTime = '',
}: MaintenancePageProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Wrench className="w-10 h-10 text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="text-slate-400 text-base leading-relaxed">{message}</p>
        </div>

        {/* Estimated time */}
        {estimatedTime && (
          <div className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-5 py-2.5 text-sm text-slate-300">
            <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Estimated time: <strong className="text-white">{estimatedTime}</strong></span>
          </div>
        )}

        {/* Animated dots */}
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>

        {/* Footer */}
        <p className="text-slate-600 text-xs">
          If you have urgent queries, please contact support.
        </p>
      </div>
    </div>
  );
}
