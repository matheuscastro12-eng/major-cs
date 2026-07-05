// CRM de contas pagas (admin). Lista contas, concede/remove acesso vitalício e
// consulta o pagamento no Stripe por e-mail. Protegido pela senha de admin
// (env ADMIN_PASSWORD), mesmo padrão do api/beta.ts.
// Ações (POST body.action): list | grant | revoke | stripe.
import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync } from 'node:crypto';
import { accountReference, cleanEnv, findPaidCheckoutForEmail, normalizeEmail, stripeClient } from '../server/payments.js';

// mesmo formato "salt:hash" (scrypt) do api/account.ts, pro login validar igual.
function hashPw(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }

// mesmo teto da Edição Fundador usado em api/account.ts
const FOUNDER_LIMIT = Number(cleanEnv(process.env.FOUNDER_LIMIT) || '500') || 500;

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const dbUrl = cleanEnv(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }

  // auth admin (mesma senha do CRM de times)
  const adminPass = cleanEnv(process.env.ADMIN_PASSWORD);
  if (!adminPass || String(body.password ?? '').trim() !== adminPass) { res.status(401).json({ ok: false }); return; }

  const sql = neon(dbUrl);
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS founder_no INT`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS payment_method TEXT`,
    sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_coin_orders (correlation_id TEXT PRIMARY KEY, email TEXT NOT NULL, tier TEXT NOT NULL, coins INT NOT NULL, cents INT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ)`,
    sql`ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'pix'`,
    // mesma DDL do api/ranking.ts — garante a tabela mesmo se o ranking nunca rodou nesta instância
    sql`CREATE TABLE IF NOT EXISTS rtm_match_reports (code TEXT, email TEXT, nick TEXT, won BOOLEAN NOT NULL, status TEXT DEFAULT 'pending', reported_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (code, email))`,
  ]);

  const action = String(body.action ?? '');
  const email = normalizeEmail(String(body.email ?? ''));
  const emailValid = /\S+@\S+\.\S+/.test(email);

  if (action === 'list') {
    const q = String(body.query ?? '').trim().toLowerCase();
    const like = `%${q}%`;
    const accounts = q
      ? await sql`SELECT email, nick, paid, is_founder, founder_no, created_at, (stripe_ref IS NOT NULL) AS has_ref FROM rtm_accounts WHERE lower(email) LIKE ${like} OR lower(coalesce(nick,'')) LIKE ${like} ORDER BY paid DESC, created_at DESC LIMIT 200`
      : await sql`SELECT email, nick, paid, is_founder, founder_no, created_at, (stripe_ref IS NOT NULL) AS has_ref FROM rtm_accounts ORDER BY paid DESC, created_at DESC LIMIT 200`;
    // e-mails pagos que ainda não viraram conta (pagou antes de cadastrar)
    const orphanPaid = await sql`SELECT p.email, p.created_at FROM rtm_paid_emails p WHERE NOT EXISTS (SELECT 1 FROM rtm_accounts a WHERE a.email = p.email) ORDER BY p.created_at DESC LIMIT 200`;
    const counts = await sql`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE paid)::int AS paid,
        count(*) FILTER (WHERE is_founder)::int AS founders,
        count(*) FILTER (WHERE stripe_ref IS NOT NULL)::int AS with_ref,
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7,
        count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30,
        count(*) FILTER (WHERE paid AND created_at > now() - interval '30 days')::int AS paid30
      FROM rtm_accounts`;
    const orphanCount = await sql`SELECT count(*)::int AS n FROM rtm_paid_emails p WHERE NOT EXISTS (SELECT 1 FROM rtm_accounts a WHERE a.email = p.email)`;
    // série dos últimos 30 dias (cadastros x vendas) pro gráfico de tendência do CRM.
    // custo fixo: generate_series de 30 dias contra 2 CTEs já filtradas na mesma janela.
    const trend = await sql`
      WITH days AS (
        SELECT generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day')::date AS day
      ),
      signups AS (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS n
        FROM rtm_accounts WHERE created_at > now() - interval '30 days' GROUP BY 1
      ),
      sales AS (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS n
        FROM rtm_paid_emails WHERE created_at > now() - interval '30 days' GROUP BY 1
      )
      SELECT d.day, COALESCE(s.n,0)::int AS signups, COALESCE(p.n,0)::int AS sales
      FROM days d LEFT JOIN signups s ON s.day = d.day LEFT JOIN sales p ON p.day = d.day
      ORDER BY d.day`;
    res.status(200).json({
      accounts: accounts.map((a) => ({ email: String(a.email), nick: a.nick ? String(a.nick) : null, paid: !!a.paid, isFounder: !!a.is_founder, founderNo: a.founder_no != null ? Number(a.founder_no) : null, created_at: a.created_at, hasRef: !!a.has_ref })),
      orphanPaid: orphanPaid.map((p) => ({ email: String(p.email), created_at: p.created_at })),
      total: counts[0]?.total ?? 0, paidTotal: counts[0]?.paid ?? 0, foundersTotal: counts[0]?.founders ?? 0, founderLimit: FOUNDER_LIMIT,
      withRefTotal: counts[0]?.with_ref ?? 0,
      new7: counts[0]?.new7 ?? 0, new30: counts[0]?.new30 ?? 0, paid30: counts[0]?.paid30 ?? 0,
      orphanTotal: orphanCount[0]?.n ?? 0,
      trend: trend.map((r) => ({ day: String(r.day), signups: Number(r.signups), sales: Number(r.sales) })),
    });
    return;
  }

  if (action === 'grant') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    await sql.transaction([
      sql`INSERT INTO rtm_paid_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`,
      // se houver cadastro pendente, promove em conta paga
      sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref)
          SELECT email, nick, pass_hash, true, ${accountReference(email)} FROM rtm_pending_signups WHERE email=${email}
          ON CONFLICT (email) DO UPDATE SET paid=true`,
      sql`UPDATE rtm_accounts SET paid=true, payment_method=COALESCE(payment_method, 'admin') WHERE email=${email}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
    ]);
    // Edição Fundador: conceder acesso também atribui número de fundador (até o teto).
    await sql`UPDATE rtm_accounts SET is_founder=true,
        founder_no=(SELECT COALESCE(MAX(founder_no),0)+1 FROM rtm_accounts WHERE is_founder)
      WHERE email=${email} AND paid=true AND is_founder=false
        AND (SELECT count(*) FROM rtm_accounts WHERE is_founder) < ${FOUNDER_LIMIT}`;
    const hasAccount = await sql`SELECT 1 FROM rtm_accounts WHERE email=${email}`;
    res.status(200).json({ ok: true, email, applied: hasAccount.length > 0 });
    return;
  }

  if (action === 'revoke') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    await sql.transaction([
      sql`DELETE FROM rtm_paid_emails WHERE email=${email}`,
      sql`UPDATE rtm_accounts SET paid=false WHERE email=${email}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
    ]);
    res.status(200).json({ ok: true, email });
    return;
  }

  // define/reseta a senha de um usuário (suporte: quem pagou e esqueceu a senha).
  // O admin digita a nova senha no painel; aqui ela é HASHEADA (scrypt) e gravada.
  if (action === 'setpassword') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    const newPass = String(body.newPassword ?? '');
    if (newPass.length < 6) { res.status(400).json({ error: 'senha precisa de ao menos 6 caracteres' }); return; }
    const hash = hashPw(newPass);
    const upd = await sql`UPDATE rtm_accounts SET pass_hash=${hash} WHERE email=${email} RETURNING email`;
    // se ainda for só cadastro pendente (pagou mas conta não nasceu), atualiza lá também
    await sql`UPDATE rtm_pending_signups SET pass_hash=${hash} WHERE email=${email}`;
    res.status(200).json({ ok: true, email, applied: upd.length > 0 });
    return;
  }

  // consulta o pagamento real no Stripe por e-mail
  if (action === 'stripe') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    try {
      const session = await findPaidCheckoutForEmail(stripeClient(), email);
      if (!session) { res.status(200).json({ found: false }); return; }
      res.status(200).json({
        found: true,
        sessionId: session.id,
        amount: session.amount_total ?? null,
        currency: session.currency ?? null,
        created: session.created ?? null,
        paymentStatus: session.payment_status ?? null,
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'Stripe indisponível' });
    }
    return;
  }

  // finance: métricas de receita — contas vitalícias por método de pagamento +
  // compras de coins do Ultimate (total, por método, por tier, recentes, tendência).
  if (action === 'finance') {    const lifeCounts = await sql`SELECT count(*) FILTER (WHERE paid)::int AS paid, count(*) FILTER (WHERE is_founder)::int AS founders, count(*)::int AS total FROM rtm_accounts`;
    // método da conta vitalícia. Legado sem método: se houver sessão do Stripe, é 'stripe'; senão 'desconhecido'.
    const lifeByMethod = await sql`
      SELECT COALESCE(a.payment_method,
               CASE WHEN EXISTS (SELECT 1 FROM rtm_payment_sessions s WHERE s.email = a.email) THEN 'stripe' ELSE 'desconhecido' END) AS method,
             count(*)::int AS n
      FROM rtm_accounts a WHERE a.paid GROUP BY 1 ORDER BY n DESC`;
    const coinSummary = await sql`
      SELECT
        count(*) FILTER (WHERE status IN ('paid', 'claimed'))::int AS paid_orders,
        COALESCE(sum(coins) FILTER (WHERE status IN ('paid', 'claimed')), 0)::bigint AS coins_sold,
        COALESCE(sum(cents) FILTER (WHERE status IN ('paid', 'claimed')), 0)::bigint AS revenue_cents,
        count(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
        count(DISTINCT email) FILTER (WHERE status IN ('paid', 'claimed'))::int AS buyers
      FROM rtm_coin_orders`;
    const coinByMethod = await sql`
      SELECT COALESCE(method, 'pix') AS method, count(*)::int AS orders,
             COALESCE(sum(coins), 0)::bigint AS coins, COALESCE(sum(cents), 0)::bigint AS cents
      FROM rtm_coin_orders WHERE status IN ('paid', 'claimed') GROUP BY 1 ORDER BY cents DESC`;
    const coinByTier = await sql`
      SELECT tier, count(*)::int AS orders,
             COALESCE(sum(coins), 0)::bigint AS coins, COALESCE(sum(cents), 0)::bigint AS cents
      FROM rtm_coin_orders WHERE status IN ('paid', 'claimed') GROUP BY 1 ORDER BY cents DESC`;
    const coinRecent = await sql`
      SELECT email, tier, coins, cents, COALESCE(method, 'pix') AS method, status, COALESCE(paid_at, created_at) AS at
      FROM rtm_coin_orders WHERE status IN ('paid', 'claimed') ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 25`;
    const coinTrend = await sql`
      WITH days AS (
        SELECT generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day')::date AS day
      ),
      orders AS (
        SELECT date_trunc('day', COALESCE(paid_at, created_at))::date AS day, count(*)::int AS n, COALESCE(sum(cents), 0)::bigint AS cents
        FROM rtm_coin_orders WHERE status IN ('paid', 'claimed') AND COALESCE(paid_at, created_at) > now() - interval '30 days' GROUP BY 1
      )
      SELECT d.day, COALESCE(o.n, 0)::int AS orders, COALESCE(o.cents, 0)::bigint AS cents
      FROM days d LEFT JOIN orders o ON o.day = d.day ORDER BY d.day`;

    const paidTotal = lifeCounts[0]?.paid ?? 0;
    res.status(200).json({
      lifetime: {
        paid: paidTotal,
        founders: lifeCounts[0]?.founders ?? 0,
        total: lifeCounts[0]?.total ?? 0,
        revenueCents: Number(paidTotal) * 2000, // conta vitalícia = R$20
        byMethod: lifeByMethod.map((r) => ({ method: String(r.method), n: Number(r.n) })),
      },
      coins: {
        paidOrders: Number(coinSummary[0]?.paid_orders ?? 0),
        coinsSold: Number(coinSummary[0]?.coins_sold ?? 0),
        revenueCents: Number(coinSummary[0]?.revenue_cents ?? 0),
        pendingOrders: Number(coinSummary[0]?.pending_orders ?? 0),
        buyers: Number(coinSummary[0]?.buyers ?? 0),
        byMethod: coinByMethod.map((r) => ({ method: String(r.method), orders: Number(r.orders), coins: Number(r.coins), cents: Number(r.cents) })),
        byTier: coinByTier.map((r) => ({ tier: String(r.tier), orders: Number(r.orders), coins: Number(r.coins), cents: Number(r.cents) })),
        recent: coinRecent.map((r) => ({ email: String(r.email), tier: String(r.tier), coins: Number(r.coins), cents: Number(r.cents), method: String(r.method), status: String(r.status), at: r.at })),
        trend: coinTrend.map((r) => ({ day: String(r.day), orders: Number(r.orders), cents: Number(r.cents) })),
      },
    });
    return;
  }

  // revenue: série diária unificada de receita (60 dias) pro CRM /admin/receita.
  // Cada dia traz: vendas de vitalícia POR MÉTODO (pix/stripe/outro/admin),
  // pedidos pagos de coins+passe (rtm_coin_orders) com centavos por método e por
  // produto, e visitantes únicos (events type='visit'). A API devolve os dados
  // CRUS por dia — somas de janelas (7d/30d) e a previsão são calculadas no
  // cliente, mantendo esta action burra e reutilizável.
  //
  // Sinais usados:
  // - Vitalícia: rtm_paid_emails.created_at é a DATA da venda (o webhook insere
  //   na hora do pagamento). O MÉTODO vem de rtm_accounts.payment_method
  //   ('stripe' via stripe-webhook, 'pix' via woovi-webhook, 'admin' via grant).
  //   Legado sem método: se existe sessão em rtm_payment_sessions → 'stripe';
  //   senão 'desconhecido' (vendas antes da coluna payment_method existir).
  //   Caveat: não há VALOR por venda de vitalícia gravado — o preço é fixo
  //   (R$ 20,00 = 2000 cents), então o cliente multiplica contagem × preço.
  //   Contas 'admin' (concedidas) contam como conta, mas receita zero.
  // - Coins + Passe: rtm_coin_orders com status paid/claimed; dia = paid_at
  //   (fallback created_at); método 'pix'/'stripe'; tier 'pass-s<N>' = passe.
  // - Visitantes: events (type='visit', sid distinto/dia) — mesma fonte do
  //   api/metrics.ts, estendida de 14 pra 60 dias, fuso America/Sao_Paulo.
  if (action === 'revenue') {
    const VIT_PRICE_CENTS = 2000; // conta vitalícia = R$ 20,00 (preço fixo, sem registro por venda)
    // série 60d: vitalícias por método × pedidos (coins/passe) por método/produto,
    // tudo num único round-trip com generate_series + 2 CTEs pré-agregadas.
    const days = await sql`
      WITH days AS (
        SELECT generate_series((now() AT TIME ZONE 'America/Sao_Paulo')::date - 59, (now() AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day')::date AS day
      ),
      vit AS (
        SELECT (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
               COALESCE(a.payment_method,
                 CASE WHEN EXISTS (SELECT 1 FROM rtm_payment_sessions s WHERE s.email = p.email) THEN 'stripe' ELSE 'desconhecido' END) AS method
        FROM rtm_paid_emails p LEFT JOIN rtm_accounts a ON a.email = p.email
        WHERE p.created_at > now() - interval '61 days'
      ),
      vitd AS (
        SELECT day,
          count(*) FILTER (WHERE method = 'pix')::int AS vit_pix,
          count(*) FILTER (WHERE method = 'stripe')::int AS vit_stripe,
          count(*) FILTER (WHERE method NOT IN ('pix','stripe','admin'))::int AS vit_other,
          count(*) FILTER (WHERE method = 'admin')::int AS vit_admin
        FROM vit GROUP BY 1
      ),
      ord AS (
        SELECT (COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS day,
               COALESCE(o.method, 'pix') AS method, o.cents,
               CASE WHEN o.tier LIKE 'pass-%' THEN 'passe' ELSE 'coins' END AS product
        FROM rtm_coin_orders o
        WHERE o.status IN ('paid','claimed') AND COALESCE(o.paid_at, o.created_at) > now() - interval '61 days'
      ),
      ordd AS (
        SELECT day, count(*)::int AS orders,
          COALESCE(sum(cents) FILTER (WHERE method = 'pix'), 0)::bigint AS ord_pix_cents,
          COALESCE(sum(cents) FILTER (WHERE method <> 'pix'), 0)::bigint AS ord_stripe_cents,
          COALESCE(sum(cents) FILTER (WHERE product = 'coins'), 0)::bigint AS coins_cents,
          COALESCE(sum(cents) FILTER (WHERE product = 'passe'), 0)::bigint AS passe_cents
        FROM ord GROUP BY 1
      )
      SELECT d.day,
        COALESCE(v.vit_pix, 0)::int AS vit_pix, COALESCE(v.vit_stripe, 0)::int AS vit_stripe,
        COALESCE(v.vit_other, 0)::int AS vit_other, COALESCE(v.vit_admin, 0)::int AS vit_admin,
        COALESCE(o.orders, 0)::int AS orders,
        COALESCE(o.ord_pix_cents, 0)::bigint AS ord_pix_cents, COALESCE(o.ord_stripe_cents, 0)::bigint AS ord_stripe_cents,
        COALESCE(o.coins_cents, 0)::bigint AS coins_cents, COALESCE(o.passe_cents, 0)::bigint AS passe_cents
      FROM days d LEFT JOIN vitd v ON v.day = d.day LEFT JOIN ordd o ON o.day = d.day
      ORDER BY d.day`;
    // visitantes únicos/dia (60d). Query separada com try/catch: a tabela events
    // pertence à telemetria (api/track.ts) e pode não existir numa instância nova
    // — o funil fica indisponível, mas a receita continua funcionando.
    let visitors: { day: string; visitors: number }[] = [];
    let visitorsAvailable = true;
    try {
      const vis = await sql`
        SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, count(DISTINCT sid)::int AS visitors
        FROM events WHERE type = 'visit' AND created_at > now() - interval '61 days'
        GROUP BY 1 ORDER BY 1`;
      visitors = vis.map((r) => ({ day: String(r.day).slice(0, 10), visitors: Number(r.visitors) }));
    } catch { visitorsAvailable = false; }
    const visByDay = new Map(visitors.map((v) => [v.day, v.visitors]));
    // agregados all-time (a série de 60d não cobre o histórico completo)
    const vitAll = await sql`
      SELECT COALESCE(a.payment_method,
               CASE WHEN EXISTS (SELECT 1 FROM rtm_payment_sessions s WHERE s.email = p.email) THEN 'stripe' ELSE 'desconhecido' END) AS method,
             count(*)::int AS n
      FROM rtm_paid_emails p LEFT JOIN rtm_accounts a ON a.email = p.email GROUP BY 1`;
    const ordAll = await sql`
      SELECT COALESCE(method, 'pix') AS method,
             CASE WHEN tier LIKE 'pass-%' THEN 'passe' ELSE 'coins' END AS product,
             count(*)::int AS orders, COALESCE(sum(cents), 0)::bigint AS cents
      FROM rtm_coin_orders WHERE status IN ('paid','claimed') GROUP BY 1, 2`;
    res.status(200).json({
      vitPriceCents: VIT_PRICE_CENTS,
      visitorsAvailable,
      days: days.map((r) => {
        const day = String(r.day).slice(0, 10);
        return {
          day,
          vitPix: Number(r.vit_pix), vitStripe: Number(r.vit_stripe), vitOther: Number(r.vit_other), vitAdmin: Number(r.vit_admin),
          orders: Number(r.orders),
          ordPixCents: Number(r.ord_pix_cents), ordStripeCents: Number(r.ord_stripe_cents),
          coinsCents: Number(r.coins_cents), passeCents: Number(r.passe_cents),
          visitors: visByDay.get(day) ?? 0,
        };
      }),
      allTime: {
        vitByMethod: vitAll.map((r) => ({ method: String(r.method), n: Number(r.n) })),
        orders: ordAll.map((r) => ({ method: String(r.method), product: String(r.product), orders: Number(r.orders), cents: Number(r.cents) })),
      },
    });
    return;
  }

  // integrity: saúde do ranking PvP (rtm_match_reports). `conflict` = os dois
  // jogadores reclamaram o MESMO resultado (tentativa de fraude ou bug) — a
  // partida não conta. Reincidência de conflito é o sinal forte de fraude.
  if (action === 'integrity') {
    // contagens por status (total e últimos 7 dias)
    const byStatus = await sql`
      SELECT status, count(*)::int AS total,
             count(*) FILTER (WHERE reported_at > now() - interval '7 days')::int AS last7
      FROM rtm_match_reports GROUP BY status`;
    // partidas (codes distintos) totais x em conflito, pra % de partidas sujas
    const matches = await sql`
      SELECT count(DISTINCT code)::int AS total,
             count(DISTINCT code) FILTER (WHERE status = 'conflict')::int AS conflicts,
             count(DISTINCT code) FILTER (WHERE reported_at > now() - interval '7 days')::int AS total7,
             count(DISTINCT code) FILTER (WHERE status = 'conflict' AND reported_at > now() - interval '7 days')::int AS conflicts7
      FROM rtm_match_reports`;
    // reports 'pending' velhos (>1h): já passaram da carência do solo-apply e
    // ninguém os resolveu — órfãos, métrica de saúde do pareamento.
    const stale = await sql`SELECT count(*)::int AS n FROM rtm_match_reports WHERE status = 'pending' AND reported_at < now() - interval '1 hour'`;
    // últimas ~20 partidas em conflito, com os 2 reports de cada uma
    const conflictRows = await sql`
      SELECT r.code, r.email, r.nick, r.won, r.reported_at, c.last
      FROM rtm_match_reports r
      JOIN (
        SELECT code, max(reported_at) AS last FROM rtm_match_reports
        WHERE status = 'conflict' GROUP BY code ORDER BY last DESC LIMIT 20
      ) c ON c.code = r.code
      WHERE r.status = 'conflict'
      ORDER BY c.last DESC, r.code, r.reported_at`;
    // top jogadores por nº de conflitos (reincidência), com partidas aplicadas de contraste
    const offenders = await sql`
      SELECT email, max(nick) AS nick,
             count(*) FILTER (WHERE status = 'conflict')::int AS conflicts,
             count(*) FILTER (WHERE status IN ('applied', 'applied-solo'))::int AS applied,
             max(reported_at) FILTER (WHERE status = 'conflict') AS last_conflict
      FROM rtm_match_reports GROUP BY email
      HAVING count(*) FILTER (WHERE status = 'conflict') > 0
      ORDER BY 3 DESC, 5 DESC LIMIT 10`;

    // agrupa os reports de conflito por partida (code), preservando a ordem (mais recente primeiro)
    const byCode = new Map<string, { code: string; at: string; reports: { email: string; nick: string; won: boolean; at: string }[] }>();
    for (const r of conflictRows) {
      const code = String(r.code);
      const entry = byCode.get(code) ?? { code, at: String(r.last), reports: [] };
      entry.reports.push({ email: String(r.email), nick: String(r.nick ?? 'manager'), won: !!r.won, at: String(r.reported_at) });
      byCode.set(code, entry);
    }

    res.status(200).json({
      byStatus: byStatus.map((r) => ({ status: String(r.status ?? 'pending'), total: Number(r.total), last7: Number(r.last7) })),
      matches: {
        total: Number(matches[0]?.total ?? 0),
        conflicts: Number(matches[0]?.conflicts ?? 0),
        total7: Number(matches[0]?.total7 ?? 0),
        conflicts7: Number(matches[0]?.conflicts7 ?? 0),
      },
      stalePending: Number(stale[0]?.n ?? 0),
      conflicts: [...byCode.values()],
      offenders: offenders.map((r) => ({
        email: String(r.email), nick: String(r.nick ?? 'manager'),
        conflicts: Number(r.conflicts), applied: Number(r.applied),
        lastConflict: r.last_conflict ? String(r.last_conflict) : null,
      })),
    });
    return;
  }

  res.status(400).json({ error: 'ação inválida' });
}
