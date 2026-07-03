// Persistência do Road to Pro — família de save SEPARADA da Carreira.
//
// Espelha o padrão de careerSaves.ts (localStorage + cloud sync last-write-wins +
// tombstone), mas com namespace próprio (`rtm-rtp-v1`) e versão de schema própria
// (RTP_SAVE_VERSION). Zero acoplamento com o save da Carreira.
//
// RTP1: 1 slot local pra todo mundo (sem paywall). Cloud sync se logado.

import { getToken } from './account';
import { pushCloud, pullCloud, cloudEnabled, cancelCloudSave, cloudOnLocalSave, syncSlot, localSavedAt, markSavedAt } from './cloud';
import { captureError } from './errlog';
import { RTP_SAVE_VERSION, ACTIONS_PER_WEEK, rebuildRealWorld, STARTER_SETUP } from '../engine/rtp/createSave';
import { buildLeague, circuitEventName } from '../engine/rtp/league';
import { buildCircuit, computeObjective } from '../engine/rtp/circuit';
import { computeWorldRank } from '../engine/rtp/standing';
import { ALL_ATTRS } from '../engine/attributes';
import type { RoadToProSave, RtpSlotSummary, Tier } from '../engine/rtp/types';

const KEY = 'rtm-rtp-v1';
const CLOUD_SLOT = 'rtp';

// ─────────────────────────────────────────────────────────────────────────────
// Migrations (registry próprio do RTP). Mesma política da Carreira: backfill,
// nunca quebra save antigo. MIGRATIONS[N] leva de vN para vN+1.

type RtpMigration = (save: Record<string, unknown>) => Record<string, unknown>;

