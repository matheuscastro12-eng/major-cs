// Sons 100% sintetizados com WebAudio (nenhum arquivo de áudio).
export interface ClutchAudio {
  resume(): void;
  shot(distM: number, pan: number, player: boolean, pistol: boolean): void;
  step(distM: number, pan: number): void;
  hit(head: boolean): void;
  hurt(): void;
  beep(): void;
  defuse(): void;
  reload(): void;
  end(won: boolean): void;
  dispose(): void;
}

export function createAudio(): ClutchAudio {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) {
    const noop = () => {};
    return { resume: noop, shot: noop, step: noop, hit: noop, hurt: noop, beep: noop, defuse: noop, reload: noop, end: noop, dispose: noop };
  }
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  // ruído branco reaproveitado
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647) * 2 - 1; }

  const out = (pan: number) => {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  };
  const vol = (d: number) => 1 / (1 + d * 0.12);

  function burst(dur: number, gain: number, freq: number, q: number, pan: number, type: BiquadFilterType = 'lowpass') {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out(pan));
    src.start(t, Math.random() * 0.3, dur + 0.05);
  }
  function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slide = 0) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    resume() { if (ctx.state === 'suspended') void ctx.resume(); },
    shot(d, pan, player, pistol) {
      const v = player ? 0.9 : 0.75 * vol(d);
      burst(pistol ? 0.12 : 0.16, v, player ? 2600 : 1400 / (1 + d * 0.03), 0.8, pan);
      tone(pistol ? 160 : 110, 0.09, v * 0.6, 'triangle', -60);
    },
    step(d, pan) { burst(0.05, 0.35 * vol(d), 500, 1.5, pan, 'bandpass'); },
    hit(head) { tone(head ? 1800 : 1100, head ? 0.12 : 0.06, 0.25, 'square'); },
    hurt() { burst(0.12, 0.6, 300, 1, 0); tone(90, 0.15, 0.3, 'sine', -40); },
    beep() { tone(1550, 0.07, 0.18, 'square'); },
    defuse() { burst(0.08, 0.25, 4000, 2, 0, 'highpass'); },
    reload() { burst(0.04, 0.3, 3000, 4, 0, 'bandpass'); setTimeout(() => { if (ctx.state !== 'closed') burst(0.05, 0.35, 2000, 4, 0, 'bandpass'); }, 450); },
    end(won) { tone(won ? 523 : 220, 0.4, 0.25, 'triangle', won ? 260 : -80); },
    dispose() { void ctx.close().catch(() => {}); },
  };
}
