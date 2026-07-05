// Ultimate Squad — TEXTURA DE FRAGS do duelo ao vivo (iter44). Complementa a
// camada de transmissão (liveDrama.ts): enquanto o liveDrama narra o ARCO da
// partida (pistol/streak/virada/match point), este módulo narra o ROUND — quem
// fragou, multi-kills, top fragger corrente e o "star watch" (a carta-estrela
// tá entregando?). TUDO derivado do killFeed CANÔNICO da série compartilhada
// (mesma ordem tA/tB nos dois clientes do PvP) + nicks dos rosters canônicos.
// Mesmas regras de determinismo do liveDrama: seed = hash FNV do próprio feed
// + nomes → mesma partida ⇒ mesmas falas nos 2 clientes; NENHUM Math.random.
// O módulo NÃO inventa abate nenhum: toda linha nasce de eventos reais do feed
// (subset), então nunca contradiz o placar nem o scoreboard.
import { makeRng } from '../rng';
import type { KillEvent } from '../../types';
import type { TraitId } from './traits';

export type FragKind = 'ace' | 'quad' | 'triple' | 'open-hs' | null;

export interface FragBeat {
  line: string | null; // fala curta exibida APÓS o round (só quando o caster do arco silencia)
  kind: FragKind;
}

// ── catálogo (PT-BR, mesma voz de caster BR do liveDrama) — {n} = nick ──────
const FRAG_LINES: Record<Exclude<FragKind, null>, string[]> = {
  ace: [
    '💥 ACE! {n} LIMPA o round SOZINHO!',
    '💥 UM CONTRA CINCO não é justo — ACE de {n}!',
    '💥 {n} passa o rodo: CINCO abates no round!',
  ],
  quad: [
    '💣 QUADRA de {n} — faltou UM pro ace!',
    '💣 4K! {n} desmonta o round inteiro!',
  ],
  triple: [
    '🔻 Triplo abate de {n} nesse round!',
    '🔻 {n} derrete TRÊS de uma vez!',
    '🔻 Round do {n}: 3K sem piscar!',
  ],
  'open-hs': [
    '🎯 Abertura NA CABEÇA: {n} bota o round na frente!',
    '🎯 {n} abre o round com um HS seco!',
  ],
};

export const FRAG_CATALOG_SIZE = Object.values(FRAG_LINES).reduce((a, v) => a + v.length, 0);

// hash FNV-1a do feed compartilhado → seed do rng (igual nos 2 clientes)
function fragSeed(feed: readonly KillEvent[], names: [string, string]): number {
  let h = 0x811c9dc5;
  const mix = (c: number) => { h ^= c; h = Math.imul(h, 0x01000193); };
  for (const e of feed) {
    mix(e.round);
    mix(e.killerTeam + 1);
    for (const ch of e.killerId) mix(ch.charCodeAt(0));
    mix(e.headshot ? 7 : 3);
  }
  for (const ch of names[0] + ' ' + names[1]) mix(ch.charCodeAt(0));
  return h >>> 0 || 1;
}

const fill = (tpl: string, n: string) => tpl.replace('{n}', n);

// ── script de frag: 1 entrada por round (índice 0-based; e.round é 1-based) ──
// Rate-limit deliberado: ace/quad sempre narram; triple e open-hs são textura
// esporádica (sorteio seeded + espaçamento) pra não virar spam — máx 1 linha
// por round, e o host (UltimateCast) só a exibe quando o caster do ARCO cala.
export function buildFragScript(
  feed: readonly KillEvent[],
  rounds: number,
  names: [string, string],
  nickOf: (id: string) => string | undefined,
): FragBeat[] {
  const rng = makeRng(fragSeed(feed, names));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

  // agrupa por round (ordem canônica preservada — Map itera em ordem de inserção)
  const byRound: KillEvent[][] = Array.from({ length: rounds }, () => []);
  for (const e of feed) if (e.round >= 1 && e.round <= rounds) byRound[e.round - 1].push(e);

  const beats: FragBeat[] = [];
  let lastLineRound = -9; // espaçamento das linhas de TEXTURA (triple/open-hs)
  for (let r = 0; r < rounds; r++) {
    const events = byRound[r];
    // multi-kill: maior nº de abates de um mesmo killer neste round
    const perKiller = new Map<string, number>();
    for (const e of events) perKiller.set(e.killerId, (perKiller.get(e.killerId) ?? 0) + 1);
    let bestId: string | null = null; let bestK = 0;
    for (const [id, k] of perKiller) if (k > bestK) { bestK = k; bestId = id; }

    let kind: FragKind = null;
    let who: string | null = null;
    if (bestId && bestK >= 5) { kind = 'ace'; who = bestId; }
    else if (bestId && bestK === 4) { kind = 'quad'; who = bestId; }
    else if (bestId && bestK === 3 && r - lastLineRound >= 3 && rng() < 0.55) { kind = 'triple'; who = bestId; }
    else {
      const open = events.find((e) => e.opening);
      if (open?.headshot && r - lastLineRound >= 5 && rng() < 0.22) { kind = 'open-hs'; who = open.killerId; }
    }

    const nick = who ? nickOf(who) : undefined;
    if (kind && nick) {
      beats.push({ line: fill(pick(FRAG_LINES[kind]), nick), kind });
      if (kind === 'triple' || kind === 'open-hs') lastLineRound = r;
    } else {
      beats.push({ line: null, kind: null });
    }
  }
  return beats;
}