const RTP_MIGRATIONS: Record<number, RtpMigration> = {
  // v1 → v2 (RTP2 treino): inicializa trainingXp (progresso fracionário por
  // atributo) e actionsLeft (ações da semana). Backfill conservador.
  1: (save) => {
    const player = (save.player ?? {}) as Record<string, unknown>;
    const world = (save.world ?? {}) as Record<string, unknown>;
    return {
      ...save,
      player: {
        ...player,
        trainingXp: player.trainingXp ?? Object.fromEntries(ALL_ATTRS.map((k) => [k, 0])),
      },
      world: {
        ...world,
        actionsLeft: typeof world.actionsLeft === 'number' ? world.actionsLeft : ACTIONS_PER_WEEK,
      },
      _v: 2,
    };
  },
  // v2 → v3 (RTP4 liga): cria a divisão (você + 7 rivais, turno-returno) e
  // reinicia a rodada em 1 pra alinhar com o calendário novo.
  2: (save) => {
    const s = save as unknown as RoadToProSave;
    const tier: Tier = (s.team?.tier ?? 'academy') as Tier;
    const seed = ((s.rng?.seed ?? 1) ^ 0x5eed1) >>> 0;
    const league = buildLeague(s, tier, seed);
    const world = (save.world ?? {}) as Record<string, unknown>;
    return { ...save, world: { ...world, week: 1, league }, _v: 3 };
  },
  // v3 → v4 (RTP5 eventos de vida): garante inbox/sponsors como arrays no novo
  // formato (LifeEvent ganhou options). Saves antigos tinham inbox vazio.
  3: (save) => ({
    ...save,
    inbox: [],
    sponsors: Array.isArray(save.sponsors) ? save.sponsors : [],
    _v: 4,
  }),
  // v4 → v5 (REAL): mundo procedural → times/jogadores REAIS. Reconstrói o time
  // (entra num time real da sua região), a divisão e o tier; mantém o player.
  4: (save) => ({ ...(rebuildRealWorld(save as unknown as RoadToProSave) as unknown as Record<string, unknown>), _v: 5 }),
  // v5 → v6 (SETUP+TABS): periféricos/psicólogo + aba ativa. Backfill via factory
  // (objeto fresco por save — nunca uma const compartilhada, senão upgrades
  // vazariam entre saves). `world.major` fica ausente (opcional, P5).
  5: (save) => ({
    ...save,
    setup: (save.setup as unknown) ?? STARTER_SETUP(),
    ui: (save.ui as unknown) ?? { tab: 'overview', attrsOpen: false },
    _v: 6,
  }),
  // v6 → v7 (CIRCUITO): a liga pontos-corridos vira bracket GSL + playoff. Reconstrói
  // o circuito da temporada atual pro tier do jogador (reseta a temporada em curso).
  6: (save) => {
    const s = save as unknown as RoadToProSave;
    const tier: Tier = (s.team?.tier ?? 'academy') as Tier;
    const circuit = buildCircuit(s, tier, (((s.rng?.seed ?? 1) ^ 0xc1c) >>> 0));
    const world = (save.world ?? {}) as Record<string, unknown>;
    return { ...save, world: { ...world, week: 1, league: circuit, major: null }, _v: 7 };
  },
  // v7 → v8 (IDENTIDADE & PERKS): adiciona progression (nível/XP, perks, traits).
  // Backfill: deriva o nível da duração da carreira (partidas + MVPs) pra saves
  // longos não reiniciarem no nível 1, e concede pontos de perk equivalentes.
  7: (save) => {
    const player = (save.player ?? {}) as Record<string, unknown>;
    const history = (save.history ?? {}) as Record<string, unknown>;
    const matches = typeof history.matchesPlayed === 'number' ? history.matchesPlayed : 0;
    const mvps = typeof history.mvps === 'number' ? history.mvps : 0;
    let level = 1, xp = matches * 45 + mvps * 15;
    while (level < 50 && xp >= 60 + level * 30) { xp -= 60 + level * 30; level += 1; }
    const progression = (player.progression as unknown) ?? {
      level, xp, perkPoints: level - 1, perks: [], traits: [],
      tally: { wins: 0, openings: 0, clutches: 0, hs: 0, multiKills: 0, bigWins: 0, peakStreak: 0 },
    };
    return { ...save, player: { ...player, progression }, _v: 8 };
  },
  // v8 → v9 (MÍDIA & RIVALIDADES): audiência inicial derivada da fama; sem
  // manchetes nem rival ainda (aparecem jogando). Aditivo, guardado com ?. na UI.
  8: (save) => {
    const life = (save.life ?? {}) as Record<string, unknown>;
    const fame = typeof life.fame === 'number' ? life.fame : 0;
    const media = (save.media as unknown) ?? { followers: Math.max(0, Math.round(fame * 120)), headlines: [], rival: null };
    return { ...save, media, _v: 9 };
  },
  // v9 → v10 (PROFUNDIDADE): química evolutiva, confiança nos momentos, envelhecimento
  // + aposentadoria/legado, empréstimos/cláusulas no mercado. team.chem NÃO é opcional
  // no runtime (Profile + applyMatchOutcome iteram) — backfill neutro de 30 por colega.
  9: (save) => {
    const team = (save.team ?? {}) as Record<string, unknown>;
    const mates = (team.teammates ?? []) as { sourcePlayerId: string }[];
    const chem = team.chem ?? Object.fromEntries(mates.map((m) => [m.sourcePlayerId, 30]));
    return { ...save, team: { ...team, chem }, _v: 10 };
  },
  // v10 → v11 (CAMPEONATOS REAIS): dá o nome REAL ao campeonato atual (ex.: "CCT
  // South America") e marca a etapa 1. As próximas etapas/temporadas já nascem
  // nomeadas via buildCircuit.
  10: (save) => {
    const s = save as unknown as RoadToProSave;
    const league = s.world?.league;
    if (league) {
      const region = s.world.region;
      const name = circuitEventName(league.tier, region, s.world.season, 1);
      return { ...save, world: { ...(save.world as Record<string, unknown>), seasonEvent: 1, league: { ...league, name, event: 1 } }, _v: 11 };
    }
    return { ...save, world: { ...(save.world as Record<string, unknown>), seasonEvent: 1 }, _v: 11 };
  },
  // v11 → v12 (META DA DIRETORIA): objetivo por campeonato + confiança da diretoria.
  11: (save) => {
    const s = save as unknown as RoadToProSave;
    const world = save.world as Record<string, unknown>;
    const objective = s.world?.league ? computeObjective(s.world.league) : undefined;
    return { ...save, world: { ...world, objective, boardConfidence: 55 }, _v: 12 };
  },
  // v12 → v13 (PRÊMIOS & RANKING MUNDIAL): lista estruturada de prêmios individuais
  // (MVP/EVP por campeonato) + ranking mundial derivado. Aditivo: accolades começa
  // vazio, acumulador de rating zera, e o ranking é calculado do estado atual.
  12: (save) => {
    const history = (save.history ?? {}) as Record<string, unknown>;
    const world = (save.world ?? {}) as Record<string, unknown>;
    const withAccolades = {
      ...save,
      history: { ...history, accolades: Array.isArray(history.accolades) ? history.accolades : [] },
      world: { ...world, eventRatingSum: 0, eventSeries: 0 },
    };
    const rank = computeWorldRank(withAccolades as unknown as RoadToProSave);
    return { ...withAccolades, world: { ...withAccolades.world, worldRank: rank, peakRank: rank }, _v: 13 };
  },
  // v13 → v14 (LINHA DO TEMPO): registro por campeonato fechado (season/etapa/
  // colocação/rating/prêmio). Aditivo: começa vazia — a história nasce daqui pra frente.
  13: (save) => {
    const history = (save.history ?? {}) as Record<string, unknown>;
    return { ...save, history: { ...history, timeline: Array.isArray(history.timeline) ? history.timeline : [] }, _v: 14 };
  },
};

