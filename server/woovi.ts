// Leitura do payload do webhook do Woovi/OpenPix (O0-24). Separado do handler
// pra dar pra testar sem assinatura nem banco.
//
// Formatos que chegam (docs do OpenPix):
// - OPENPIX:CHARGE_COMPLETED  → { event, charge: { correlationID, value, customer, ... }, pix: { value, transactionID, endToEndId, charge? } }
// - OPENPIX:TRANSACTION_RECEIVED → { event, pix: { value, transactionID, endToEndId, charge?: { correlationID, ... } }, charge? }
// Um Pix avulso pra chave da conta (QR estático, link do painel) chega como
// TRANSACTION_RECEIVED SEM charge/correlationID — e antes virava conta vitalícia.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : undefined);
const norm = (e?: unknown) => String(e ?? '').trim().toLowerCase();

// eventos de pagamento confirmado do Woovi/OpenPix
export function isPaidEvent(b: Obj): boolean {
  const ev = String(b.event ?? '');
  if (ev.includes('CHARGE_COMPLETED') || ev.includes('TRANSACTION_RECEIVED')) return true;
  const st = String(obj(b.charge)?.status ?? '');
  return st === 'COMPLETED' || st === 'CONFIRMED';
}

// correlationID da cobrança: charge (CHARGE_COMPLETED), pix.charge
// (TRANSACTION_RECEIVED) ou raiz. '' quando o Pix não veio de cobrança nossa.
export function wooviCorrelation(b: Obj): string {
  const charge = obj(b.charge);
  const pixCharge = obj(obj(b.pix)?.charge);
  return String(charge?.correlationID ?? pixCharge?.correlationID ?? b.correlationID ?? '').trim();
}

// valor PAGO em centavos (o do Pix; cai no da cobrança se o evento não trouxer
// o bloco pix). NaN se nada vier — e NaN nunca bate com preço nenhum.
export function wooviPaidCents(b: Obj): number {
  const pix = obj(b.pix);
  const raw = pix?.value ?? obj(b.charge)?.value ?? obj(pix?.charge)?.value;
  const n = Number(raw);
  return raw === undefined || raw === null || !Number.isFinite(n) ? NaN : Math.round(n);
}

// chave de idempotência do PAGAMENTO (não do evento): o mesmo Pix dispara
// CHARGE_COMPLETED e TRANSACTION_RECEIVED, e o Woovi re-entrega em caso de
// timeout. endToEndId é único no SPI; transactionID é o id do Woovi.
export function wooviPaymentKey(b: Obj): string {
  const pix = obj(b.pix);
  const charge = obj(b.charge);
  return String(pix?.endToEndId ?? pix?.transactionID ?? charge?.transactionID ?? '').trim().slice(0, 200);
}

// e-mail da conta dona da cobrança da vitalícia: o correlationID é
// "rtm-<email>-<unix>" (api/account.ts, action 'pix'). O e-mail pode ter '-',
// por isso o corte é no ÚLTIMO '-' e o sufixo tem de ser só dígitos.
export function rtmEmailFromCorrelation(corr: string): string {
  if (!corr.startsWith('rtm-')) return '';
  const cut = corr.lastIndexOf('-');
  if (cut <= 4 || !/^\d+$/.test(corr.slice(cut + 1))) return '';
  const email = norm(corr.slice(4, cut));
  return /^\S+@\S+\.\S+$/.test(email) ? email : '';
}

// e-mail do pagador — só pra rede de segurança de pedido de coins sem linha
// gravada (charge.customer é a conta logada que gerou a cobrança).
export function wooviPayerEmail(b: Obj): string {
  const pix = obj(b.pix);
  return norm(obj(obj(b.charge)?.customer)?.email ?? obj(b.customer)?.email ?? obj(pix?.payer)?.email);
}
