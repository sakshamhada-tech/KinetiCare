/**
 * RepCounter.tsx
 *
 * Displays current rep count vs target, with a simple progress bar.
 */

import { usePoseSession } from '../../pose/use-pose-session';
import { Activity } from 'lucide-react';

export function RepCounter() {
  const { repCount, targetReps } = usePoseSession();

  const progress = targetReps > 0 ? Math.min(repCount / targetReps, 1) : 0;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-1 rounded-lg border border-slate-200 bg-slate-900/90 backdrop-blur px-4 py-3 text-white shadow-lg">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Activity className="h-4 w-4" aria-hidden="true" />
        <span>Reps</span>
      </div>
      <div className="text-2xl font-mono font-bold">{repCount}</div>
      <div className="w-24 h-1.5 rounded-full border border-slate-700 bg-slate-700">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="text-xs text-slate-400">
        {repCount} / {targetReps}
      </div>
    </div>
  );
}
