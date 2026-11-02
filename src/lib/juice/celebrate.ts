// celebrate(): burst de confete em um <canvas> fixo, leve e reutilizável.
// Um único canvas e um único requestAnimationFrame servem todos os bursts
// simultâneos; quando a última partícula morre, o canvas sai do DOM e o loop
// para (custo zero em repouso).
//
// Física e geração são funções puras (spawnParticles/stepParticles) com RNG
// semeável, testadas em scripts/test-juice.mts. Com prefers-reduced-motion,
// celebrate() não anima nada e resolve na hora — quem chama deve ter outro
// sinal visual estático (a carta, o placar, o troféu) que não dependa disto.

import { prefersReducedMotion } from './prefs';

export interface Particle {
  x: number; y: number;     // px
  vx: number; vy: number;   // px/s
  rot: number; vr: number;  // rad, rad/s
  w: number; h: number;     // px
  color: string;
  life: number;             // s restantes
  maxLife: number;
  shape: 'rect' | 'circle';
}

export interface CelebrateOptions {
  /** Origem: elemento (centro dele) ou fração da viewport {x,y} em 0..1. Padrão: centro, 60% da altura. */
  origin?: Element | { x: number; y: number };
  /** Quantidade de partículas (padrão 90, teto 300). */
  count?: number;
  /** Cores CSS. Padrão: dourado de conquista + CT/T + branco. */
  colors?: readonly string[];
  /** Abertura do cone em graus (padrão 70; 360 = explosão radial). */
  spread?: number;
  /** Velocidade inicial em px/s (padrão 900). */
  power?: number;
  /** Semente do RNG (padrão: aleatória). Útil para teste/screenshot estável. */
  seed?: number;
}

export const GRAVITY = 1400;   // px/s²
export const DRAG = 1.6;       // amortecimento linear por segundo
export const MAX_PARTICLES = 300;

/** Paleta padrão, resolvida dos tokens quando existirem (ver docs/design-system.md). */
const FALLBACK_COLORS = ['#d8a943', '#e8c170', '#61a8dd', '#e0a23a', '#ffffff'];

/** mulberry32 — RNG pequeno e determinístico. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gera partículas saindo de (x,y) num cone apontado para cima. Puro. */
export function spawnParticles(
  x: number,
  y: number,
  opts: { count: number; colors: readonly string[]; spread: number; power: number },
  rng: () => number,
): Particle[] {
  const count = Math.max(0, Math.min(MAX_PARTICLES, Math.trunc(opts.count)));
  const colors = opts.colors.length ? opts.colors : FALLBACK_COLORS;
  const spreadRad = (Math.max(0, Math.min(360, opts.spread)) * Math.PI) / 180;
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (rng() - 0.5) * spreadRad;
    const speed = opts.power * (0.45 + rng() * 0.55);
    const life = 1.4 + rng() * 1.2;
    out.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: rng() * Math.PI * 2,
      vr: (rng() - 0.5) * 14,
      w: 6 + rng() * 6,
      h: 4 + rng() * 5,
      color: colors[Math.floor(rng() * colors.length) % colors.length],
      life,
      maxLife: life,
      shape: rng() < 0.25 ? 'circle' : 'rect',
    });
  }
  return out;
}

/** Avança a física `dt` segundos e remove as mortas ou fora da tela. Puro (devolve array novo). */
export function stepParticles(ps: readonly Particle[], dt: number, viewH = Infinity): Particle[] {
  const damp = Math.max(0, 1 - DRAG * dt);
  const out: Particle[] = [];
  for (const p of ps) {
    const life = p.life - dt;
    const vy = p.vy * damp + GRAVITY * dt;
    const y = p.y + vy * dt;
    if (life <= 0 || y > viewH + 40) continue;
    const vx = p.vx * damp;
    out.push({ ...p, x: p.x + vx * dt, y, vx, vy, rot: p.rot + p.vr * dt, life });
  }
  return out;
}

// ── Renderizador (browser) ─────────────────────────────────────────────────

let canvas: HTMLCanvasElement | null = null;
let g2d: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf = 0;
let lastT = 0;
let waiters: Array<() => void> = [];

function tokenColors(): string[] {
  try {
    const cs = getComputedStyle(document.documentElement);
    const pick = (...names: string[]) => names.map((n) => cs.getPropertyValue(n).trim()).find(Boolean);
    const list = [
      pick('--c-achievement', '--gold'),
      pick('--gold-2'),
      pick('--c-ct', '--blue-bright'),
      pick('--c-t'),
      '#ffffff',
    ].filter((c): c is string => !!c);
    return list.length >= 3 ? list : FALLBACK_COLORS;
  } catch {
    return FALLBACK_COLORS;
  }
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (g2d && canvas?.isConnected) return g2d;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';
  document.body.appendChild(canvas);
  g2d = canvas.getContext('2d');
  if (!g2d) { canvas.remove(); canvas = null; return null; }
  resize();
  return g2d;
}

function resize(): void {
  if (!canvas || !g2d) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1); // teto 2: celular 3x não precisa
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function teardown(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  g2d = null;
  particles = [];
  const ws = waiters;
  waiters = [];
  ws.forEach((w) => w());
}

function frame(t: number): void {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); // aba em fundo não teleporta
  lastT = t;
  particles = stepParticles(particles, dt, window.innerHeight);
  if (!g2d || particles.length === 0) { teardown(); return; }
  g2d.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const p of particles) {
    g2d.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.35));
    g2d.fillStyle = p.color;
    g2d.save();
    g2d.translate(p.x, p.y);
    g2d.rotate(p.rot);
    if (p.shape === 'circle') {
      g2d.beginPath();
      g2d.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
      g2d.fill();
    } else {
      // Achata com o giro: imita o confete virando no ar.
      g2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)));
    }
    g2d.restore();
  }
  raf = requestAnimationFrame(frame);
}

function originPx(origin: CelebrateOptions['origin']): { x: number; y: number } {
  if (origin && typeof (origin as Element).getBoundingClientRect === 'function') {
    const r = (origin as Element).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const o = (origin as { x: number; y: number } | undefined) ?? { x: 0.5, y: 0.6 };
  return { x: o.x * window.innerWidth, y: o.y * window.innerHeight };
}

/**
 * Dispara um burst. Resolve quando a animação termina (ou na hora, se
 * reduced-motion / fora do browser). Chamadas simultâneas somam partículas
 * no mesmo canvas. Nunca lança.
 */
export function celebrate(opts: CelebrateOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || prefersReducedMotion()) {
    return Promise.resolve();
  }
  try {
    const ctx2d = ensureCanvas();
    if (!ctx2d) return Promise.resolve();
    const { x, y } = originPx(opts.origin);
    const rng = seededRng(opts.seed ?? Math.floor(Math.random() * 2 ** 32));
    const fresh = spawnParticles(x, y, {
      count: opts.count ?? 90,
      colors: opts.colors ?? tokenColors(),
      spread: opts.spread ?? 70,
      power: opts.power ?? 900,
    }, rng);
    particles = particles.concat(fresh).slice(-MAX_PARTICLES);
    const done = new Promise<void>((resolve) => { waiters.push(resolve); });
    if (!raf) {
      window.addEventListener('resize', resize);
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
    return done;
  } catch {
    return Promise.resolve();
  }
}

/** Para qualquer celebração em andamento e remove o canvas. */
export function stopCelebrate(): void {
  if (typeof window !== 'undefined' && (raf || canvas)) teardown();
}
