/**
 * AudioCues.tsx
 *
 * Audio feedback for the Live Session: rep-completed beep, fault alert tone,
 * and session start/stop chimes. Uses the Web Audio API (no external files,
 * works fully offline).
 */

import { useEffect, useRef } from 'react';
import { usePoseSession } from '../../pose/use-pose-session';

const AUDIO_CONTEXT_STATE: { ctx: AudioContext | null } = { ctx: null };

function audioContext(): AudioContext {
  if (!AUDIO_CONTEXT_STATE.ctx) {
    AUDIO_CONTEXT_STATE.ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return AUDIO_CONTEXT_STATE.ctx;
}

function playTone(frequency: number, durationMs: number, type: OscillatorType = 'sine'): void {
  try {
    const ctx = audioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Autoplay policy may block; audio is a non-essential enhancement.
      });
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio not available — silently skip.
  }
}

export function AudioCues() {
  const { repCount, activeFault, isActive } = usePoseSession();

  // Play rep-completed cue when repCount increases.
  const prevRepCount = usePrevious(repCount);
  useEffect(() => {
    if (!isActive) return;
    if (prevRepCount !== null && repCount > prevRepCount) {
      playTone(880, 120, 'sine'); // high beep for rep
      setTimeout(() => playTone(880, 120, 'sine'), 150); // double beep
    }
  }, [repCount, isActive, prevRepCount]);

  // Play fault cue when a fault becomes active.
  const prevFault = usePrevious(activeFault);
  useEffect(() => {
    if (!isActive) return;
    if (prevFault !== null && activeFault !== null && activeFault !== prevFault) {
      playTone(330, 200, 'sawtooth'); // lower buzz for fault
    }
  }, [activeFault, isActive, prevFault]);

  // Session start/stop cues.
  const prevActive = usePrevious(isActive);
  useEffect(() => {
    if (prevActive === null) return; // skip initial mount
    if (isActive && !prevActive) {
      playTone(660, 150, 'sine');
      setTimeout(() => playTone(988, 150, 'sine'), 120); // ascending chime
    } else if (!isActive && prevActive) {
      playTone(988, 150, 'sine');
      setTimeout(() => playTone(660, 150, 'sine'), 120); // descending chime
    }
  }, [isActive, prevActive]);

  return null;
}

/**
 * Hook to track the previous value of a variable.
 */
function usePrevious<T>(value: T): T | null {
  const ref = useRef<T | null>(null);
  const prev = ref.current;
  ref.current = value;
  return prev;
}
