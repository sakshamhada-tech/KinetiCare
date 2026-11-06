/**
 * FaultBanner.tsx
 *
 * Displays the currently active form fault with its corrective cue.
 * Hidden when no fault is active.
 */

import { usePoseSession } from '../../pose/use-pose-session';
import { AlertTriangle } from 'lucide-react';

export function FaultBanner() {
  const { activeFault, faultCue, isActive } = usePoseSession();

  if (!isActive || !activeFault || !faultCue) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg transition-opacity duration-300"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
      <div className="text-sm font-medium text-amber-800">{activeFault}</div>
      <div className="text-xs text-amber-700">{faultCue}</div>
    </div>
  );
}
