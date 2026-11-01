// Chance de título de cada time no PGL Major Singapore, como o painel
// "Favoritos (1.000 simulações)" do Modo Major mostra: titleOdds(D, 1000),
// seed 1. A tela rodava as 1.000 simulações no primeiro render (~1 s de main
// thread travada no celular); a tabela é a mesma conta feita fora do navegador.
// scripts/test-major-odds.mts recalcula e compara: quem atualizar o JSON (lista
// oficial em 02/11) vê o teste mandar a tabela nova.
export const MAJOR_SG_TITLE_ODDS_RUNS = 1000;

export const MAJOR_SG_TITLE_ODDS: Readonly<Record<string, number>> = {
  'team-vitality': 0.293,
  'team-spirit': 0.223,
  'team-falcons': 0.165,
  'natus-vincere': 0.045,
  'mouz': 0.038,
  'legacy': 0.033,
  'the-mongolz': 0.016,
  'aurora-gaming': 0.03,
  'gamerlegion': 0,
  'astralis': 0.001,
  'furia': 0.108,
  'fut-esports': 0.006,
  'g2-esports': 0.01,
  'parivision': 0.006,
  '9z': 0.008,
  'b8': 0,
  'betboom': 0.004,
  'magic': 0.001,
  'pain-gaming': 0,
  'mibr': 0.001,
  'faze-clan': 0.007,
  'ninjas-in-pyjamas': 0,
  'lynn-vision': 0.001,
  'wildcard': 0,
  'envy': 0,
  'heroic': 0,
  'big': 0.001,
  'tyloo': 0.001,
  'm80': 0.001,
  'jijiehao': 0.001,
  'team-liquid': 0,
  'thunder-downunder': 0,
};
