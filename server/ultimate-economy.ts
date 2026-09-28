// Economia server-authoritative do Ultimate Squad (fase 1 — fundação, dormente).
// Carteira + coleção + ledger append-only no Neon, com transações idempotentes.
// O cliente HOJE guarda credits/coleção no cloud-save (falsificável); as fases
// seguintes migram o cliente pra cá. Este módulo é puro: recebe o tag `sql`.
//
// Modelo (espelha src/engine/ultimate/state.ts):
//   - coleção = cópias possuídas (OwnedCard): cada cópia tem uuid próprio (`id`)
//     e aponta pro catálogo via `cardKey`. Duplicata = OUTRA cópia com uuid
//     distinto — NÃO existe quantidade; logo PK (email, card_id) basta.
//   - credits = saldo inteiro ≥ 0 na carteira.
//
// Idempotência: cada transação carrega um op_id único por conta. O ledger tem
// UNIQUE (email, op_id); replay do mesmo op_id não re-aplica nada e devolve o
// resultado gravado. Atomicidade: advisory lock transacional por e-mail (mesmo
// padrão do coinsRestore em api/account.ts) + um único statement WITH ... que
// insere o ledger, atualiza a carteira e aplica as cartas de uma vez.

export const ULT_TX_KINDS = ['grant', 'spend', 'pack', 'quicksell', 'sbc', 'reward', 'admin', 'escrow', 'trade'] as const;
export type UltTxKind = (typeof ULT_TX_KINDS)[number];

// Kinds que SÓ o servidor grava (mercado P2P — server/ultimate-market.ts):
// 'escrow' move carta pra/da custódia da listagem; 'trade' liquida a compra.
// A rota (api/ultimate-economy.ts) REJEITA esses kinds em `tx` do cliente —
// senão qualquer um forjaria créditos "de venda".
export const ULT_TX_SERVER_ONLY_KINDS: readonly UltTxKind[] = ['escrow', 'trade'];

// [O0-02] Allowlist do que o CLIENTE pode gravar pela rota `tx`: só SAÍDAS
// (sinks). 'grant'/'reward'/'admin' viraram server-only — antes qualquer conta
// logada cunhava coins e cartas com um POST (SEGU-01/ECON-01/ENGA-M01).
//   - spend/pack/sbc: creditsDelta ≤ 0 e só op:'remove';
//   - quicksell: o valor NUNCA vem do cliente — o servidor recalcula pelo
//     card_key que ELE tem em rtm_ult_cards (applyClientUltTx).
// Crédito positivo só nasce em fluxo do servidor (coinsClaim/passClaim,
// packOpen, mercado, WL settle, eventClaim…), cada um com opId determinístico.
export const ULT_TX_CLIENT_KINDS: readonly UltTxKind[] = ['spend', 'pack', 'sbc', 'quicksell'];

export const ULT_TX_MAX_CARDS = 200;
export const ULT_TX_MAX_OP_ID = 64;

export interface UltCardOp {
  op: 'add' | 'remove';
  cardId: string; // uuid da cópia (OwnedCard.id)
  cardKey?: string; // → catálogo (obrigatório em 'add')
  meta?: Record<string, unknown>; // boost, serial, acquiredVia, ed (edição da temporada [URG-1])…
}

export interface UltTx {
  opId: string;
  kind: UltTxKind;
  creditsDelta: number;
  cards: UltCardOp[];
  meta?: Record<string, unknown>;
}

export type UltTxResult =
  | { ok: true; replayed: boolean; credits: number }
  | { ok: false; error: 'insufficient_credits'; credits: number }
  // precondição `requireOwned` falhou: alguma carta exigida já não está na
  // coleção (ex.: dois quicksell concorrentes da mesma cópia) — nada aplicado.
  | { ok: false; error: 'not_owner'; credits: number };

// Cópia que a tx EXIGE possuir no momento do apply (checado sob o lock, no
// mesmo statement que debita/credita). Usado pelo quicksell server-side: o
// crédito só sai se a carta que o gerou sai junto.
export interface UltOwnedCard { cardId: string; cardKey: string }

