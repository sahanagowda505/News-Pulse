import { useEffect, useState } from 'react';

export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let rafId = 0;
    const start = performance.now();
    const initial = 0;
    const delta = target - initial;

    if (delta === 0) {
      setValue(target);
      return;
    }

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(initial + delta * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, durationMs]);

  return value;
}
