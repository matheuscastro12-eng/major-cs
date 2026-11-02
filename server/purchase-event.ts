// purchase_done: venda CONFIRMADA pelo webhook (Pix/Woovi ou cartão/Stripe),
// gravada na mesma tabela `events` do funil do cliente. Fecha o funil
// paywall_view → checkout_open → purchase_done por dia, método e produto sem
// precisar abrir o painel do Stripe ou do Woovi.
//
// Sem dado pessoal: nada de e-mail. O correlationID da vitalícia carrega o
// e-mail ("rtm-<email>-<ts>"), então vai só `ck`, um hash curto e estável do
// correlationID/sessão: liga eventos da mesma cobrança sem expor quem pagou.
//
// Telemetria NUNCA mexe no pagamento: roda depois da baixa, qualquer erro é
// engolido e o webhook responde exatamente o que responderia sem ela.
import { createHash } from 'node:crypto';

export type PurchaseProduct = 'vitalicia' | 'coins' | 'pass';

export interface Purchase {
  provider: 'woovi' | 'stripe';
  product: PurchaseProduct;
  /** valor pago em centavos de BRL, como o provedor reportou */
  cents: number;
  /** correlationID (Woovi, pedidos) ou id da sessão do Stripe (vitalícia por cartão) */
  corr: string;
  /** tier do pedido (coins p10/p15/p30, passe pass-s<N>) */
  tier?: string;
}

/** hash curto do correlationID/sessão: mesmo valor para a mesma cobrança, sem o e-mail */
export const checkoutKey = (corr: string): string => createHash('sha256').update(corr).digest('hex').slice(0, 16);

/** produto de um pedido de rtm_coin_orders pelo tier */
export const productOfTier = (tier: string): 'coins' | 'pass' => (tier.startsWith('pass-') ? 'pass' : 'coins');

/** o que vai em events.data. Puro, testado em server/purchase-event.test.ts */
export function purchaseData(p: Purchase): Record<string, string | number> {
  const out: Record<string, string | number> = {
    product: p.product,
    method: p.provider === 'woovi' ? 'pix' : 'stripe', // mesmo vocabulário do checkout_open
    cents: Math.round(p.cents),
    ck: checkoutKey(p.corr),
  };
  if (p.tier) out.tier = p.tier.slice(0, 20);
  return out;
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

/** grava o purchase_done; nunca lança */
export async function recordPurchase(sql: Sql, p: Purchase): Promise<void> {
  try {
    await sql`INSERT INTO events (type, sid, data) VALUES ('purchase_done', '', ${JSON.stringify(purchaseData(p))}::jsonb)`;
  } catch (e) {
    console.warn('[purchase_done] não gravado:', e instanceof Error ? e.message : e);
  }
}
