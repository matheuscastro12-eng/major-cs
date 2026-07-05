// Ultimate Squad — PRÉ-JOGO e PÓS-JOGO da transmissão (iter42).
// Mesmas regras da camada ao vivo (liveDrama.ts): TUDO derivado dos dados que
// os DOIS clientes do PvP compartilham — nomes canônicos, rosters canônicos
// (dataset por pid) e o roundLog canônico da série. Seeds são hashes desses
// próprios dados (FNV-1a), nunca Math.random: mesma partida ⇒ mesmo tale of
// the tape, mesmo craque do duelo, mesma chamada final nos dois lados.
// PURO/determinístico: mesma entrada ⇒ mesma saída, sempre.
import { makeRng } from '../rng';
import { deriveStats } from './cards';
import { traitsFor, type TraitId } from './traits';
import type { DramaPlayer, DramaScript, DramaStar } from './liveDrama';

// jogador mínimo pro pré-jogo: DramaPlayer + OVR exibido (TPlayer atende)
export interface TalePlayer extends DramaPlayer { ovr: number }

export interface TaleSide {
  avg: number;                                     // OVR médio do lado
  best: { nick: string; ovr: number; trait: TraitId | null }; // carta mais pesada (+ trait principal)
}

export interface TaleOfTape {
  sides: [TaleSide, TaleSide]; // ordem CANÔNICA (a UI espelha via myIdx)
  line: string;                // fala de caster apresentando o confronto
}

// ── catálogo do pré-jogo (PT-BR, mesma casa do liveDrama) ───────────────────
// {n} = nick da melhor carta do lado
const TAPE_OPEN: Record<TraitId, string[]> = {
  'awp-star': ['aposta tudo na AWP de {n}', 'chega com o rifle pesado de {n} pra abrir o mapa'],
  clutcher: ['confia no sangue-frio de {n} nos rounds decisivos', 'tem em {n} o clutch que fecha MD1'],
  opener: ['vem pra cima com a entry de {n}', 'quer o bombsite aberto na força de {n}'],
  lurker: ['arma as costas do mapa com {n}', 'esconde {n} onde ninguém está olhando'],
  'igl-mind': ['joga o xadrez na leitura de {n}', 'segue o plano de {n} no comando'],
  consistent: ['traz a consistência de {n}, jogo após jogo', 'aposta na regularidade absurda de {n}'],
};
const TAPE_OPEN_PLAIN = ['coloca {n} como carta mais pesada', 'tem {n} como referência do squad'];
// {f} = nome do favorito no papel
const TAPE_TAIL_FAV = [
  ' No papel, {f} chega na frente — mas MD1 não respeita favorito.',
  ' A régua aponta {f}; o servidor é quem decide.',
];
const TAPE_TAIL_EVEN = [
  ' Confronto parelho: quem piscar primeiro, paga.',
  ' Nada separa os dois no papel — o detalhe decide.',
];

// hash FNV-1a dos dados compartilhados do confronto → seed (igual nos 2 clientes)
function tapeSeed(names: [string, string], sides: [TalePlayer[], TalePlayer[]]): number {
  let h = 0x811c9dc5;
  const mix = (c: number) => { h ^= c; h = Math.imul(h, 0x01000193); };
  for (const ch of names[0] + '|' + names[1]) mix(ch.charCodeAt(0));
  for (const roster of sides) for (const p of roster) {
    for (const ch of p.nick) mix(ch.charCodeAt(0));
    mix(p.ovr);
  }
  return h >>> 0 || 1;
}

const fillN = (tpl: string, n: string) => tpl.replace('{n}', n);

function sideOf(players: TalePlayer[]): TaleSide {
  const avg = players.length ? Math.round(players.reduce((a, p) => a + p.ovr, 0) / players.length) : 0;
  // melhor carta: maior OVR; desempate por nick (ordem estável nos 2 clientes)
  let best = players[0];
  for (const p of players) {
    if (!best || p.ovr > best.ovr || (p.ovr === best.ovr && p.nick < best.nick)) best = p;
  }
  const traits = best ? traitsFor({ role: best.role as never, stats: deriveStats(best as Parameters<typeof deriveStats>[0]) }) : [];
  return { avg, best: { nick: best?.nick ?? '?', ovr: best?.ovr ?? 0, trait: traits[0] ?? null } };
}

