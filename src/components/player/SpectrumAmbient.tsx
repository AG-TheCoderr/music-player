import React, { useEffect, useRef } from 'react';
import { usePlayerActions } from '../audio/playerContext';

/**
 * Analyser bin ranges per channel. With a 2048 point FFT at 44.1 kHz each bin is about 21.5 Hz:
 * red follows the bass (under about 130 Hz), green the mids, blue the highs.
 */
const CHANNELS = {
  r: [0, 6],
  g: [6, 80],
  b: [80, 300],
} as const;

const ATTACK = 0.35;
const RELEASE = 0.06;

/** Mean level of a bin range, 0 to 1. */
const bandLevel = (data: Uint8Array, [from, to]: readonly [number, number]): number => {
  const end = Math.min(to, data.length);
  if (end <= from) return 0;

  let sum = 0;
  for (let i = from; i < end; i++) sum += data[i];
  return sum / ((end - from) * 255);
};

/**
 * Full screen ambient light driven by the real spectrum.
 *
 * The values go straight to CSS custom properties, so React does not re-render on each frame.
 * Rising levels follow quickly and falling levels decay slowly, which keeps the light smooth.
 */
export const SpectrumAmbient: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { getFrequencyData } = usePlayerActions();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Motion-sensitive users keep the static background.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const smoothed = { r: 0, g: 0, b: 0 };
    let frame = 0;

    const tick = () => {
      const data = getFrequencyData();

      for (const channel of ['r', 'g', 'b'] as const) {
        // A square root curve keeps quiet passages visible without clipping loud ones.
        const target = Math.min(1, Math.sqrt(bandLevel(data, CHANNELS[channel]) * 2.2));
        const rate = target > smoothed[channel] ? ATTACK : RELEASE;
        smoothed[channel] += (target - smoothed[channel]) * rate;
        element.style.setProperty(`--ch-${channel}`, smoothed[channel].toFixed(3));
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getFrequencyData]);

  return <div ref={ref} className="ambient" aria-hidden="true" />;
};
