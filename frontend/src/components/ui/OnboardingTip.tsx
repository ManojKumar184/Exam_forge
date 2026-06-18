import { useState } from 'react';
import { Info, X } from 'lucide-react';

interface OnboardingTipProps {
  /** Unique ID used for localStorage dismissal tracking */
  id: string;
  /** The tip content */
  children: React.ReactNode;
  /** Optional title shown above the tip */
  title?: string;
  /** Visual style variant */
  variant?: 'info' | 'success' | 'warning';
  /** Optional className override */
  className?: string;
}

const STORAGE_PREFIX = 'examforge_onboarding_dismissed_';

export function OnboardingTip({
  id,
  children,
  title,
  variant = 'info',
  className = '',
}: OnboardingTipProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_PREFIX + id) === 'true'
  );

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_PREFIX + id, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  const variantStyles = {
    info: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40 text-blue-800 dark:text-blue-300',
    success: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300',
    warning: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300',
  };

  const iconColors = {
    info: 'text-blue-500',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
  };

  return (
    <div
      className={`relative flex items-start gap-3 rounded-xl border p-4 text-sm ${variantStyles[variant]} ${className}`}
    >
      <Info className={`w-5 h-5 mt-0.5 shrink-0 ${iconColors[variant]}`} />
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold mb-1">{title}</p>
        )}
        <div className="leading-relaxed opacity-90">{children}</div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss tip"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
