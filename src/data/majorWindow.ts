// Vitrine do Modo Major (faixa na landing e card no Início). Fica no ar até o
// fim do dia da final do PGL Major Singapore (13/12/2026, horário de Brasília)
// e some sozinha depois. Módulo pequeno de propósito: a landing importa isto e
// não pode puxar o JSON dos 32 times para a carga inicial.
//
// Datas do evento: data/major-singapore-2026.json (event.start 2026-11-24,
// event.playoffsStart 2026-12-10, event.end 2026-12-13; fontes no JSON).
// Brasília = UTC-3 o ano todo (sem horário de verão desde 2019).
export const MAJOR_SG_PATH = '/major-singapore';

const DAY_MS = 86_400_000;
/** 1º dia do Major: 24/11/2026 00:00 em Brasília */
export const MAJOR_SG_STARTS_MS = Date.UTC(2026, 10, 24, 3, 0, 0);
/** 1º dia dos playoffs: 10/12/2026 00:00 em Brasília */
export const MAJOR_SG_PLAYOFFS_MS = Date.UTC(2026, 11, 10, 3, 0, 0);
/** dia da final: 13/12/2026 00:00 em Brasília */
export const MAJOR_SG_FINAL_DAY_MS = Date.UTC(2026, 11, 13, 3, 0, 0);
/** 14/12/2026 00:00 em Brasília: acabou o dia da final */
export const MAJOR_SG_PROMO_ENDS_MS = MAJOR_SG_FINAL_DAY_MS + DAY_MS;
/** dias de evento, de 24/11 a 13/12 inclusive */
export const MAJOR_SG_DAYS = Math.round((MAJOR_SG_PROMO_ENDS_MS - MAJOR_SG_STARTS_MS) / DAY_MS);

export function majorPromoOn(nowMs: number = Date.now()): boolean {
  return nowMs < MAJOR_SG_PROMO_ENDS_MS;
}

/** estado do Major por data: contagem antes, ao vivo durante, nada depois */
export type MajorClock =
  | { phase: 'before'; msLeft: number; days: number; hours: number; minutes: number }
  | { phase: 'live'; day: number; of: number; playoffs: boolean; finalDay: boolean }
  | { phase: 'after' };

export function majorClock(nowMs: number = Date.now()): MajorClock {
  if (nowMs >= MAJOR_SG_PROMO_ENDS_MS) return { phase: 'after' };
  if (nowMs >= MAJOR_SG_STARTS_MS) {
    return {
      phase: 'live',
      day: Math.floor((nowMs - MAJOR_SG_STARTS_MS) / DAY_MS) + 1,
      of: MAJOR_SG_DAYS,
      playoffs: nowMs >= MAJOR_SG_PLAYOFFS_MS,
      finalDay: nowMs >= MAJOR_SG_FINAL_DAY_MS,
    };
  }
  const msLeft = MAJOR_SG_STARTS_MS - nowMs;
  const totalMin = Math.floor(msLeft / 60_000);
  return { phase: 'before', msLeft, days: Math.floor(totalMin / 1440), hours: Math.floor((totalMin % 1440) / 60), minutes: totalMin % 60 };
}