export interface UltLedgerEntry {
  id: number;
  opId: string;
  kind: string;
  creditsDelta: number;
  createdAt: string;
}

export interface UltStateSnapshot {
  credits: number;
  cards: { cardId: string; cardKey: string; meta: Record<string, unknown>; acquiredAt: string }[];
  ledgerTail: UltLedgerEntry[];
}

// Interface mínima do tag do @neondatabase/serverless que usamos (facilita mock).
type Row = Record<string, unknown>;
export type SqlQuery = PromiseLike<Row[]>;
export interface SqlTag {
  (strings: TemplateStringsArray, ...params: unknown[]): SqlQuery;
  transaction(queries: SqlQuery[]): Promise<Row[][]>;
}

// ---------------------------------------------------------------- validação

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Valida/normaliza o payload cru vindo do cliente. Não confia em NADA.
export function validateUltTx(raw: unknown): { ok: true; tx: UltTx } | { ok: false; error: string } {
  if (!isPlainObject(raw)) return { ok: false, error: 'tx inválida' };
  const opId = typeof raw.opId === 'string' ? raw.opId.trim() : '';
  if (!opId || opId.length > ULT_TX_MAX_OP_ID) return { ok: false, error: 'opId inválido (1..64 chars)' };
  const kind = String(raw.kind ?? '');
  if (!(ULT_TX_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'kind inválido' };
  const creditsDelta = Number(raw.creditsDelta ?? 0);
  if (!Number.isSafeInteger(creditsDelta)) return { ok: false, error: 'creditsDelta inválido' };
  const rawCards = raw.cards ?? [];
  if (!Array.isArray(rawCards)) return { ok: false, error: 'cards inválido' };
  if (rawCards.length > ULT_TX_MAX_CARDS) return { ok: false, error: `cards demais (máx ${ULT_TX_MAX_CARDS})` };
  const cards: UltCardOp[] = [];
  const seen = new Set<string>();
  for (const c of rawCards) {
    if (!isPlainObject(c)) return { ok: false, error: 'card op inválida' };
    const op = c.op === 'add' || c.op === 'remove' ? c.op : null;
    if (!op) return { ok: false, error: 'card op precisa ser add|remove' };
    const cardId = typeof c.cardId === 'string' ? c.cardId.trim() : '';
    if (!cardId || cardId.length > 80) return { ok: false, error: 'cardId inválido' };
    if (seen.has(cardId)) return { ok: false, error: 'cardId repetido na mesma tx' };
    seen.add(cardId);
    const cardKey = typeof c.cardKey === 'string' ? c.cardKey.slice(0, 160) : '';
    if (op === 'add' && !cardKey) return { ok: false, error: 'add exige cardKey' };
    const meta = isPlainObject(c.meta) ? c.meta : {};
    cards.push({ op, cardId, cardKey: cardKey || undefined, meta });
  }
  const meta = isPlainObject(raw.meta) ? raw.meta : {};
  return { ok: true, tx: { opId, kind: kind as UltTxKind, creditsDelta, cards, meta } };
}

// ------------------------------------------------------------------- schema

// DDL idempotente (padrão ensureSchema das rotas). A rota chama 1× por instância.
export function ultEconomySchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_wallet (
      email TEXT PRIMARY KEY,
      credits BIGINT NOT NULL DEFAULT 0 CHECK (credits >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_cards (
      email TEXT NOT NULL,
      card_id TEXT NOT NULL,
      card_key TEXT NOT NULL DEFAULT '',
      meta JSONB NOT NULL DEFAULT '{}',
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (email, card_id)
    )`,
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_ledger (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      op_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      credits_delta BIGINT NOT NULL DEFAULT 0,
      cards JSONB NOT NULL DEFAULT '[]',
      meta JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (email, op_id)
    )`,
    sql`CREATE INDEX IF NOT EXISTS rtm_ult_ledger_email_idx ON rtm_ult_ledger (email, id DESC)`,
    // [O0-02] congelamento de carteira suspeita (varredura manual do ledger —
    // docs/super-atualizacao/varredura-ledger.sql). NULL = ativa. Congelada
    // bloqueia mktList/mktBuy/packOpen; o jogador vê a mensagem padrão e tem 7
    // dias pra contestar. Setado/limpo SÓ à mão pelo admin (nunca pelo código).
    sql`ALTER TABLE rtm_ult_wallet ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ`,
  ];
}

// --------------------------------------------------------------- transação

// Aplica uma transação de economia de forma ATÔMICA e IDEMPOTENTE.
// - advisory lock transacional por e-mail serializa requests concorrentes;
// - um único statement WITH:
//     prior  = ledger já tem este op_id? (replay)
//     bal    = saldo atual da carteira
//     ins    = insere no ledger SÓ se não é replay E o saldo não fica negativo
//     wallet = upsert do saldo novo (só se ins aconteceu)
//     add/del= aplica as cartas (só se ins aconteceu)
// - replay: nada muda, devolve o saldo corrente com replayed=true;
// - saldo insuficiente: nada muda, devolve erro;
// - opts.requireOwned: o insert só acontece se TODAS essas cópias (card_id +
//   card_key) existirem na coleção agora — senão 'not_owner' e nada muda.
export async function applyUltTransaction(
  sql: SqlTag,
  email: string,
  tx: UltTx,
  opts?: { requireOwned?: UltOwnedCard[] },
): Promise<UltTxResult> {
  const cardsJson = JSON.stringify(tx.cards);
  const metaJson = JSON.stringify(tx.meta ?? {});
  const owned = opts?.requireOwned ?? [];
  const ownedJson = JSON.stringify(owned.map((c) => ({ cardId: c.cardId, cardKey: c.cardKey })));
  const ownedN = owned.length;
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_ult_economy'), hashtext(${email}))`,
    sql`WITH prior AS (
          SELECT id FROM rtm_ult_ledger WHERE email=${email} AND op_id=${tx.opId}
        ), bal AS (
          SELECT COALESCE((SELECT credits FROM rtm_ult_wallet WHERE email=${email}), 0)::bigint AS credits
        ), ins AS (
          INSERT INTO rtm_ult_ledger (email, op_id, kind, credits_delta, cards, meta)
          SELECT ${email}, ${tx.opId}, ${tx.kind}, ${tx.creditsDelta}, ${cardsJson}::jsonb, ${metaJson}::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM prior)
            AND (SELECT credits FROM bal) + ${tx.creditsDelta} >= 0
            AND (SELECT count(*) FROM rtm_ult_cards WHERE email=${email}
                   AND (card_id, card_key) IN (SELECT o->>'cardId', o->>'cardKey' FROM jsonb_array_elements(${ownedJson}::jsonb) o)) = ${ownedN}::int
          ON CONFLICT (email, op_id) DO NOTHING
          RETURNING id
        ), wallet AS (
          INSERT INTO rtm_ult_wallet (email, credits, updated_at)
          SELECT ${email}, (SELECT credits FROM bal) + ${tx.creditsDelta}, now()
          WHERE EXISTS (SELECT 1 FROM ins)
          ON CONFLICT (email) DO UPDATE SET credits = EXCLUDED.credits, updated_at = now()
          RETURNING credits
        ), added AS (
          INSERT INTO rtm_ult_cards (email, card_id, card_key, meta)
          SELECT ${email}, c->>'cardId', COALESCE(c->>'cardKey', ''), COALESCE(c->'meta', '{}'::jsonb)
          FROM jsonb_array_elements(${cardsJson}::jsonb) c
          WHERE (c->>'op') = 'add' AND EXISTS (SELECT 1 FROM ins)
          ON CONFLICT (email, card_id) DO NOTHING
          RETURNING card_id
        ), removed AS (
          DELETE FROM rtm_ult_cards
          WHERE email=${email} AND EXISTS (SELECT 1 FROM ins)
            AND card_id IN (
              SELECT c->>'cardId' FROM jsonb_array_elements(${cardsJson}::jsonb) c WHERE (c->>'op') = 'remove'
            )
          RETURNING card_id
        )
        SELECT
          (SELECT id FROM prior) AS prior_id,
          (SELECT id FROM ins) AS inserted_id,
          (SELECT credits FROM wallet) AS new_credits,
          (SELECT credits FROM bal) AS old_credits,
          (SELECT count(*) FROM rtm_ult_cards WHERE email=${email}
             AND (card_id, card_key) IN (SELECT o->>'cardId', o->>'cardKey' FROM jsonb_array_elements(${ownedJson}::jsonb) o)) = ${ownedN}::int AS owned_ok`,
  ]);
  const r = rows?.[0] ?? {};
  const oldCredits = Number(r.old_credits ?? 0);
  if (r.inserted_id != null) return { ok: true, replayed: false, credits: Number(r.new_credits ?? 0) };
  if (r.prior_id != null) return { ok: true, replayed: true, credits: oldCredits };
  if (r.owned_ok === false) return { ok: false, error: 'not_owner', credits: oldCredits };
  return { ok: false, error: 'insufficient_credits', credits: oldCredits };
}

