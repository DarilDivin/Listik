"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useUIPrefs, type ReflectionStyleId } from "@/components/ui-prefs";
import { cn } from "@/lib/utils";

const TAU = Math.PI * 2;

interface ReflectionMarkProps {
  preset: ReflectionStyleId;
  /** Les aperçus au repos sont fixes ; seule la présence choisie s’anime. */
  animate?: boolean;
  size?: number;
  className?: string;
}

type Point = readonly [number, number];

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, points: Point[], alpha = 1, width = 1, close = false) {
  if (!points.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) {
  // Plusieurs cercles transparents produisent une lueur bornée, sans filtre
  // coûteux ni texture mise à jour hors de cette petite zone 64 × 64.
  for (let i = 4; i >= 1; i--) dot(ctx, x, y, (radius * i) / 4, (alpha * (5 - i)) / 16);
}

function fusion(ctx: CanvasRenderingContext2D, time: number) {
  const dots = [0, 1, 2].map((i) => {
    const angle = time * 0.95 + (i * TAU) / 3;
    const radius = 8 + 2.5 * Math.sin(time * 1.3 + i * 2);
    return [32 + Math.cos(angle) * radius, 32 + Math.sin(angle * 1.12 + i * 0.3) * radius] as const;
  });
  glow(ctx, 32, 32, 19, 0.14);
  dots.forEach(([x, y], i) => dot(ctx, x, y, 7 - i * 0.45, 0.82));
  dot(ctx, 32, 32, 5.5, 0.66);
}

function souffle(ctx: CanvasRenderingContext2D, time: number) {
  const breath = (Math.sin((time * TAU) / 5) + 1) / 2;
  glow(ctx, 32, 32, 26 + breath * 2, 0.3);
  glow(ctx, 31 + Math.sin(time * 0.5) * 2, 31, 15 + breath * 5, 0.5);
  dot(ctx, 32, 32, 8 + breath * 2, 0.72);
  ctx.save();
  ctx.globalAlpha = 0.15 - breath * 0.06;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(32, 32, 15 + breath * 5, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function soie(ctx: CanvasRenderingContext2D, time: number) {
  glow(ctx, 32, 32, 20, 0.06);
  for (let strand = 0; strand < 9; strand++) {
    const points: Point[] = [];
    for (let i = 0; i <= 80; i++) {
      const angle = (i / 80) * TAU;
      const twist = time * 0.35 + strand * 0.13;
      points.push([
        32 + 18 * Math.cos(angle) * Math.cos(twist) + 7 * Math.sin(angle * 2 + time * 0.5 + strand * 0.09),
        32 + 17 * Math.sin(angle) * Math.sin(twist + 0.6) + 6 * Math.cos(angle * 3 - time * 0.4 + strand * 0.1),
      ]);
    }
    line(ctx, points, 0.13 + strand * 0.045, 0.65, true);
  }
}

function lucioles(ctx: CanvasRenderingContext2D, time: number) {
  glow(ctx, 32, 32, 22, 0.06);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996 + time * (0.12 + i * 0.015);
    const radius = 7 + i * 1.8;
    const x = 32 + Math.cos(angle) * radius;
    const y = 32 + Math.sin(angle * 1.1 + i) * radius;
    const pulse = 0.3 + (0.7 * (Math.sin(time * 1.3 - i * 1.7) + 1)) / 2;
    glow(ctx, x, y, 4.5, pulse * 0.3);
    dot(ctx, x, y, 1.1 + pulse * 0.7, pulse);
  }
}

function maree(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(32, 32, 19, 0, TAU);
  ctx.clip();
  dot(ctx, 32, 32, 19, 0.08);
  for (let wave = 0; wave < 4; wave++) {
    ctx.beginPath();
    ctx.moveTo(10, 54);
    for (let x = 10; x <= 54; x++) {
      const y = 26 + wave * 4 + Math.sin(x * 0.12 - time * (0.65 + wave * 0.13) + wave * 1.2) * (3 + wave * 0.25);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(54, 55);
    ctx.closePath();
    ctx.globalAlpha = 0.16 + wave * 0.075;
    ctx.fill();
  }
  ctx.restore();
}

function eclipse(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.translate(32, 32);
  ctx.rotate(time * 0.42);
  glow(ctx, -5, -5, 20, 0.42);
  dot(ctx, 0, 0, 19, 0.64);
  ctx.globalCompositeOperation = "destination-out";
  dot(ctx, 4, -3, 17, 1);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function petales(ctx: CanvasRenderingContext2D, time: number) {
  const opening = 0.5 + Math.sin(time * 1.2) * 0.5;
  ctx.save();
  ctx.translate(32, 32);
  ctx.rotate(time * 0.14);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 5);
    ctx.globalAlpha = 0.18 + i * 0.08;
    ctx.beginPath();
    ctx.ellipse(0, -8 - opening * 2, 6.2 + opening * 0.8, 10 + opening * 1.8, Math.sin(time * 0.8) * 0.15, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  dot(ctx, 0, 0, 3, 0.85);
  ctx.restore();
}

function constellation(ctx: CanvasRenderingContext2D, time: number) {
  const points = Array.from({ length: 5 }, (_, i) => {
    const angle = (i * TAU) / 5 + time * 0.13;
    const radius = 14 + Math.sin(time * 0.7 + i * 1.5) * 4;
    return [32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius] as const;
  });
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const distance = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      line(ctx, [points[i], points[j]], Math.max(0.08, 0.58 - distance / 70), 0.7);
    }
  }
  points.forEach(([x, y], i) => {
    glow(ctx, x, y, 5, 0.16);
    dot(ctx, x, y, 1.9 + 0.4 * Math.sin(time + i), 0.8);
  });
}

function mercure(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.translate(32, 32);
  ctx.rotate(time * 0.17);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const angle = (i / 120) * TAU;
    const radius = 16 + 2.2 * Math.sin(angle * 3 + time * 0.85) + 1.7 * Math.sin(angle * 2 - time * 0.62);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = 0.84;
  ctx.fill();
  ctx.clip();
  glow(ctx, -9, 7, 12, 0.38);
  ctx.restore();
}

function ruban(ctx: CanvasRenderingContext2D, time: number) {
  const point = (angle: number): Point => [
    32 + (19 * Math.cos(angle)) / (1 + Math.sin(angle) ** 2),
    32 + (22 * Math.sin(angle) * Math.cos(angle)) / (1 + Math.sin(angle) ** 2),
  ];
  const total = 120;
  const offset = time * 0.65;
  for (let i = 0; i < total; i++) {
    const alpha = 0.1 + 0.8 * (i / total) ** 1.5;
    line(ctx, [point((i / total) * TAU + offset), point(((i + 1) / total) * TAU + offset)], alpha, 1.4 + (1.4 * i) / total);
  }
}

function empreinte(ctx: CanvasRenderingContext2D, time: number) {
  for (let ring = 0; ring < 6; ring++) {
    const points: Point[] = [];
    for (let i = 0; i <= 90; i++) {
      const angle = (i / 90) * TAU;
      const radius =
        4 +
        ring * 2.7 +
        (1 + ring * 0.2) * Math.sin(3 * angle + time * 0.55 + ring * 0.2) +
        0.6 * Math.cos(5 * angle - time * 0.3);
      points.push([32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius]);
    }
    line(ctx, points, 0.58 - ring * 0.07, 0.8, true);
  }
}

function braise(ctx: CanvasRenderingContext2D, time: number) {
  const intensity = 0.8 + Math.sin(time * 1.7) * 0.2;
  glow(ctx, 32, 33, 25, 0.3 * intensity);
  for (let i = 0; i < 4; i++) {
    const angle = time * 0.4 + i * 1.6;
    glow(ctx, 32 + Math.cos(angle) * 5, 32 + Math.sin(angle * 1.3) * 5, 12, 0.32);
  }
  glow(ctx, 31, 30, 5, 0.85);
  dot(ctx, 31, 30, 1.8, 0.9);
  for (let i = 0; i < 5; i++) {
    const life = (time * 0.11 + i * 0.21) % 1;
    dot(ctx, 32 + Math.sin(i * 7 + time * 0.6) * (5 + life * 11), 39 - life * 29, 0.55, Math.sin(life * Math.PI) * 0.65);
  }
}

const PAINTERS: Record<ReflectionStyleId, (ctx: CanvasRenderingContext2D, time: number) => void> = {
  fusion,
  souffle,
  soie,
  lucioles,
  maree,
  eclipse,
  petales,
  constellation,
  mercure,
  ruban,
  empreinte,
  braise,
};

/**
 * Illustration canvas minuscule de la réflexion. Le canvas fait 64 unités de
 * dessin quel que soit son affichage : une bulle et sa vignette ont donc la
 * même composition. Une seule instance anime ses pixels à la fois (la bulle,
 * ou le choix actif dans Réglages) ; les autres restent des aperçus fixes.
 */
export function ReflectionMark({ preset, animate = false, size = 64, className }: ReflectionMarkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const { accent } = useUIPrefs();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);

    const paint = (time: number) => {
      context.setTransform((size * ratio) / 64, 0, 0, (size * ratio) / 64, 0, 0);
      context.clearRect(0, 0, 64, 64);
      context.fillStyle = getComputedStyle(canvas).color;
      context.strokeStyle = getComputedStyle(canvas).color;
      PAINTERS[preset](context, time);
    };

    paint(0.8);
    if (!animate || reducedMotion) return;

    let frame = 0;
    let startedAt: number | null = null;
    const loop = (now: number) => {
      if (document.hidden) {
        frame = requestAnimationFrame(loop);
        return;
      }
      if (startedAt === null) startedAt = now;
      paint((now - startedAt) / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [accent, animate, preset, reducedMotion, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("block text-brand", className)}
      style={{ height: size, width: size }}
    />
  );
}
