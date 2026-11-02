// [FIX29] Aviso de convidado do Ultimate ("Você está jogando sem conta · Criar
// conta vitalícia · {preço}"). Antes: fixo no topo de TODAS as abas do Ultimate
// (squad, loja, ranqueada, duelo, partida…). Agora (proposta conservadora):
//   • só no Hub do Ultimate (a "home" do modo) e no fim de uma run (Gauntlet /
//     Draft encerrados) — momentos de pausa, não de jogo;
//   • com ✕: fechar esconde por 7 dias (localStorage, por aparelho);
//   • telas bloqueadas (Mercado etc.) mantêm o CTA próprio delas, sem mudança.
// O texto e o preço não mudam.

export const GUEST_BANNER_KEY = 'rtm-ut-guest-banner-dismissed';
export const GUEST_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface GuestBannerCtx {
  guest: boolean;
  tab: string;
  /** uma run (Gauntlet/Draft) acabou de encerrar e o resultado está na tela */
  runOver?: boolean;
  /** epoch ms do último ✕ (0 = nunca) */
  dismissedAt?: number;
  now?: number;
}

export function guestBannerVisible(c: GuestBannerCtx): boolean {
  if (!c.guest) return false;
  const now = c.now ?? Date.now();
  if (c.dismissedAt && now - c.dismissedAt < GUEST_BANNER_SNOOZE_MS) return false;
  return c.tab === 'hub' || !!c.runOver;
}

export function readGuestBannerDismissed(): number {
  try { return Number(localStorage.getItem(GUEST_BANNER_KEY) || 0) || 0; } catch { return 0; }
}

export function dismissGuestBanner(now = Date.now()): number {
  try { localStorage.setItem(GUEST_BANNER_KEY, String(now)); } catch { /* sem storage */ }
  return now;
}
