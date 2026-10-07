// Relógio da Carreira: quantos splits fazem um ano de idade.
//
// [evolução · out/2026] A temporada da fase 4 tem 4 splits (circuito.ts:
// MAJOR_EVERY = 4, o split do Major fecha a temporada). Com 3 splits por ano a
// idade andava 4/3 mais rápido que o calendário (um jogador ficava 1 ano mais
// velho a cada 3/4 de temporada). Agora 1 ano = 1 temporada = 4 splits, e as
// curvas de evolução são escritas POR ANO e divididas por este número.
// Leve de propósito: entra no bundle da migração do save.
export const SPLITS_PER_YEAR = 4;
