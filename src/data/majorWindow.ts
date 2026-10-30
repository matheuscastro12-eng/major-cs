// Vitrine do Modo Major (faixa na landing e card no Início). Fica no ar até o
// fim do dia da final do PGL Major Singapore (13/12/2026, horário de Brasília)
// e some sozinha depois. Módulo pequeno de propósito: a landing importa isto e
// não pode puxar o JSON dos 32 times para a carga inicial.
export const MAJOR_SG_PATH = '/major-singapore';
// 14/12/2026 00:00 em Brasília (UTC-3)
export const MAJOR_SG_PROMO_ENDS_MS = Date.UTC(2026, 11, 14, 3, 0, 0);

export function majorPromoOn(nowMs: number = Date.now()): boolean {
  return nowMs < MAJOR_SG_PROMO_ENDS_MS;
}
