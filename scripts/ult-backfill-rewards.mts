// [UT-REW] Backfill dos prêmios de SBC que ficaram só no aparelho + contas
// que nunca rodaram a migração (ultImport). DRY-RUN POR PADRÃO (só SELECT).
//
//   DATABASE_URL=... npx tsx scripts/ult-backfill-rewards.mts            # dry-run
//   DATABASE_URL=... npx tsx scripts/ult-backfill-rewards.mts --apply    # NÃO rodar sem ok do Matheus
//
// O que o --apply faria: para cada SBC antiga justificada pelo ledger
// (justifiedSbcSlots), uma tx idempotente `heal:sbc:<ledgerId>` com UMA carta
// da raridade do prêmio sorteada pelo servidor (id `sbc_bf_<ledgerId>`).
// ATENÇÃO: a carta sorteada aqui NÃO é a mesma do aparelho; o caminho
// preferido é a cura na ranqueada (que adota a cópia do aparelho). Rodar o
// --apply consome as vagas e a cópia do aparelho continua só local.
// Contas sem import: só contagem (o import precisa do save do aparelho).
import { neon } from '@neondatabase/serverless';
import { buildServerCatalog, serverCardByKeyAnyMonth } from '../server/ultimate-pack.js';
import { healOpId, justifiedSbcSlots, type LedgerRow } from '../server/ultimate-rewards.js';
import { applyUltTransaction, type SqlTag } from '../server/ultimate-economy.js';

const apply = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }
const sql = neon(url) as unknown as SqlTag;
const lookup = (k: string) => serverCardByKeyAnyMonth(k) ?? null;

const rows = await sql`SELECT id, email, op_id, kind, cards, meta FROM rtm_ult_ledger
  WHERE email IN (SELECT DISTINCT email FROM rtm_ult_ledger WHERE kind='sbc') ORDER BY email, id`;
const byEmail = new Map<string, LedgerRow[]>();
for (const r of rows) {
  const list = byEmail.get(String(r.email)) ?? [];
  list.push({ id: Number(r.id), opId: String(r.op_id), kind: String(r.kind), meta: (r.meta ?? {}) as Record<string, unknown>,
    cards: (Array.isArray(r.cards) ? r.cards : []).map((c: Record<string, unknown>) => ({ op: String(c.op), cardId: String(c.cardId), cardKey: c.cardKey == null ? undefined : String(c.cardKey) })) });
  byEmail.set(String(r.email), list);
}
const per: { acct: string; slots: number; byRarity: Record<string, number> }[] = [];
let total = 0; let sbcTxs = 0;
let i = 0;
for (const [email, led] of byEmail) {
  i++;
  sbcTxs += led.filter((r) => r.kind === 'sbc').length;
  const slots = justifiedSbcSlots(led, lookup);
  if (!slots.length) continue;
  total += slots.length;
  const byRarity: Record<string, number> = {};
  for (const s of slots) byRarity[s.rarity] = (byRarity[s.rarity] ?? 0) + 1;
  per.push({ acct: `conta#${i}`, slots: slots.length, byRarity });
  if (apply) {
    const now = new Date();
    for (const s of slots) {
      const pool = buildServerCatalog(now).filter((c) => c.rarity === s.rarity);
      const c = pool[Math.floor(Math.random() * pool.length)];
      await applyUltTransaction(sql, email, { opId: healOpId(s.ledgerId), kind: 'grant', creditsDelta: 0,
        cards: [{ op: 'add', cardId: `sbc_bf_${s.ledgerId}`, cardKey: c.key, meta: { acquiredVia: 'sbc', healOf: s.ledgerId, backfill: true } }],
        meta: { source: 'backfill-sbc', ledgerId: s.ledgerId } });
    }
  }
}
const noImport = await sql`SELECT count(*)::int AS n FROM rtm_accounts a LEFT JOIN rtm_ult_wallet w USING(email) WHERE w.imported_at IS NULL`;
const noImportUlt = await sql`SELECT count(*)::int AS n FROM rtm_ult_wallet WHERE imported_at IS NULL`;
console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'dry-run',
  accountsWithSbc: byEmail.size, sbcTxs, accountsToHeal: per.length, cardsToHeal: total,
  top: per.sort((a, b) => b.slots - a.slots).slice(0, 10),
  accountsNeverImported: noImport[0].n, ultWalletsNeverImported: noImportUlt[0].n,
}, null, 2));
