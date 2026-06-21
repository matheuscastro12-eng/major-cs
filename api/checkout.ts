// Cria uma sessão de Checkout do Stripe pra conta vitalícia (R$20, pagamento
// único). Sem SDK: chama a REST API do Stripe via fetch. Requer a env
// STRIPE_SECRET_KEY (a chave secreta do Stripe). Pix/cartão são habilitados no
// painel do Stripe; o Checkout mostra os métodos ativos automaticamente.
interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const PRICE_BRL_CENTS = 2000; // R$20,00

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
  const key = clean(process.env.STRIPE_SECRET_KEY);
  if (!key) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY não configurada' });
    return;
  }
  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const email = String(body.email ?? '').trim().slice(0, 200);
  const nick = String(body.nick ?? '').trim().slice(0, 40);
  const origin = String(body.origin ?? '').trim().replace(/\/$/, '') || 'https://roadtomajor.com.br';
  if (!/\S+@\S+\.\S+/.test(email)) {
    res.status(400).json({ error: 'email inválido' });
    return;
  }

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('customer_email', email);
  form.set('client_reference_id', nick || email);
  form.set('metadata[nick]', nick);
  form.set('metadata[product]', 'lifetime');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'brl');
  form.set('line_items[0][price_data][unit_amount]', String(PRICE_BRL_CENTS));
  form.set('line_items[0][price_data][product_data][name]', 'Road to Major — Conta vitalícia');
  form.set('line_items[0][price_data][product_data][description]', 'Save na nuvem + ranking salvo no online. Pagamento único, acesso pra sempre.');
  form.set('success_url', `${origin}/jogar?conta=ok&cs={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${origin}/?conta=cancel`);

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = (await r.json()) as { url?: string; error?: { message?: string } };
    if (!r.ok || !data.url) {
      res.status(502).json({ error: data.error?.message ?? 'falha no Stripe' });
      return;
    }
    res.status(200).json({ url: data.url });
  } catch {
    res.status(502).json({ error: 'rede' });
  }
}
