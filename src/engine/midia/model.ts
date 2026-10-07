// [super atualização 2 · MÍDIA VIVA] Estado da mídia da Carreira.
//
// Bloco OPCIONAL do save (`save.midia`), sem subir SAVE_VERSION: carreira sem o
// bloco nasce com `defaultMidia()` na primeira série. Tudo o que dá para
// DERIVAR (feed social, manchetes, trending) é derivado na hora a partir deste
// bloco + do resto do save, por seed. Aqui só fica o que não dá para refazer:
// confronto direto, mata-mata, linha do tempo curta das suas séries, coletivas
// respondidas e rumores. Tudo podado (`pruneMidia`) para o save não inflar.

export type MidiaLang = 'pt' | 'en' | 'es';

/** Confronto direto contra um adversário (ponto de vista do usuário). */
export interface H2H {
  w: number;   // séries vencidas
  l: number;   // séries perdidas
  s: number;   // sequência com sinal (+3 = três vitórias seguidas; −2 = duas derrotas)
  last: number; // split do último confronto
}

export type KoStage = 'qf' | 'sf' | 'f';
/** Retrospecto num degrau do mata-mata (quartas, semi, final). */
export interface KoRecord { w: number; l: number; s: number }

export type PressKind = 'pre' | 'post' | 'crisis' | 'glory';
export type PressTopic =
  | 'form'     // fase do time
  | 'rival'    // clássico / rivalidade
  | 'fregUs'   // o adversário é seu freguês
  | 'fregThem' // você é freguês do adversário
  | 'curse'    // maldição (quartas/semis/finais)
  | 'player'   // jogador em má fase
  | 'star'     // jogador em grande fase
  | 'rumor'    // rumor de transferência de um jogador seu
  | 'board'    // pressão da diretoria
  | 'streak'   // sequência de derrotas (crise)
  | 'title'    // conquista (glória)
  | 'style';   // estilo de jogo T/CT (engine/gestao/estilo.ts) em crise
export type PressTone = 'calm' | 'confident' | 'aggressive' | 'deflect';
export const PRESS_TONES: PressTone[] = ['calm', 'confident', 'aggressive', 'deflect'];

/** Pergunta de coletiva: o texto é montado na tela (idioma atual) a partir disto. */
export interface PressQ {
  t: PressTopic;
  v: number;      // variante do texto (determinística)
  p?: string;     // jogador citado (id do elenco)
  n?: string;     // nick do citado
  o?: string;     // tag do adversário / clube do rumor
  x?: number;     // número de apoio (sequência, derrotas nas quartas…)
  k?: KoStage;    // degrau da maldição
}

export interface PressConf {
  key: string;        // único: não repete a mesma coletiva
  kind: PressKind;
  split: number;
  oid?: string;       // id do adversário
  o?: string;         // tag do adversário
  label?: string;     // evento
  score?: string;     // placar (pós-jogo)
  won?: boolean;
  qs: PressQ[];
}

/** Efeito real de uma coletiva respondida. */
export interface PressFx {
  squad: number;                    // moral de todo o elenco
  players: Record<string, number>;  // moral extra dos citados
  board: number;                    // confiança da diretoria
  rep: number;                      // relação com a imprensa
}

export interface PressLog {
  key: string;
  kind: PressKind;
  split: number;
  o?: string;
  qs: PressQ[];
  picks: PressTone[];
  fx: PressFx;
}

/** Rumor de transferência (às vezes se confirma). */
export interface Rumor {
  id: string;
  pid: string;      // jogador
  nick: string;
  fromId: string;   // 'user' = seu clube
  from: string;     // tag
  toId: string;
  to: string;       // tag
  split: number;
  src: number;      // índice do jornalista (credibilidade varia)
  st?: 'ok' | 'no'; // confirmado / desmentido (resolvido na virada)
}

/** Linha do tempo curta das SUAS séries (o feed reage a elas). */
export interface SeriesEvt {
  split: number;
  n: number;        // número da série na carreira (ordem)
  oid: string;
  o: string;        // tag do adversário
  sc: string;       // placar "2-1"
  w: boolean;
  lbl: string;      // evento curto
  k?: KoStage;
  up?: boolean;     // zebra (a favor ou contra)
  mvp?: string;     // nick do destaque do seu time
  onick?: string;   // nick de um jogador do adversário (post de cumprimento)
}

export interface MidiaState {
  v: 1;
  rep?: number;                     // relação com a imprensa 0–100 (50)
  n?: number;                       // séries registradas (contador)
  cn?: number;                      // série da última coletiva convocada (ritmo)
  h2h?: Record<string, H2H>;
  ko?: Partial<Record<KoStage, KoRecord>>;
  streak?: number;                  // sequência geral com sinal
  pend?: PressConf | null;          // coletiva aguardando (pós-jogo, crise, glória)
  log?: PressLog[];                 // coletivas respondidas (mais recente primeiro)
  done?: string[];                  // chaves já respondidas/dispensadas (não repete)
  rum?: Rumor[];
  rumS?: number;                    // split dos rumores em curso
  tl?: SeriesEvt[];                 // últimas séries (mais recente primeiro)
}

export const MIDIA_REP_DEFAULT = 50;
export const H2H_CAP = 40;
export const LOG_CAP = 8;
export const DONE_CAP = 30;
export const RUMOR_CAP = 10;
export const TL_CAP = 16;

export function defaultMidia(): MidiaState {
  return { v: 1, rep: MIDIA_REP_DEFAULT, n: 0, h2h: {}, ko: {}, streak: 0, pend: null, log: [], done: [], rum: [], tl: [] };
}

/** Lê o bloco do save (tolerante a lixo: devolve o padrão). */
export function midiaOf(save: { midia?: MidiaState | null }): MidiaState {
  const m = save.midia;
  if (!m || typeof m !== 'object' || m.v !== 1) return defaultMidia();
  return m;
}

/** Poda: mantém o bloco pequeno (h2h dos 40 adversários mais frequentes/recentes). */
export function pruneMidia(m: MidiaState): MidiaState {
  const h2h = m.h2h ?? {};
  const keys = Object.keys(h2h);
  let pruned = h2h;
  if (keys.length > H2H_CAP) {
    const keep = keys
      .sort((a, b) => (h2h[b].w + h2h[b].l) * 4 + h2h[b].last - ((h2h[a].w + h2h[a].l) * 4 + h2h[a].last))
      .slice(0, H2H_CAP);
    pruned = Object.fromEntries(keep.map((k) => [k, h2h[k]]));
  }
  return {
    ...m,
    h2h: pruned,
    log: (m.log ?? []).slice(0, LOG_CAP),
    done: (m.done ?? []).slice(-DONE_CAP),
    rum: (m.rum ?? []).slice(0, RUMOR_CAP),
    tl: (m.tl ?? []).slice(0, TL_CAP),
  };
}