// ------------------------------------------------------- tx vinda do cliente

// Regra de forma do O0-02 (sem banco): kind na allowlist do cliente, nenhuma
// carta entrando, nenhum crédito positivo fora do quicksell.
export function checkClientUltTx(tx: UltTx): { ok: true } | { ok: false; error: string } {
  if (!ULT_TX_CLIENT_KINDS.includes(tx.kind)) return { ok: false, error: 'kind reservado ao servidor' };
  if (tx.cards.some((c) => c.op === 'add')) return { ok: false, error: 'cartas só entram pelo servidor' };
  if (tx.kind === 'quicksell') {
    if (tx.creditsDelta < 0) return { ok: false, error: 'quicksell não debita' };
    if (!tx.cards.length) return { ok: false, error: 'quicksell sem carta' };
  } else if (tx.creditsDelta > 0) {
    return { ok: false, error: 'crédito positivo só pelo servidor' };
  }
  return { ok: true };
}

// valor de quick-sell de UMA cópia pelo catálogo do servidor (null = carta
// fora do catálogo → vale 0, igual ao cliente quando o índice não acha).
export type UltQuicksellValuer = (cardKey: string, isDuplicate: boolean) => number | null;

export interface UltClientTxResponse { status: number; body: Record<string, unknown> }

// Corpo da action 'tx' da rota (api/ultimate-economy.ts), extraído pra ser
// testável com o FakeDb. Nunca confia no cliente:
//   - forma (validateUltTx) + allowlist do O0-02 (checkClientUltTx);
//   - quicksell: o creditsDelta do cliente é DESCARTADO. O servidor soma o
//     valor das cópias removidas que ELE conhece (card_key de rtm_ult_cards;
//     duplicata = 2+ cópias da mesma carta na coleção do servidor, contadas em
//     ordem, igual ao sellMany do cliente) e aplica com requireOwned — o
//     crédito só sai se a carta sai no mesmo statement. Cópia que o servidor
//     não conhece (prêmio só local) sai por 0.
//   - catálogo indisponível no runtime → 503 (a fila-sombra re-tenta com o
//     MESMO op_id; nunca credita "no escuro").
export async function applyClientUltTx(
  sql: SqlTag,
  email: string,
  raw: unknown,
  loadValuer: () => Promise<UltQuicksellValuer | null>,
): Promise<UltClientTxResponse> {
  const parsed = validateUltTx(raw);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const shape = checkClientUltTx(parsed.tx);
  if (!shape.ok) return { status: 400, body: { error: shape.error } };
  let tx = parsed.tx;
  const requireOwned: UltOwnedCard[] = [];
  if (tx.kind === 'quicksell') {
    const valuer = await loadValuer();
    if (!valuer) return { status: 503, body: { error: 'catalog_unavailable' } };
    const rows = await sql`SELECT card_id, card_key FROM rtm_ult_cards WHERE email=${email}`;
    const keyOf = new Map<string, string>();
    const copies = new Map<string, number>();
    for (const r of rows) {
      const id = String(r.card_id ?? '');
      const key = String(r.card_key ?? '');
      keyOf.set(id, key);
      copies.set(key, (copies.get(key) ?? 0) + 1);
    }
    let value = 0;
    for (const c of tx.cards) {
      const key = keyOf.get(c.cardId);
      if (key == null) continue; // cópia só local: sai por 0 no servidor
      const n = copies.get(key) ?? 0;
      value += Math.max(0, Math.trunc(valuer(key, n >= 2) ?? 0));
      copies.set(key, n - 1);
      requireOwned.push({ cardId: c.cardId, cardKey: key });
    }
    tx = { ...tx, creditsDelta: value, meta: { ...(tx.meta ?? {}), clientDelta: parsed.tx.creditsDelta, valuedBy: 'server' } };
  }
  const result = await applyUltTransaction(sql, email, tx, { requireOwned });
  if (!result.ok) return { status: 409, body: { error: result.error, credits: result.credits } };
  return { status: 200, body: { ok: true, replayed: result.replayed, credits: result.credits } };
}

