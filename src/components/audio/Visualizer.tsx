import React, { useEffect, useRef, useCallback } from 'react';
import { usePlayerActions, usePlayerSelector } from './playerContext';
import { getResolvedCSSColor, createColorWithAlpha } from '@/utils/colorUtils';

interface VisualizerProps {
  type: 'bars' | 'wave' | 'circular';
  width?: number;
  height?: number;
  className?: string;
  barCount?: number;
  color?: string;
  responsive?: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({
  type = 'bars',
  width = 300,
  height = 150,
  className = '',
  barCount = 64,
  color = 'hsl(var(--primary))',
  responsive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  /** CSS pixel size of the canvas - the backing store is scaled by the device pixel ratio. */
  const sizeRef = useRef({ width, height });
  const { getFrequencyData, getTimeDomainData } = usePlayerActions();
  const isPlaying = usePlayerSelector((state) => state.isPlaying);

  // Resolving the colour means reading a computed style - doing that every frame would
  // force a layout, so it is resolved once and only refreshed when the prop changes.
  const resolvedColorRef = useRef(getResolvedCSSColor(color));
  useEffect(() => {
    resolvedColorRef.current = getResolvedCSSColor(color);
  }, [color]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resolvedColor = resolvedColorRef.current;
    const frequencyData = getFrequencyData();
    const timeDomainData = getTimeDomainData();
    const { width: cssWidth, height: cssHeight } = sizeRef.current;

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (frequencyData.length === 0) {
      drawIdle(ctx, cssWidth, cssHeight, resolvedColor);
    } else {
      switch (type) {
        case 'bars':
          drawBars(ctx, frequencyData, cssWidth, cssHeight, barCount, resolvedColor);
          break;
        case 'wave':
          drawWave(ctx, timeDomainData, cssWidth, cssHeight, resolvedColor);
          break;
        case 'circular':
          drawCircular(ctx, frequencyData, cssWidth, cssHeight, resolvedColor);
          break;
      }
    }

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [getFrequencyData, getTimeDomainData, isPlaying, type, barCount]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      // Draw the final (or idle) frame once so the canvas is never blank.
      draw();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, draw]);

  // Keep the canvas in sync with its container, including device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applySize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = responsive ? canvas.parentElement?.clientWidth ?? width : width;
      const cssHeight = responsive ? canvas.parentElement?.clientHeight ?? height : height;

      if (!cssWidth || !cssHeight) return;

      sizeRef.current = { width: cssWidth, height: cssHeight };

      // The backing store uses device pixels, the drawing code stays in CSS pixels.
      canvas.width = Math.floor(cssWidth * ratio);
      canvas.height = Math.floor(cssHeight * ratio);

      const ctx = canvas.getContext('2d');
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);

      canvas.style.width = responsive ? '100%' : `${width}px`;
      canvas.style.height = responsive ? '100%' : `${height}px`;
    };

    applySize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', applySize);
      return () => window.removeEventListener('resize', applySize);
    }

    const observer = new ResizeObserver(() => applySize());
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener('resize', applySize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applySize);
    };
  }, [responsive, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={responsive ? undefined : width}
      height={responsive ? undefined : height}
      className={`${className} ${responsive ? 'w-full h-full' : ''}`}
      style={responsive ? {} : { width, height }}
    />
  );
};

/** A flat line shown when there is no audio signal. */
function drawIdle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string
) {
  ctx.strokeStyle = createColorWithAlpha(color, 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  barCount: number,
  resolvedColor: string
) {
  const barWidth = width / barCount;
  const step = Math.max(1, Math.floor(frequencyData.length / barCount));

  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, createColorWithAlpha(resolvedColor, 0.25));
  gradient.addColorStop(0.5, createColorWithAlpha(resolvedColor, 0.5));
  gradient.addColorStop(1, resolvedColor);

  ctx.fillStyle = gradient;

  for (let i = 0; i < barCount; i++) {
    const barHeight = (frequencyData[i * step] / 255) * height;
    const x = i * barWidth;
    const y = height - barHeight;

    // Draw bar with rounded top
    ctx.beginPath();
    ctx.roundRect(x + 1, y, barWidth - 2, barHeight, [2, 2, 0, 0]);
    ctx.fill();

    // Add glow effect
    ctx.shadowColor = resolvedColor;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  timeDomainData: Uint8Array,
  width: number,
  height: number,
  resolvedColor: string
) {
  if (timeDomainData.length === 0) return;

  const sliceWidth = width / timeDomainData.length;

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, createColorWithAlpha(resolvedColor, 0.4));
  gradient.addColorStop(0.5, resolvedColor);
  gradient.addColorStop(1, createColorWithAlpha(resolvedColor, 0.4));

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();

  let x = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const v = timeDomainData[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }

  ctx.stroke();
}

function drawCircular(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  resolvedColor: string
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;

  ctx.strokeStyle = createColorWithAlpha(resolvedColor, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  const step = Math.max(1, Math.floor(frequencyData.length / 64));

  ctx.strokeStyle = resolvedColor;
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i < 64; i++) {
    const value = frequencyData[i * step] / 255;
    const angle = (i / 64) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (0.3 + value * 0.7);

    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.stroke();
}
