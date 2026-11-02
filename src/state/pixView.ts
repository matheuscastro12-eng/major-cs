// Lógica pura da tela do QR Pix da conta vitalícia (src/components/PixPanel.tsx),
// usada pelo AccountModal (Landing.tsx) e pelo UpsellCard. Sem DOM e sem rede:
// o tempo entra por parâmetro (teste: scripts/test-pix-view.mts).

/** O que deu errado ao gerar o Pix, pelo status HTTP do /api/account (0 = rede). */
export type PixErrorKind = 'offline' | 'session' | 'provider';

export function pixErrorKind(status: number): PixErrorKind {
  if (status === 0) return 'offline';   // nem chegou no servidor (sem rede, troca de rede)
  if (status === 401) return 'session'; // token morto: precisa entrar de novo
  return 'provider';                    // 5xx/502: o Woovi não gerou a cobrança
}

/** Instante (ms) em que a cobrança expira; null quando o Woovi não mandou o prazo. */
export function pixExpiresAt(chargeAt: number, expiresIn: number | null | undefined): number | null {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return chargeAt + expiresIn * 1000;
}

/** Contagem regressiva curta: "14:32" abaixo de 1h, "23h59" acima. Arredonda pra
 *  cima, então só mostra "0:00" quando já expirou. */
export function formatPixCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Faltando 5 minutos ou menos, o prazo ganha cor de aviso. */
export const PIX_EXPIRY_WARN_MS = 5 * 60_000;

export type PixPanelView = 'loading' | 'error' | 'expired' | 'ready';

export interface PixPanelInput {
  /** já existe uma cobrança na tela (mesmo que expirada) */
  hasCharge: boolean;
  /** a cobrança trouxe copia-e-cola ou imagem do QR */
  hasCode: boolean;
  /** beginPix() em voo (1ª vez ou gerando de novo) */
  generating: boolean;
  /** a última tentativa de gerar falhou */
  error: boolean;
  expiresAt: number | null;
  now: number;
}

// Qual tela mostrar. Gerar de novo com uma cobrança já na tela não troca a vista
// (o QR antigo some só quando o novo chega); erro ao gerar de novo aparece como
// aviso por cima da vista atual.
export function pixPanelView(i: PixPanelInput): PixPanelView {
  if (!i.hasCharge) return i.error && !i.generating ? 'error' : 'loading';
  if (!i.hasCode) return 'error';
  if (i.expiresAt != null && i.now >= i.expiresAt) return 'expired';
  return 'ready';
}

/** Botão "Gerar novo código": só quando o código expirou ou deu erro. Gerar outro
 *  à toa cria uma 2ª cobrança no Woovi (o servidor não reaproveita a anterior). */
export function pixCanRegenerate(view: PixPanelView, error: boolean): boolean {
  return view === 'expired' || view === 'error' || error;
}
