// Textos do Modo Major em pt/en/es. Mesmo idioma do resto do jogo
// (state/i18n: useLang().lang); chave sem tradução cai no PT.
import type { Lang } from '../../state/i18n';

type Entry = { pt: string; en: string; es: string };

const S = {
  title: { pt: 'Modo Major', en: 'Major Mode', es: 'Modo Major' },
  subtitle: { pt: 'PGL Major Singapore 2026', en: 'PGL Major Singapore 2026', es: 'PGL Major Singapore 2026' },
  tabOverview: { pt: 'Visão geral', en: 'Overview', es: 'Resumen' },
  tabPickem: { pt: "Pick'em", en: "Pick'em", es: "Pick'em" },
  tabSim: { pt: 'Simular', en: 'Simulate', es: 'Simular' },
  dates: { pt: '24 nov – 13 dez 2026 · Singapura', en: 'Nov 24 – Dec 13, 2026 · Singapore', es: '24 nov – 13 dic 2026 · Singapur' },
  playoffsDates: { pt: 'Playoffs de 10 a 13 de dezembro', en: 'Playoffs December 10–13', es: 'Playoffs del 10 al 13 de diciembre' },
  projection: {
    pt: 'Lista provisória: a lista oficial de times sai em 02/11. Até lá, os 32 times são uma projeção pelo ranking VRS da Valve.',
    en: 'Provisional list: the official team list comes out on Nov 2. Until then, the 32 teams are a projection from Valve’s VRS ranking.',
    es: 'Lista provisional: la lista oficial de equipos sale el 2/11. Hasta entonces, los 32 equipos son una proyección del ranking VRS de Valve.',
  },
  official: { pt: 'Lista oficial de times.', en: 'Official team list.', es: 'Lista oficial de equipos.' },
  formatTitle: { pt: 'Formato', en: 'Format', es: 'Formato' },
  formatS1: { pt: 'Stage 1 · seeds 17–32 · suíço, 8 avançam', en: 'Stage 1 · seeds 17–32 · Swiss, top 8 advance', es: 'Stage 1 · seeds 17–32 · suizo, avanzan 8' },
  formatS2: { pt: 'Stage 2 · 8 do Stage 1 + seeds 9–16', en: 'Stage 2 · 8 from Stage 1 + seeds 9–16', es: 'Stage 2 · 8 del Stage 1 + seeds 9–16' },
  formatS3: { pt: 'Stage 3 · 8 do Stage 2 + seeds 1–8', en: 'Stage 3 · 8 from Stage 2 + seeds 1–8', es: 'Stage 3 · 8 del Stage 2 + seeds 1–8' },
  formatPO: { pt: 'Playoffs · 8 times, MD3, final MD5', en: 'Playoffs · 8 teams, Bo3, Bo5 final', es: 'Playoffs · 8 equipos, Bo3, final Bo5' },
  formatNote: {
    pt: 'Suíço: 3 vitórias classifica, 3 derrotas elimina. Stages 1 e 2 em MD1, com MD3 nas partidas que classificam ou eliminam; Stage 3 todo em MD3.',
    en: 'Swiss: 3 wins advance, 3 losses eliminate. Stages 1 and 2 are Bo1, with Bo3 for advancement and elimination matches; Stage 3 is all Bo3.',
    es: 'Suizo: 3 victorias clasifican, 3 derrotas eliminan. Stages 1 y 2 en Bo1, con Bo3 en partidas de clasificación o eliminación; Stage 3 todo en Bo3.',
  },
  teamsTitle: { pt: 'Os 32 times', en: 'The 32 teams', es: 'Los 32 equipos' },
  favorites: { pt: 'Favoritos (1.000 simulações)', en: 'Favorites (1,000 simulations)', es: 'Favoritos (1.000 simulaciones)' },
  startPickem: { pt: "Fazer meu Pick'em", en: 'Make my Pick’em', es: "Hacer mi Pick'em" },
  pickStage: { pt: 'Escolha os 8 que avançam', en: 'Pick the 8 that advance', es: 'Elige los 8 que avanzan' },
  needPrev: { pt: 'Complete o stage anterior primeiro.', en: 'Finish the previous stage first.', es: 'Completa el stage anterior primero.' },
  picked: { pt: 'escolhidos', en: 'picked', es: 'elegidos' },
  bracketTitle: { pt: 'Playoffs: clique no vencedor de cada jogo', en: 'Playoffs: click the winner of each match', es: 'Playoffs: haz clic en el ganador de cada partido' },
  needS3: { pt: 'Escolha os 8 do Stage 3 para montar a chave.', en: 'Pick the 8 from Stage 3 to build the bracket.', es: 'Elige los 8 del Stage 3 para armar el cuadro.' },
  qf: { pt: 'Quartas', en: 'Quarterfinals', es: 'Cuartos' },
  sf: { pt: 'Semis', en: 'Semifinals', es: 'Semis' },
  final: { pt: 'Final', en: 'Final', es: 'Final' },
  champion: { pt: 'Campeão', en: 'Champion', es: 'Campeón' },
  clear: { pt: 'Limpar palpite', en: 'Clear picks', es: 'Borrar pronóstico' },
  auto: { pt: 'Preencher pelos favoritos', en: 'Fill with favorites', es: 'Completar con favoritos' },
  share: { pt: 'Compartilhar', en: 'Share', es: 'Compartir' },
  copyLink: { pt: 'Copiar link', en: 'Copy link', es: 'Copiar enlace' },
  copied: { pt: 'Link copiado', en: 'Link copied', es: 'Enlace copiado' },
  saveImage: { pt: 'Baixar imagem', en: 'Download image', es: 'Descargar imagen' },
  postX: { pt: 'Postar no X', en: 'Post on X', es: 'Publicar en X' },
  incomplete: { pt: 'Complete o palpite para compartilhar.', en: 'Finish your picks to share.', es: 'Completa el pronóstico para compartir.' },
  sharedBanner: { pt: 'Você está vendo o palpite de outra pessoa.', en: 'You are viewing someone else’s picks.', es: 'Estás viendo el pronóstico de otra persona.' },
  useShared: { pt: 'Usar como meu', en: 'Use as mine', es: 'Usar como mío' },
  backToMine: { pt: 'Voltar ao meu', en: 'Back to mine', es: 'Volver al mío' },
  badLink: { pt: 'Esse link é de outra versão da lista de times e não pôde ser aberto.', en: 'This link is from another version of the team list and could not be opened.', es: 'Este enlace es de otra versión de la lista de equipos y no se pudo abrir.' },
  simRun: { pt: 'Simular o Major', en: 'Simulate the Major', es: 'Simular el Major' },
  simAgain: { pt: 'Simular de novo', en: 'Simulate again', es: 'Simular otra vez' },
  simEmpty: { pt: 'Rode uma simulação para ver os stages, a chave e quanto seu palpite pontuaria.', en: 'Run a simulation to see the stages, the bracket and how your picks would score.', es: 'Ejecuta una simulación para ver los stages, el cuadro y cuánto puntuaría tu pronóstico.' },
  score: { pt: 'Seu palpite nesta simulação', en: 'Your picks in this simulation', es: 'Tu pronóstico en esta simulación' },
  points: { pt: 'pontos', en: 'points', es: 'puntos' },
  scoreRule: { pt: '1 ponto por classificado certo, 2 por vencedor de quartas/semi, 5 pelo campeão.', en: '1 point per correct qualifier, 2 per quarter/semi winner, 5 for the champion.', es: '1 punto por clasificado acertado, 2 por ganador de cuartos/semi, 5 por el campeón.' },
  noPicks: { pt: 'Sem palpite completo: a pontuação aparece quando você fechar o Pick’em.', en: 'No complete picks: the score shows once you finish your Pick’em.', es: 'Sin pronóstico completo: la puntuación aparece cuando cierres el Pick’em.' },
  advanced: { pt: 'Classificados', en: 'Qualified', es: 'Clasificados' },
  eliminated: { pt: 'Eliminados', en: 'Eliminated', es: 'Eliminados' },
  hitChampion: { pt: 'Acertou o campeão!', en: 'Called the champion!', es: '¡Acertaste el campeón!' },
  projected: { pt: 'projeção', en: 'projected', es: 'proyección' },
  seed: { pt: 'Seed', en: 'Seed', es: 'Seed' },
  chance: { pt: 'chance de título', en: 'title chance', es: 'chance de título' },
  shareText: { pt: 'meu pick’em do PGL Major Singapore: campeão', en: 'my PGL Major Singapore pick’em: champion', es: 'mi pick’em del PGL Major Singapore: campeón' },
  cardFoot: { pt: 'roadtomajor.com.br · faça o seu', en: 'roadtomajor.com.br · make yours', es: 'roadtomajor.com.br · haz el tuyo' },
  back: { pt: 'Voltar', en: 'Back', es: 'Volver' },
} satisfies Record<string, Entry>;

export type MajorKey = keyof typeof S;

export function majorT(lang: Lang): (k: MajorKey) => string {
  return (k) => S[k][lang] ?? S[k].pt;
}