// ── top fragger CORRENTE (até o round exibido) — pro strip de stats ao vivo ──
// Desempate estável e canônico: mais kills > menos deaths > id lexicográfico.
export interface FragLeader { id: string; kills: number; deaths: number; side: 0 | 1 }

export function fragLeaderAt(feed: readonly KillEvent[], shown: number): FragLeader | null {
  const tally = new Map<string, { k: number; d: number; side: 0 | 1 }>();
  const at = (id: string, side: 0 | 1) => {
    let t = tally.get(id);
    if (!t) { t = { k: 0, d: 0, side }; tally.set(id, t); }
    return t;
  };
  for (const e of feed) {
    if (e.round > shown) continue;
    at(e.killerId, e.killerTeam).k++;
    at(e.victimId, e.victimTeam).d++;
  }
  let best: FragLeader | null = null;
  for (const [id, t] of tally) {
    if (t.k === 0) continue;
    if (!best || t.k > best.kills || (t.k === best.kills && (t.d < best.deaths || (t.d === best.deaths && id < best.id)))) {
      best = { id, kills: t.k, deaths: t.d, side: t.side };
    }
  }
  return best;
}

// ── STAR WATCH: a carta-estrela (trait) tá entregando o que promete? ─────────
// Avalia as DUAS estrelas vigiadas (uma por lado, seleção canônica feita pelo
// host) e devolve UMA leitura — a mais quente (empate → lado 0). Texto 100%
// canônico (nick + frase por trait), byte-idêntico nos 2 clientes; nenhum rng.
export interface WatchedStar { id: string; nick: string; trait: TraitId }
export interface StarWatch { nick: string; trait: TraitId; hot: boolean; kills: number; side: 0 | 1; line: string }

const WATCH_HOT: Record<TraitId, string> = {
  clutcher: 'o clutcher tá ENTREGANDO — {k}K',
  opener: 'o entry tá abrindo tudo — {k}K',
  'awp-star': 'a AWP tá PAGANDO — {k}K',
  'igl-mind': 'o cérebro também fraga: {k}K',
  lurker: 'o fantasma tá aparecendo — {k}K',
  consistent: 'regularidade pura: {k}K',
};
const WATCH_COLD: Record<TraitId, string> = {
  clutcher: 'o clutcher ainda não apareceu ({k}K)',
  opener: 'o entry tá preso na entrada ({k}K)',
  'awp-star': 'a AWP tá quieta demais ({k}K)',
  'igl-mind': 'chamando mais do que atirando ({k}K)',
  lurker: 'sumido até demais ({k}K)',
  consistent: 'dia atípico ({k}K)',
};

export function starWatchAt(
  feed: readonly KillEvent[],
  shown: number,
  watched: [WatchedStar | null, WatchedStar | null],
): StarWatch | null {
  if (shown < 6) return null; // amostra curta demais pra julgar alguém
  const killsOf = (id: string) => {
    let k = 0;
    for (const e of feed) if (e.round <= shown && e.killerId === id) k++;
    return k;
  };
  let best: StarWatch | null = null;
  for (const side of [0, 1] as const) {
    const w = watched[side];
    if (!w) continue;
    const kills = killsOf(w.id);
    const kpr = kills / shown;
    const hot = kpr >= 0.75;
    const cold = !hot && shown >= 8 && kpr <= 0.3;
    if (!hot && !cold) continue;
    const tpl = (hot ? WATCH_HOT : WATCH_COLD)[w.trait];
    const cand: StarWatch = { nick: w.nick, trait: w.trait, hot, kills, side, line: `${w.nick}: ${tpl.replace('{k}', String(kills))}` };
    // prioridade canônica: quente > frio; empate de temperatura → mais kills; empate → lado 0
    if (!best || (cand.hot && !best.hot) || (cand.hot === best.hot && cand.kills > best.kills)) best = cand;
  }
  return best;
}
