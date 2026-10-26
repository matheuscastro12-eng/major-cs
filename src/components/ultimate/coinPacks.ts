// Pacotes de coins via Pix (Woovi). MESMOS tiers do servidor (COIN_TIERS em
// server/payments.ts) — valor por real cresce no tier maior pra recompensar quem
// apoia mais (R$10=3.0k/R$, R$15=3.3k/R$, R$30=4.0k/R$).
//
// Sem link estático do Woovi de propósito: o checkout fixo (página "pay" do
// Woovi) não leva o correlationID "ultcoins:…", então o webhook ignora o pagamento e
// os coins nunca caem. Se a cobrança dinâmica falhar, a tela oferece "Tentar de
// novo" (nova beginCoinsPix) ou cartão. O teste server/coin-packs.test.ts barra
// a volta desses links em src/.
import type { CoinTierId } from '../../state/account';

export interface CoinPack { tier: CoinTierId; price: string; coins: number; name: string; bonus?: string; best?: boolean }

export const COIN_PACKS: CoinPack[] = [
  { tier: 'p10', price: 'R$ 10', coins: 30_000, name: 'Arsenal' },
  { tier: 'p15', price: 'R$ 15', coins: 50_000, name: 'Elite', bonus: '+11%' },
  { tier: 'p30', price: 'R$ 30', coins: 120_000, name: 'Lendário', bonus: '+33%', best: true },
];
