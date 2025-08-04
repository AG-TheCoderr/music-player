import React, { useEffect, useRef, useCallback } from 'react';
import { useAudioPlayer } from './AudioPlayerProvider';

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
  responsive = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const { getFrequencyData, getTimeDomainData, isPlaying } = useAudioPlayer();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frequencyData = getFrequencyData();
    const timeDomainData = getTimeDomainData();

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (frequencyData.length === 0) return;

    switch (type) {
      case 'bars':
        drawBars(ctx, frequencyData, canvas.width, canvas.height, barCount, color);
        break;
      case 'wave':
        drawWave(ctx, timeDomainData, canvas.width, canvas.height, color);
        break;
      case 'circular':
        drawCircular(ctx, frequencyData, canvas.width, canvas.height, color);
        break;
    }

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [getFrequencyData, getTimeDomainData, isPlaying, type, barCount, color]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, draw]);

  // Handle responsive canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !responsive) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [responsive]);

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

function drawBars(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  barCount: number,
  color: string
) {
  const barWidth = width / barCount;
  const step = Math.floor(frequencyData.length / barCount);

  // Create gradient
  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(0.5, color + '80');
  gradient.addColorStop(1, color);

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
    ctx.shadowColor = color;
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
  color: string
) {
  const sliceWidth = width / timeDomainData.length;
  let x = 0;

  // Create gradient stroke
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, color + '60');
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, color + '60');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  for (let i = 0; i < timeDomainData.length; i++) {
    const v = timeDomainData[i] / 128.0;
    const y = v * height / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.stroke();

  // Add glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawCircular(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  color: string
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) * 0.4;
  const barCount = 64;
  const step = Math.floor(frequencyData.length / barCount);

  // Create radial gradient
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2);
  gradient.addColorStop(0, color + '20');
  gradient.addColorStop(0.7, color + '60');
  gradient.addColorStop(1, color);

  ctx.fillStyle = gradient;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2;
    const barHeight = (frequencyData[i * step] / 255) * radius;
    
    const startX = centerX + Math.cos(angle) * radius;
    const startY = centerY + Math.sin(angle) * radius;
    const endX = centerX + Math.cos(angle) * (radius + barHeight);
    const endY = centerY + Math.sin(angle) * (radius + barHeight);

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = gradient;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Draw center circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = color + '40';
  ctx.fill();
}