function migrateRtp(raw: Record<string, unknown>): RoadToProSave {
  let save = raw;
  let v = typeof save._v === 'number' ? save._v : 1;
  while (v < RTP_SAVE_VERSION && RTP_MIGRATIONS[v]) {
    save = RTP_MIGRATIONS[v](save);
    v += 1;
  }
  save._v = RTP_SAVE_VERSION;
  return save as unknown as RoadToProSave;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local

export function hasRtp(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function loadRtp(): RoadToProSave | null {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    return migrateRtp(JSON.parse(raw) as Record<string, unknown>);
  } catch (e) {
    // principal ilegível: preserva pra diagnóstico e tenta o backup de um passo
    // (espelha o gameStore da carreira — sem isso, criar de novo destruía o save).
    captureError(e, 'rtp-load');
    try { localStorage.setItem(KEY + '.corrupt', raw); } catch { /* sem espaço pro diagnóstico */ }
    try {
      const bak = localStorage.getItem(KEY + '.bak');
      if (bak) return migrateRtp(JSON.parse(bak) as Record<string, unknown>);
    } catch { /* backup também ilegível */ }
    return null;
  }
}

// Devolve false quando o localStorage recusou a escrita (quota/indisponível) —
// o consumidor avisa o jogador em vez de perder a sessão em silêncio.
export function saveRtp(save: RoadToProSave): boolean {
  const stamped: RoadToProSave = {
    ...save,
    _v: RTP_SAVE_VERSION,
    createdAt: save.createdAt || Date.now(),
  };
  const data = JSON.stringify(stamped);
  let prev: string | null = null;
  try { prev = localStorage.getItem(KEY); } catch { /* segue */ }
  try {
    localStorage.setItem(KEY, data);
  } catch (e) {
    captureError(e, 'rtp-persist');
    return false;
  }
  // backup de um passo: se o save novo ficar ilegível, dá pra voltar pro anterior
  if (prev && prev !== data) {
    try { localStorage.setItem(KEY + '.bak', prev); } catch { /* best-effort; quota não derruba o principal */ }
  }
  // timestamp local sempre (mesmo deslogado) — é o que o last-write-wins do
  // syncSlot usa pra reconciliar com a nuvem no próximo login.
  markSavedAt(KEY);
  // cloud push debounced (cloudOnLocalSave no-opa se a nuvem está desligada)
  if (getToken()) {
    cloudOnLocalSave(CLOUD_SLOT, KEY, () => data);
  }
  return true;
}

export function deleteRtp(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY + '.bak');
    localStorage.removeItem(KEY + '.corrupt');
    localStorage.removeItem(KEY + '.cloudts');
  } catch { /* sem storage */ }
  if (getToken()) {
    cancelCloudSave(CLOUD_SLOT);
    void pushCloud(CLOUD_SLOT, '', Date.now()); // tombstone
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud merge no boot: last-write-wins por timestamp via syncSlot (restaura,
// re-sobe ou apaga por tombstone — igual à carreira). 'restored'/'deleted'
// pedem re-render do consumidor.

export async function syncRtpFromCloud(): Promise<'restored' | 'pushed' | 'none' | 'deleted'> {
  if (!cloudEnabled()) return 'none';
  // Legado: saves gravados antes do `.cloudts` não têm timestamp local — o
  // last-write-wins escolheria às cegas. Desempata por progresso (temporada/
  // semana): a nuvem só vence se estiver comprovadamente mais adiantada.
  if (hasRtp() && localSavedAt(KEY) === 0) {
    const local = loadRtp();
    const c = await pullCloud(CLOUD_SLOT).catch(() => null);
    if (local && c?.data) {
      try {
        const cloudSave = migrateRtp(JSON.parse(c.data) as Record<string, unknown>);
        const prog = (s: RoadToProSave) => (s.world?.season ?? 0) * 1000 + (s.world?.week ?? 0);
        if (prog(cloudSave) > prog(local)) {
          localStorage.setItem(KEY, c.data);
          markSavedAt(KEY, c.updatedAt);
          return 'restored';
        }
      } catch { /* nuvem ilegível → mantém o local */ }
    }
    // local venceu (ou nuvem vazia): estampa agora pro syncSlot re-subir o local.
    markSavedAt(KEY);
  }
  return syncSlot(CLOUD_SLOT, KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumo leve (pra um futuro seletor de slots / card "continuar")

export function rtpSummary(): RtpSlotSummary {
  const save = loadRtp();
  if (!save) return { slot: 1, exists: false };
  return {
    slot: 1,
    exists: true,
    nick: save.player?.nick,
    teamName: save.team?.teamName,
    tier: save.team?.tier,
    ovr: save.player?.ovr,
    season: save.world?.season,
  };
}
