// [F1] Migração ÚNICA do save local pro inventário do servidor (ação
// `ultImport` em /api/ultimate-economy). Decisão do dono: aceita o local UMA
// última vez, por conta; depois disso só o servidor cria carta.
//
// Regras (nunca confia no cliente):
//   - 1× por conta: coluna rtm_ult_wallet.imported_at + ledger idempotente com
//     op_id `import:<email>` (replay não re-aplica);
//   - só entra carta com card_key do catálogo do servidor (qualquer mês do
//     snapshot) e cardId ainda livre na coleção do servidor;
//   - boost clampado 0..EVO_MAX, `ed` inteiro 1..99, `style` só da allowlist;
//   - teto de sanidade: total de cartas e teto por raridade; o excedente é
//     RECUSADO (na ordem do payload) e logado no meta do ledger e
//     no console;
//   - créditos: sobe o saldo até min(local, IMPORT_MAX_CREDITS), nunca desce.
import { applyUltTransaction, type SqlTag, type UltCardOp } from './ultimate-economy.js';
import { SQUAD_EVO_MAX } from './ultimate-squad.js';
import { STYLES } from '../src/engine/ultimate/traits.js';

export const IMPORT_MAX_CARDS = 400;
export const IMPORT_MAX_CREDITS = 50_000;
// teto por raridade (o resto da coleção só conta no total). Valores folgados
// pra um jogador dedicado, mas impossíveis de bater com save editado em massa.
export const IMPORT_RARITY_CAP: Record<string, number> = {
  histIcon: 3,
  icon: 6,
  major: 8,
  tots: 10,
  promo: 12,
  totw: 12,
  legendary: 20,
  elite: 40,
};
const STYLE_IDS = new Set<string>(STYLES.map((s) => s.id));

export interface ImportCardInfo { rarity: string }
export type ImportCardLookup = (cardKey: string) => ImportCardInfo | null | undefined;

export type ImportReject = { cardId: string; cardKey: string; reason: 'invalid' | 'unknown_card' | 'duplicate' | 'already_on_server' | 'cap_total' | 'cap_rarity' };

export interface ImportPlan {
  cards: UltCardOp[];
  creditsTarget: number;
  rejected: ImportReject[];
}

export type ImportResult =
  | { ok: true; already: true; credits: number }
  | { ok: true; already: false; imported: number; rejected: number; credits: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Núcleo PURO: decide o que entra a partir do payload cru do cliente.
export function planImport(raw: unknown, serverCardIds: Set<string>, lookup: ImportCardLookup): ImportPlan {
  const body = isObj(raw) ? raw : {};
  const list = Array.isArray(body.cards) ? body.cards : [];
  const rejected: ImportReject[] = [];
  const cards: UltCardOp[] = [];
  const seen = new Set<string>();
  const perRarity = new Map<string, number>();
  for (const entry of list) {
    const c = isObj(entry) ? entry : {};
    const cardId = typeof c.id === 'string' ? c.id.trim() : '';
    const cardKey = typeof c.cardKey === 'string' ? c.cardKey.slice(0, 160) : '';
    if (!cardId || cardId.length > 80 || !cardKey) { rejected.push({ cardId, cardKey, reason: 'invalid' }); continue; }
    if (seen.has(cardId)) { rejected.push({ cardId, cardKey, reason: 'duplicate' }); continue; }
    seen.add(cardId);
    if (serverCardIds.has(cardId)) { rejected.push({ cardId, cardKey, reason: 'already_on_server' }); continue; }
    const info = lookup(cardKey);
    if (!info) { rejected.push({ cardId, cardKey, reason: 'unknown_card' }); continue; }
    if (cards.length >= IMPORT_MAX_CARDS) { rejected.push({ cardId, cardKey, reason: 'cap_total' }); continue; }
    const cap = IMPORT_RARITY_CAP[info.rarity];
    const n = perRarity.get(info.rarity) ?? 0;
    if (cap != null && n >= cap) { rejected.push({ cardId, cardKey, reason: 'cap_rarity' }); continue; }
    perRarity.set(info.rarity, n + 1);
    const meta: Record<string, unknown> = { acquiredVia: 'import' };
    const boost = Math.floor(Number(c.boost));
    if (Number.isFinite(boost) && boost > 0) meta.boost = Math.min(SQUAD_EVO_MAX, boost);
    const ed = Number(c.ed);
    if (Number.isInteger(ed) && ed >= 1 && ed <= 99) meta.ed = ed;
    if (typeof c.style === 'string' && STYLE_IDS.has(c.style)) meta.style = c.style;
    cards.push({ op: 'add', cardId, cardKey, meta });
  }
  const localCredits = Math.trunc(Number(body.credits));
  const creditsTarget = Number.isFinite(localCredits) ? Math.max(0, Math.min(IMPORT_MAX_CREDITS, localCredits)) : 0;
  return { cards, creditsTarget, rejected };
}

export function importOpId(email: string): string {
  return `import:${email}`;
}

// Aplica a migração. Chamar de novo depois de importada devolve already=true.
export async function importLocalCollection(
  sql: SqlTag,
  email: string,
  raw: unknown,
  lookup: ImportCardLookup,
  log: (msg: string) => void = (m) => console.warn(m),
): Promise<ImportResult> {
  const mark = await sql`SELECT imported_at, credits FROM rtm_ult_wallet WHERE email=${email}`;
  if (mark.length && mark[0].imported_at != null) return { ok: true, already: true, credits: Number(mark[0].credits ?? 0) };
  const serverCredits = mark.length ? Number(mark[0].credits ?? 0) : 0;
  const owned = await sql`SELECT card_id FROM rtm_ult_cards WHERE email=${email}`;
  const plan = planImport(raw, new Set(owned.map((r) => String(r.card_id ?? ''))), lookup);
  const creditsDelta = Math.max(0, plan.creditsTarget - serverCredits);
  const capped = plan.rejected.filter((r) => r.reason === 'cap_total' || r.reason === 'cap_rarity' || r.reason === 'unknown_card');
  if (capped.length) {
    log(`[ultImport] ${email}: ${capped.length} carta(s) recusada(s) (${capped.slice(0, 10).map((r) => `${r.cardKey}:${r.reason}`).join(', ')})`);
  }
  const r = await applyUltTransaction(sql, email, {
    opId: importOpId(email),
    kind: 'grant',
    creditsDelta,
    cards: plan.cards,
    meta: {
      source: 'ultImport',
      accepted: plan.cards.length,
      rejected: plan.rejected.length,
      rejectedSample: capped.slice(0, 20).map((x) => ({ k: x.cardKey, r: x.reason })),
      localCreditsCapped: plan.creditsTarget,
    },
  });
  await sql`INSERT INTO rtm_ult_wallet (email, imported_at) VALUES (${email}, now())
            ON CONFLICT (email) DO UPDATE SET imported_at = COALESCE(rtm_ult_wallet.imported_at, now())`;
  const credits = r.credits;
  if (r.ok && r.replayed) return { ok: true, already: true, credits };
  return { ok: true, already: false, imported: plan.cards.length, rejected: plan.rejected.length, credits };
}
