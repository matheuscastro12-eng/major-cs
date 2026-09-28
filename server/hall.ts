// Validação do registro no Hall da Fama (O0-36: SEGU-15, DADO-M01, ONLI-16).
// Antes o POST era anônimo e gravava roster/records como JSON livre, sem teto:
// um único POST de ~4 MB derrubava o GET público (que lista 50 linhas com esses
// campos). Agora só entram chaves conhecidas, com tipo e tamanho, e o JSON final
// de cada campo passa por um teto de bytes.
import { hasBlockedTerm, normalizeNick } from './nick.js';

export const HALL_JSON_MAX_BYTES = 4096;
// códigos que o jogo manda: modo clássico (FinalScreen) e Carreira (HALL_PLACEMENT).
export const HALL_PLACEMENTS = new Set(['1', '2', '3-4', '5-8', '9-16', '16', '17-32']);

export interface HallRosterEntry { nick: string; country: string; ovr: number }
export interface HallRecords {
  bestRating?: number;
  bestRatingPlayer?: string;
  biggestFrag?: number;
  biggestFragPlayer?: string;
  pickemScore?: string;
}
export interface HallEntry {
  player: string;
  teamName: string;
  pool: 'br' | 'world';
  placement: string;
  champion: string;
  mvp: string;
  season: number;
  roster: HallRosterEntry[];
  records: HallRecords;
}

const text = (v: unknown, max: number): string => normalizeNick(v, max);
const clampNum = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

function sanitizeRoster(raw: unknown): HallRosterEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).flatMap((p) => {
    if (!p || typeof p !== 'object') return [];
    const o = p as Record<string, unknown>;
    const nick = normalizeNick(o.nick);
    if (!nick) return [];
    const cc = String(o.country ?? '').slice(0, 4).toLowerCase();
    return [{ nick, country: /^[a-z]{2,3}$/.test(cc) ? cc : '', ovr: Math.round(clampNum(o.ovr, 0, 99) ?? 0) }];
  });
}

function sanitizeRecords(raw: unknown): HallRecords {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: HallRecords = {};
  const rating = clampNum(o.bestRating, 0, 5);
  if (rating !== undefined && rating > 0) out.bestRating = Math.round(rating * 100) / 100;
  if (o.bestRatingPlayer) out.bestRatingPlayer = normalizeNick(o.bestRatingPlayer);
  const frag = clampNum(o.biggestFrag, 0, 200);
  if (frag !== undefined && frag > 0) out.biggestFrag = Math.round(frag);
  if (o.biggestFragPlayer) out.biggestFragPlayer = normalizeNick(o.biggestFragPlayer);
  const pickem = String(o.pickemScore ?? '');
  if (/^\d{1,3}\/\d{1,3}$/.test(pickem)) out.pickemScore = pickem;
  return out;
}

export type HallValidation = { ok: true; entry: HallEntry } | { ok: false; error: string };

// accountNick: o nick da CONTA (O1-10) — quando existe, vence o body.player.
export function sanitizeHallEntry(body: Record<string, unknown>, accountNick = ''): HallValidation {
  const teamName = text(body.teamName, 40);
  const placement = String(body.placement ?? '');
  const champion = text(body.champion, 60);
  if (!teamName || !placement || !champion) return { ok: false, error: 'campos obrigatórios faltando' };
  if (!HALL_PLACEMENTS.has(placement)) return { ok: false, error: 'colocação inválida' };
  const bodyPlayer = text(body.player, 24);
  const player = normalizeNick(accountNick) || (bodyPlayer && !hasBlockedTerm(bodyPlayer) ? bodyPlayer : '') || 'anônimo';
  if (hasBlockedTerm(teamName) || hasBlockedTerm(champion)) return { ok: false, error: 'Nome não permitido no Hall da Fama.' };
  const mvp = text(body.mvp, 40);
  const roster = sanitizeRoster(body.roster);
  const records = sanitizeRecords(body.records);
  if (Buffer.byteLength(JSON.stringify(roster)) > HALL_JSON_MAX_BYTES || Buffer.byteLength(JSON.stringify(records)) > HALL_JSON_MAX_BYTES) {
    return { ok: false, error: 'registro grande demais' };
  }
  return {
    ok: true,
    entry: {
      player,
      teamName,
      pool: body.pool === 'br' ? 'br' : 'world',
      placement,
      champion,
      mvp: hasBlockedTerm(mvp) ? '' : mvp,
      season: Math.max(1, Math.min(99, Math.floor(Number(body.season) || 1))),
      roster,
      records,
    },
  };
}
