// Runtime do clutch (carregado só via import()): loop rAF com acumulador de
// tick fixo (1/60 s, máx. 5 steps por frame), render interpolado, HUD por callback.
import * as THREE from 'three';
import type { ClutchConfig, ClutchEnd, ClutchGameHandle, ClutchHud } from '../types';
import { createSim, defuseFraction, quit, step, TICK, EYE_H, type SimState } from '../logic/sim';
import { WEAPONS } from '../logic/weapons';
import { createAudio } from './audio';
import { createPerf } from './perf';
import { createPlayerInput } from './player';
import { createScene } from './scene';

export interface ClutchGameOptions {
  onHud?: (h: ClutchHud) => void;
  debugFps?: boolean;
  /** começa rodando mesmo sem pointer lock (preview/headless) */
  autoStart?: boolean;
}

const MAX_STEPS = 5;

export function createClutchGame(canvas: HTMLCanvasElement, cfg: ClutchConfig, onEnd: ClutchEnd, opts: ClutchGameOptions = {}): ClutchGameHandle {
  const sim: SimState = createSim(cfg);
  const maxRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(maxRatio);
  const view = createScene(sim.ctx.level, sim.bots.length);
  const { scene, camera } = view;
  camera.rotation.order = 'YXZ';
  const audio = createAudio();
  const perf = createPerf(maxRatio);
  let started = !!opts.autoStart;
  let ended = false;
  let disposed = false;

  const input = createPlayerInput(canvas, () => {
    if (!sim.result) { quit(sim); finish(); }
  }, (l) => { if (l) { started = true; audio.resume(); } pushHud(true); });
  input.setView(sim.player.yaw, sim.player.pitch);

  const onClick = () => { if (!ended) input.lock(); };
  canvas.addEventListener('click', onClick);

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // efeitos
  let hurt = 0, hitMark = 0, muzzleT = 0, bob = 0, kick = 0, botFlash = new Float32Array(sim.bots.length);
  const prev = { x: sim.player.x, z: sim.player.z, y: sim.player.y };
  let hudT = 0;

  function pan(x: number, z: number) {
    const p = sim.player;
    const dx = x - p.x, dz = z - p.z;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const d = Math.hypot(dx, dz) || 1;
    return { d, pan: (dx * rx + dz * rz) / d };
  }

  function handleEvents() {
    for (const e of sim.events) {
      switch (e.t) {
        case 'shot': {
          const isP = e.by === 'player';
          view.tracer(e.x, e.y, e.z, e.ex, e.ey, e.ez, isP);
          const a = pan(e.x, e.z);
          audio.shot(isP ? 0 : a.d, isP ? 0 : a.pan, isP, e.weapon === 'pistol');
          if (isP) { muzzleT = 0.04; kick = Math.min(0.06, kick + 0.02); }
          break;
        }
        case 'hit': {
          hitMark = 1; audio.hit(e.head);
          const i = sim.bots.findIndex((b) => b.id === e.victim);
          if (i >= 0) botFlash[i] = 0.08;
          break;
        }
        case 'hurt': hurt = Math.min(1, hurt + 0.5); audio.hurt(); break;
        case 'step': if (e.by !== 'player') { const a = pan(e.x, e.z); audio.step(a.d, a.pan); } break;
        case 'beep': audio.beep(); break;
        case 'defuse_start': audio.defuse(); break;
        case 'reload': if (e.by === 'player') audio.reload(); break;
        default: break;
      }
    }
  }

  function pushHud(force = false) {
    if (!opts.onHud) return;
    if (!force && hudT < 0.1) return;
    hudT = 0;
    const p = sim.player;
    const w = WEAPONS[p.weapon];
    const h: ClutchHud = {
      hp: p.hp, armor: Math.round(p.armor), weapon: p.weapon, ammo: p.ammo[p.weapon], magSize: w.mag, reloading: p.reloadT > 0,
      bombLeft: sim.bomb.timeLeft, defuseProgress: defuseFraction(sim), canDefuse: sim.canDefuse,
      botsAlive: sim.bots.filter((b) => b.alive).length, botsTotal: sim.bots.length,
      killFeed: sim.killFeed.slice(-5).map((k) => ({ victim: k.victim, headshot: k.headshot, byPlayer: k.byPlayer })),
      hurtFlash: hurt, hitMarker: hitMark, locked: input.locked(),
    };
    if (opts.debugFps) {
      h.fps = { fps: perf.fps(), ms: perf.avg(), p95: perf.p95(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: perf.ratio() };
    }
    opts.onHud(h);
  }

  function finish() {
    if (ended || !sim.result) return;
    ended = true;
    audio.end(sim.result.won);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    pushHud(true);
    onEnd(sim.result);
  }

  let acc = 0;
  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dtMs = Math.min(250, now - last);
    last = now;
    perf.frame(dtMs, now);
    const r = perf.adapt(now);
    if (r) { renderer.setPixelRatio(r); resize(); }
    const dt = dtMs / 1000;

    if (started && !ended && (input.locked() || opts.autoStart)) {
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < MAX_STEPS) {
        prev.x = sim.player.x; prev.z = sim.player.z; prev.y = sim.player.y;
        step(sim, input.sample());
        handleEvents();
        acc -= TICK; n++;
        if (sim.result) break;
      }
      if (n === MAX_STEPS) acc = 0; // não entra em espiral
      if (sim.result) finish();
    } else {
      acc = 0;
    }

    // câmera interpolada
    const a = Math.min(1, acc / TICK);
    const p = sim.player;
    if (p.moving && p.y === 0) bob += dt * (p.running ? 11 : 6);
    camera.position.set(prev.x + (p.x - prev.x) * a, EYE_H + prev.y + (p.y - prev.y) * a + (p.moving ? Math.sin(bob * 2) * 0.025 : 0), prev.z + (p.z - prev.z) * a);
    camera.rotation.y = p.yaw;
    camera.rotation.x = p.pitch + p.punchPitch;

    hurt = Math.max(0, hurt - dt * 1.8);
    hitMark = Math.max(0, hitMark - dt * 5);
    muzzleT = Math.max(0, muzzleT - dt);
    kick = Math.max(0, kick - dt * 0.4);
    hudT += dt;
    for (let i = 0; i < botFlash.length; i++) botFlash[i] = Math.max(0, botFlash[i] - dt);

    view.setBots(sim.bots.map((b, i) => ({ x: b.x, z: b.z, yaw: b.yaw, alive: b.alive, flash: botFlash[i] })));
    view.setBomb(sim.bombPos.x, sim.bombPos.z, sim.bomb.nextBeep > beepHalf(sim), defuseFraction(sim));
    view.muzzle(muzzleT > 0);
    view.viewKick(kick, bob, p.weapon, p.reloadT > 0 ? Math.min(1, p.reloadT * 3) : 0);
    view.update(dt);
    renderer.render(scene, camera);
    pushHud();
  }
  raf = requestAnimationFrame(frame);
  pushHud(true);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('click', onClick);
      ro.disconnect();
      input.dispose();
      audio.dispose();
      view.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      botFlash = new Float32Array(0);
    },
  };
}

// a luz da bomba acende na metade final de cada intervalo de bip
function beepHalf(s: SimState) {
  return Math.max(0.06, Math.min(0.5, s.bomb.timeLeft / 60));
}
