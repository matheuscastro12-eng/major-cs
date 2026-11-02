// Chance de título de cada time no PGL Major Singapore, como o painel
// "Favoritos (1.000 simulações)" do Modo Major mostra: titleOdds(D, 1000),
// seed 1. A tela rodava as 1.000 simulações no primeiro render (~1 s de main
// thread travada no celular); a tabela é a mesma conta feita fora do navegador.
// scripts/test-major-odds.mts recalcula e compara: quem atualizar o JSON (lista
// oficial em 02/11) vê o teste mandar a tabela nova.
export const MAJOR_SG_TITLE_ODDS_RUNS = 1000;

export const MAJOR_SG_TITLE_ODDS: Readonly<Record<string, number>> = {
  'team-spirit': 0.24,
  'legacy': 0.026,
  'team-vitality': 0.29,
  'mouz': 0.04,
  'team-falcons': 0.157,
  'furia': 0.124,
  'aurora-gaming': 0.023,
  'betboom': 0.004,
  'g2-esports': 0.012,
  'fut-esports': 0.003,
  'astralis': 0.001,
  'mibr': 0.002,
  'nemiga': 0,
  'natus-vincere': 0.037,
  '1win': 0,
  'the-mongolz': 0.012,
  'heroic': 0,
  '9z': 0.009,
  'ninjas-in-pyjamas': 0.007,
  'team-liquid': 0.002,
  'm80': 0,
  'faze-clan': 0.007,
  '100-thieves': 0,
  'eternal-fire': 0,
  'parivision': 0.003,
  'dendele': 0,
  'bc-game': 0,
  'imperial': 0,
  'wildcard': 0,
  'lynn-vision': 0.001,
  'flyquest': 0,
  'chinggis-warriors': 0,
};
