// DESAFIO DO PICK'EM — o link do palpite vira duelo entre amigos: quem abre o
// link de alguém monta o seu e compara. Aqui ficam só as partes puras:
//   - comparePicks: o que dois palpites têm em comum (classificados por stage,
//     3-0/0-3, semis, final e campeão);
//   - cleanNick: o apelido que viaja no link (&de=), saneado pra [a-z0-9_-]{1,20};
//   - addRival/parseRivals: a lista dos últimos palpites de amigo guardados no
//     navegador (até 5, o mais recente primeiro).
// TS PURO: sem React, sem window. Testado em scripts/test-pickem-compare.mts.

import type { MajorPicks } from './majorSingapore';

export interface PicksComparison {
  /** por stage, quantos classificados aparecem nos dois palpites (0..8) */
  stage: [number, number, number];
  /** soma dos três stages (0..24) */
  qualified: number;
  /** por stage, os 3-0 que os dois escolheram (ids, na ordem do palpite `a`) */
  x30: [string[], string[], string[]];
  /** por stage, os 0-3 que os dois escolheram */
  x03: [string[], string[], string[]];
  /** semifinalistas (vencedores das quartas) em comum, 0..4 */
  semis: string[];
  /** finalistas (vencedores das semis) em comum, 0..2 */
  final: string[];
  /** campeão de cada um ('' = sem palpite); `same` só vale com os dois definidos */
  champion: { a: string; b: string; same: boolean };
}

/** ids presentes nas duas listas, sem repetição e sem vazio, na ordem de `a` */
function common(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
  const inB = new Set((b ?? []).filter(Boolean));
  return [...new Set((a ?? []).filter(Boolean))].filter((id) => inB.has(id));
}

/**
 * Compara dois palpites. A posição na chave não importa: um time nas semis dos
 * dois conta como "semi em comum" mesmo que tenha passado por quartas diferentes
 * (a chave de cada um depende dos 8 que ele classificou no Stage 3).
 */
export function comparePicks(a: MajorPicks, b: MajorPicks): PicksComparison {
  const stage: [number, number, number] = [common(a.s1, b.s1).length, common(a.s2, b.s2).length, common(a.s3, b.s3).length];
  const ext = (k: 'x30' | 'x03') => [0, 1, 2].map((i) => common(a[k]?.[i], b[k]?.[i])) as [string[], string[], string[]];
  const ca = a.bracket?.[6] ?? '';
  const cb = b.bracket?.[6] ?? '';
  return {
    stage,
    qualified: stage[0] + stage[1] + stage[2],
    x30: ext('x30'),
    x03: ext('x03'),
    semis: common(a.bracket?.slice(0, 4), b.bracket?.slice(0, 4)),
    final: common(a.bracket?.slice(4, 6), b.bracket?.slice(4, 6)),
    champion: { a: ca, b: cb, same: !!ca && ca === cb },
  };
}

// ---------------------------------------------------------------- apelido

export const NICK_MAX = 20;
const NICK_RE = /^[a-z0-9_-]{1,20}$/;

/**
 * Apelido que vai no link (&de=). Minúsculo, sem acento, espaço vira '-', só
 * [a-z0-9_-], até 20. Devolve '' quando não sobra nada legível (aí a tela diz
 * "Seu amigo"). Usado na ida (nick do manager) e na volta (o que veio na URL).
 */
export function cleanNick(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    .slice(0, 64)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, NICK_MAX)
    .replace(/^-+|-+$/g, '');
  return NICK_RE.test(s) && /[a-z0-9]/.test(s) ? s : '';
}

// ---------------------------------------------------------------- amigos guardados

export interface SavedRival {
  /** código do palpite (o mesmo do ?p=) */
  code: string;
  /** apelido saneado ('' = sem apelido) */
  nick: string;
}

export const MAX_RIVALS = 5;
// mesmo alfabeto do link (engine/majorSingapore.ts: versão.corpo[.extra])
const CODE_RE = /^[0-9a-z]{4}\.[0-9a-v_]{31}(?:\.[0-9a-v_]{12})?$/;

/** lê a lista guardada (JSON já parseado); descarta o que não tiver a forma certa */
export function parseRivals(raw: unknown): SavedRival[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedRival[] = [];
  for (const x of raw) {
    const code = typeof x?.code === 'string' ? x.code.trim().toLowerCase() : '';
    if (!CODE_RE.test(code) || out.some((r) => r.code === code)) continue;
    out.push({ code, nick: cleanNick(x?.nick) });
    if (out.length >= MAX_RIVALS) break;
  }
  return out;
}

/** põe o palpite na frente (sem repetir o código); sem apelido novo, mantém o antigo */
export function addRival(list: readonly SavedRival[], r: SavedRival, max = MAX_RIVALS): SavedRival[] {
  const code = r.code.trim().toLowerCase();
  if (!CODE_RE.test(code)) return [...list].slice(0, max);
  const old = list.find((x) => x.code === code);
  const nick = cleanNick(r.nick) || old?.nick || '';
  return [{ code, nick }, ...list.filter((x) => x.code !== code)].slice(0, max);
}