// ── tale of the tape: leitura seeded do confronto (vs-intro) ────────────────
export function buildTaleOfTape(names: [string, string], rosters: [TalePlayer[], TalePlayer[]]): TaleOfTape {
  const sides: [TaleSide, TaleSide] = [sideOf(rosters[0]), sideOf(rosters[1])];
  const rng = makeRng(tapeSeed(names, rosters));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
  const clause = (s: TaleSide) => fillN(pick(s.best.trait ? TAPE_OPEN[s.best.trait] : TAPE_OPEN_PLAIN), s.best.nick);
  const cA = clause(sides[0]);
  const cB = clause(sides[1]);
  const diff = Math.abs(sides[0].avg - sides[1].avg);
  const fav = sides[0].avg >= sides[1].avg ? names[0] : names[1];
  const tail = diff >= 3 ? pick(TAPE_TAIL_FAV).replace('{f}', fav) : diff <= 1 ? pick(TAPE_TAIL_EVEN) : '';
  return { sides, line: `${names[0]} ${cA}; do outro lado, ${names[1]} ${cB}.${tail}` };
}

// ── craque do duelo (pós-jogo): a carta que a transmissão mais destacou ─────
// 1) estrela com MAIS momentos no script (empate: quem apareceu primeiro);
// 2) fallback: primeira carta com trait do lado VENCEDOR (ordem canônica do
//    roster ⇒ mesma escolha nos 2 clientes).
export interface MatchStar { nick: string; trait: TraitId; side: 0 | 1 }

export function pickMatchStar(
  script: Pick<DramaScript, 'starMoments'>,
  stars: [DramaStar[], DramaStar[]],
  winner: 0 | 1,
): MatchStar | null {
  const count = new Map<string, { n: number; first: number; m: MatchStar }>();
  for (const m of script.starMoments) {
    const cur = count.get(m.nick);
    if (cur) cur.n++;
    else count.set(m.nick, { n: 1, first: m.round, m: { nick: m.nick, trait: m.trait, side: m.side } });
  }
  let best: { n: number; first: number; m: MatchStar } | null = null;
  for (const c of count.values()) {
    if (!best || c.n > best.n || (c.n === best.n && c.first < best.first)) best = c;
  }
  if (best) return best.m;
  const fb = stars[winner][0];
  return fb ? { nick: fb.nick, trait: fb.trait, side: winner } : null;
}

// chamada final do caster (o "ACABOU!" da transmissão) — vai pro pós-jogo e
// pro card de compartilhamento. Deriva do script já determinístico.
export function finalCallOf(script: Pick<DramaScript, 'beats'>): string | null {
  for (let i = script.beats.length - 1; i >= 0; i--) {
    const b = script.beats[i];
    if (b.kind === 'final' && b.line) return b.line;
  }
  return null;
}

// ── contexto de W/L do histórico (pós-jogo) — read-only sobre o profile ─────
// `recent[0]` é a PRÓPRIA partida (recordMatch já rodou antes do modal).
export function streakLine(recent: readonly { won: boolean }[], won: boolean): string | null {
  if (recent.length === 0 || recent[0].won !== won) return null; // partida não registrada (ex.: PvP repetido)
  let run = 0;
  for (const r of recent) { if (r.won === won) run++; else break; }
  if (won) {
    if (run >= 2) return `${run}ª vitória seguida — squad em chamas!`;
    // vitória que quebra uma série de derrotas (≥2)
    let losses = 0;
    for (let i = 1; i < recent.length; i++) { if (!recent[i].won) losses++; else break; }
    if (losses >= 2) return `Vitória que quebra uma série de ${losses} derrotas!`;
    return null;
  }
  if (run >= 2) return `${run}ª derrota seguida — respira, ajusta o squad e volta.`;
  return null;
}