// ------------------------------------------------------------- congelamento

// [O0-02] Mensagem padrão ao jogador com carteira congelada (7 dias pra
// contestar). O contato vem de SUPPORT_EMAIL (decisão do dono).
export function ultFrozenMessage(supportEmail?: string): string {
  const contact = supportEmail ? `pelo e-mail ${supportEmail}` : 'pelo e-mail de suporte';
  return `Sua carteira do Ultimate está em revisão por movimentação fora do padrão. Mercado e abertura de packs ficam pausados. Se acha que é engano, fale com a gente ${contact} em até 7 dias.`;
}

// true se a carteira foi congelada pelo admin (frozen_at preenchido).
export async function isUltWalletFrozen(sql: SqlTag, email: string): Promise<boolean> {
  const rows = await sql`SELECT frozen_at FROM rtm_ult_wallet WHERE email=${email}`;
  return rows.length > 0 && rows[0].frozen_at != null;
}

// ----------------------------------------------------------------- estado

// Snapshot pro bootstrap do cliente: saldo + coleção + cauda do ledger.
export async function getUltState(sql: SqlTag, email: string, tailLimit = 20): Promise<UltStateSnapshot> {
  const limit = Math.max(1, Math.min(100, Math.trunc(tailLimit) || 20));
  const [walletRows, cardRows, ledgerRows] = await sql.transaction([
    sql`SELECT credits FROM rtm_ult_wallet WHERE email=${email}`,
    sql`SELECT card_id, card_key, meta, acquired_at FROM rtm_ult_cards WHERE email=${email} ORDER BY acquired_at, card_id`,
    sql`SELECT id, op_id, kind, credits_delta, created_at FROM rtm_ult_ledger WHERE email=${email} ORDER BY id DESC LIMIT ${limit}`,
  ]);
  return {
    credits: walletRows.length ? Number(walletRows[0].credits ?? 0) : 0,
    cards: cardRows.map((c) => ({
      cardId: String(c.card_id ?? ''),
      cardKey: String(c.card_key ?? ''),
      meta: isPlainObject(c.meta) ? c.meta : {},
      acquiredAt: String(c.acquired_at ?? ''),
    })),
    ledgerTail: ledgerRows.map((l) => ({
      id: Number(l.id ?? 0),
      opId: String(l.op_id ?? ''),
      kind: String(l.kind ?? ''),
      creditsDelta: Number(l.credits_delta ?? 0),
      createdAt: String(l.created_at ?? ''),
    })),
  };
}
