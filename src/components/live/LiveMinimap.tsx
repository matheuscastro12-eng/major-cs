// Minimapa central — canvas onde os 10 agentes andam, spike planta, tiros são
// desenhados, etc. Quando o radar PNG do CS2 está disponível pro mapa, desenha
// por baixo; senão usa o layout abstrato com grid + sites destacados.
//
// V2 (após feedback do user):
//   - Dispara `ensureMask(radarImage)` ao montar pra que o engine 2D pare de
//     atravessar paredes (a sim consulta `getMaskSync` a cada tick).
//   - Renderiza linha de tiro durante a fase shooting (Agent.shootingAtId).
//     Linha amarela pulsante killer→victim + muzzle flash no killer.
//   - Site overlay verde só no modo abstract (no radar real polui a leitura).

import { useEffect, useRef } from 'react';
import type { LiveState, Agent } from '../../lib/liveCanvasSim';
import { ensureMask } from '../../lib/walkableMask';

interface Props {
  state: LiveState;
}

export function LiveMinimap({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarImgRef = useRef<HTMLImageElement | null>(null);

  // Carrega radar + walkable mask sob demanda quando o mapa muda.
  useEffect(() => {
    const layout = state.map;
    if (layout.radarImage) {
      const img = new Image();
      img.src = layout.radarImage;
      img.onload = () => {
        radarImgRef.current = img;
      };
      // Pré-carrega a mask em paralelo. Cache global em walkableMask.ts.
      // Fire-and-forget: a sim consulta getMaskSync() e enquanto null,
      // os agents andam em linha reta (fallback).
      void ensureMask(layout.radarImage).catch(() => { /* fallback line-walk */ });
    } else {
      radarImgRef.current = null;
    }
  }, [state.map]);

  // Render loop (vinculado ao rAF do orquestrador via prop state que muda).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawFrame(canvas, state, radarImgRef.current);
  });

  return (
    <canvas
      ref={canvasRef}
      width={state.map.width}
      height={state.map.height}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function teamSideColor(side: 't' | 'ct'): string {
  return side === 't' ? '#e8a93b' : '#5fa4e8';
}

function drawFrame(canvas: HTMLCanvasElement, st: LiveState, radar: HTMLImageElement | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Fundo
  if (radar) {
    ctx.drawImage(radar, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = st.map.floor;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = st.map.grid;
    ctx.lineWidth = 1;
    const grid = 80;
    for (let x = 0; x <= w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    // Sites só no modo abstract — no radar real eles confundem a leitura
    drawSite(ctx, st.map.siteA, 'A', st.map.accent);
    drawSite(ctx, st.map.siteB, 'B', st.map.accent);
  }

  // Spike (no chão ou planted)
  if (st.spike.planted && st.spike.plantedAt && !st.spike.defused) {
    ctx.fillStyle = st.spike.timer < 10 ? '#ff5252' : '#ffb84d';
    ctx.beginPath();
    ctx.arc(st.spike.plantedAt.x, st.spike.plantedAt.y, 9, 0, Math.PI * 2);
    ctx.fill();
    const pulse = 14 + Math.sin(performance.now() / 100) * 4;
    ctx.strokeStyle = 'rgba(255, 184, 77, .8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(st.spike.plantedAt.x, st.spike.plantedAt.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
  } else if (st.spike.pos && !st.spike.carrierId) {
    ctx.fillStyle = '#aaa';
    ctx.fillRect(st.spike.pos.x - 5, st.spike.pos.y - 5, 10, 10);
  }

  // Linhas de tiro (fase shooting) — desenhadas ABAIXO dos agents pra não
  // tapar o killer. Pulsam pra dar sensação de fogo cruzado.
  drawShotLines(ctx, st);

  // Agents
  for (const a of st.agents) {
    drawAgent(ctx, a);
  }
}

function drawShotLines(ctx: CanvasRenderingContext2D, st: LiveState): void {
  const phase = (Math.sin(performance.now() / 60) + 1) * 0.5; // 0..1
  for (const killer of st.agents) {
    if (!killer.alive || !killer.shootingAtId) continue;
    const victim = st.agents.find((v) => v.id === killer.shootingAtId);
    if (!victim) continue;
    // tracer: linha amarela do killer pro victim, semi-transparente, pulsante
    ctx.strokeStyle = `rgba(255, 220, 80, ${0.45 + phase * 0.35})`;
    ctx.lineWidth = 1.5 + phase * 1.5;
    ctx.beginPath();
    ctx.moveTo(killer.pos.x, killer.pos.y);
    ctx.lineTo(victim.pos.x, victim.pos.y);
    ctx.stroke();
    // muzzle flash: círculo amarelo brilhante no killer, expandindo
    const flash = 6 + phase * 8;
    ctx.fillStyle = `rgba(255, 240, 120, ${0.55 + phase * 0.25})`;
    ctx.beginPath();
    ctx.arc(
      killer.pos.x + Math.cos(killer.facing) * 12,
      killer.pos.y + Math.sin(killer.facing) * 12,
      flash,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // "impact" no victim — circulo vermelho pulsando
    ctx.fillStyle = `rgba(255, 80, 80, ${0.45 + phase * 0.35})`;
    ctx.beginPath();
    ctx.arc(victim.pos.x, victim.pos.y, 4 + phase * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAgent(ctx: CanvasRenderingContext2D, a: Agent): void {
  const c = teamSideColor(a.side);
  if (!a.alive) {
    // X cinza
    ctx.strokeStyle = 'rgba(140, 140, 140, .55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.pos.x - 8, a.pos.y - 8);
    ctx.lineTo(a.pos.x + 8, a.pos.y + 8);
    ctx.moveTo(a.pos.x + 8, a.pos.y - 8);
    ctx.lineTo(a.pos.x - 8, a.pos.y + 8);
    ctx.stroke();
    return;
  }
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.arc(a.pos.x + 1, a.pos.y + 2, 12, 0, Math.PI * 2);
  ctx.fill();
  // Corpo (cor do lado)
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(a.pos.x, a.pos.y, 11, 0, Math.PI * 2);
  ctx.fill();
  // Borda — engrossa em fase shooting (visual de "atirando")
  const shooting = a.shootingAtId != null;
  ctx.strokeStyle = shooting ? 'rgba(255, 220, 80, 0.9)' : 'rgba(255,255,255,0.65)';
  ctx.lineWidth = shooting ? 2.5 : 1.5;
  ctx.stroke();
  // Direção (cone facing)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(a.pos.x, a.pos.y);
  ctx.lineTo(a.pos.x + Math.cos(a.facing) * 16, a.pos.y + Math.sin(a.facing) * 16);
  ctx.stroke();
  // Nick acima
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(a.pos.x - 24, a.pos.y - 26, 48, 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(a.nick.toUpperCase(), a.pos.x, a.pos.y - 17);
}

function drawSite(ctx: CanvasRenderingContext2D, zone: { cx: number; cy: number; w: number; h: number }, label: string, accent: string): void {
  const x = zone.cx - zone.w / 2;
  const y = zone.cy - zone.h / 2;
  ctx.fillStyle = hexA(accent, 0.08);
  ctx.strokeStyle = hexA(accent, 0.55);
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, zone.w, zone.h);
  ctx.strokeRect(x, y, zone.w, zone.h);
  ctx.fillStyle = hexA(accent, 0.7);
  ctx.font = 'bold 32px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, zone.cx, zone.cy);
  ctx.textBaseline = 'alphabetic';
}

function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
