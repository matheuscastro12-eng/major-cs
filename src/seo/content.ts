// Texto público das páginas indexáveis (SEO/compartilhamento). Fonte única: a
// Landing usa o FAQ daqui e scripts/prerender.mts gera o HTML estático que os
// buscadores e o X leem antes do JS rodar.
export const SITE_URL = 'https://roadtomajor.com.br';
export const SITE_NAME = 'Road to Major';
export const OG_IMAGE = `${SITE_URL}/og.png`;
export const X_HANDLE = '@castroomath';

export const LANDING_FAQ: [string, string][] = [
  ['Preciso pagar pra jogar?', 'Não. Carreira, Ultimate, Draft, Diário e Online são de graça, incluindo a ranqueada online, e o Road to Pro tem demo grátis. O save fica no seu navegador. A conta de R$20 guarda o progresso na nuvem e libera o Road to Pro completo.'],
  ['O que a conta vitalícia me dá?', 'O Road to Pro completo com a Série do Dia, save na nuvem pra jogar no PC e no celular, compra de coins pra abrir mais packs no Ultimate, histórico de partidas e um selo de apoiador. É um pagamento único, sem mensalidade.'],
  ['Funciona no celular?', 'Sim. O jogo roda no navegador do celular com a mesma interface do PC, e dá pra instalar na tela inicial como um app.'],
  ['O Ultimate é o modo online?', 'Sim. No Ultimate você monta seu elenco dos jogadores reais de 2026 e enfrenta outros managers na fila ranqueada, subindo de divisão. É de graça: a conta só entra pra salvar na nuvem e comprar coins.'],
  ['Se eu não criar conta, perco o progresso?', 'O progresso fica salvo no localStorage do navegador. Se você limpar o cache ou trocar de aparelho, ele some. Com conta isso não acontece.'],
  ['Como pago os R$20?', 'Cartão pelo Stripe ou Pix pelo Woovi. É um pagamento único pelos recursos persistentes, válido enquanto o Road to Major continuar em operação, conforme os Termos.'],
  ['De onde vêm os jogadores e times?', 'Os elencos e dados são curados a partir de HLTV e Liquipedia, do CS 1.6 ao CS2.'],
];

export interface SeoPage {
  path: string;            // URL pública
  file: string;            // HTML gerado em dist/
  title: string;
  description: string;
  h1: string;
  body: string[];          // parágrafos
  priority: number;        // sitemap
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  faq?: [string, string][];
}

export const SEO_PAGES: SeoPage[] = [
  {
    path: '/', file: 'index.html', priority: 1, changefreq: 'weekly',
    title: 'Road to Major · manager e simulador de CS2 no navegador',
    description: 'Manager e simulador de Counter-Strike no navegador: monte o time dos sonhos com lendas do CS 1.6, Source, CS:GO e CS2, viva a carreira de pro e vença o Major. Grátis no PC e no celular.',
    h1: 'Seu time de CS rumo ao Major',
    body: [
      'Manager e simulador de Counter-Strike no navegador. Comande uma org, viva a carreira de pro ou dispute a ranqueada online, no PC e no celular.',
      'Modos: Carreira (gerencie uma org por splits e Majors), Ultimate (monte seu elenco com jogadores reais de 2026 e suba de divisão na ranqueada), Road to Pro (a carreira de um jogador), Draft (time dos sonhos de todas as eras), Diário (um desafio novo por dia) e Online.',
      'Beta aberto: joga de graça no navegador, sem instalar nada.',
    ],
    faq: LANDING_FAQ,
  },
  { path: '/ultimate', file: 'p/ultimate.html', priority: 0.9, changefreq: 'weekly', title: 'Ultimate · monte seu elenco de CS2 e suba na ranqueada · Road to Major', description: 'Abra packs com os jogadores reais de 2026, monte o elenco e enfrente outros managers na fila ranqueada do Ultimate. Grátis no navegador.', h1: 'Ultimate: seu elenco de CS2 na ranqueada', body: ['Abra packs, monte seu elenco com os jogadores reais de 2026 e enfrente outros managers na fila ranqueada, subindo de divisão.'] },
  { path: '/carreira', file: 'p/carreira.html', priority: 0.9, changefreq: 'weekly', title: 'Modo Carreira · gerencie uma org de CS · Road to Major', description: 'Gerencie uma organização de Counter-Strike: contrate, treine, dispute splits e Majors e construa uma dinastia. Grátis no navegador.', h1: 'Modo Carreira: gerencie uma org de CS', body: ['Contrate jogadores, monte a comissão técnica, dispute splits e Majors e construa a história da sua org, split a split.'] },
  { path: '/road-to-pro', file: 'p/road-to-pro.html', priority: 0.8, changefreq: 'weekly', title: 'Road to Pro · a carreira de um jogador de CS · Road to Major', description: 'Crie seu jogador, jogue a Série do Dia e suba do amador ao Major no Road to Pro. Demo grátis no navegador.', h1: 'Road to Pro: do amador ao Major', body: ['Crie seu jogador, evolua a cada série e chegue ao palco do Major. O % que você vê é o % que rola.'] },
  { path: '/diario', file: 'p/diario.html', priority: 0.7, changefreq: 'daily', title: 'Desafio Diário de CS · Road to Major', description: 'Um desafio novo de Counter-Strike por dia: mesma seed pra todo mundo, compare seu resultado e compartilhe.', h1: 'Desafio Diário', body: ['Todo dia um desafio novo, igual pra todo mundo. Jogue, compare e compartilhe seu resultado.'] },
  { path: '/online', file: 'p/online.html', priority: 0.6, changefreq: 'weekly', title: 'Online · jogue CS manager contra amigos · Road to Major', description: 'Crie uma sala e enfrente outros managers de Counter-Strike online, direto no navegador.', h1: 'Online', body: ['Crie uma sala, chame os amigos e decida quem monta o melhor time.'] },
  { path: '/ranking', file: 'p/ranking.html', priority: 0.5, changefreq: 'daily', title: 'Ranking dos managers · Road to Major', description: 'Ranking dos melhores managers do Road to Major.', h1: 'Ranking', body: ['Os melhores managers do Road to Major.'] },
  { path: '/hall', file: 'p/hall.html', priority: 0.5, changefreq: 'weekly', title: 'Hall da Fama · Road to Major', description: 'Os campeões e recordes do Road to Major.', h1: 'Hall da Fama', body: ['Campeões, recordes e lendas do Road to Major.'] },
  { path: '/privacidade', file: 'p/privacidade.html', priority: 0.2, changefreq: 'yearly', title: 'Política de privacidade · Road to Major', description: 'Como o Road to Major trata seus dados.', h1: 'Política de privacidade', body: ['Como o Road to Major coleta, usa e protege seus dados.'] },
  { path: '/termos', file: 'p/termos.html', priority: 0.2, changefreq: 'yearly', title: 'Termos de uso · Road to Major', description: 'Termos de uso do Road to Major.', h1: 'Termos de uso', body: ['As regras de uso do Road to Major.'] },
  { path: '/reembolso', file: 'p/reembolso.html', priority: 0.2, changefreq: 'yearly', title: 'Política de reembolso · Road to Major', description: 'Política de reembolso do Road to Major.', h1: 'Política de reembolso', body: ['Como funcionam reembolsos no Road to Major.'] },
];
