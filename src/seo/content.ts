// Texto público das páginas indexáveis (SEO/compartilhamento). O prerender
// (scripts/prerender.mts, no fim de todo `vite build`) grava daqui o HTML
// estático que buscadores e robôs de preview leem antes do JS rodar; o React
// (createRoot) troca o conteúdo do #root ao montar, então o jogo não muda.
//
// Nada aqui é texto novo: a landing é uma CÓPIA FIEL de src/components/Landing.tsx
// (hero, "Em 1 minuto", modos e FAQ), conferida por scripts/test-seo.mts, que
// acusa qualquer frase que não exista mais na landing. As outras páginas usam as
// frases da própria landing e dos dados do jogo. A lista de páginas está em
// ./pages.ts; a do Major em ./major.ts (datas, formato e times do JSON,
// favoritos calculados pelo engine).
import type { LandingDoorId, LandingModeId } from '../data/majorLanding';
import { DEFAULT_PRICE_CENTS, priceLabel } from '../state/price';

export const SITE_URL = 'https://roadtomajor.com.br';
export const SITE_NAME = 'Road to Major';
/** imagem padrão; se o index.html já trouxer og:image absoluto, vale o dele (render.ts) */
export const OG_IMAGE = `${SITE_URL}/og.png`;
export const X_HANDLE = '@castroomath';

/** Item de lista: título opcional (em negrito, com link se houver página), texto e metadado. */
export interface SeoItem { title?: string; text: string; href?: string; meta?: string }
export type SeoBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'list'; items: SeoItem[]; ordered?: boolean; start?: number };
export interface SeoSection { id: string; kicker?: string; title: string; blocks: SeoBlock[] }
export interface SeoLink { href: string; label: string }

export interface SeoPage {
  path: string;            // URL pública (canônica)
  file: string;            // HTML gerado em dist/ (fora do caminho da URL: a Vercel serve o arquivo antes dos rewrites)
  nav: string;             // rótulo curto nos links entre páginas e no BreadcrumbList
  title: string;
  description: string;
  kicker?: string;
  h1: string;
  lead: string[];          // parágrafos logo abaixo do h1
  ctas?: SeoLink[];
  sections?: SeoSection[];
  faq?: [string, string][];
  /** 'home' = WebSite + VideoGame; 'page' = WebPage com breadcrumb */
  schema: 'home' | 'page';
  /** do que a página trata (WebPage.about); sem isto, o jogo */
  about?: string;
  priority: number;        // sitemap
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  lastmod?: string;        // AAAA-MM-DD, só quando a data do conteúdo é conhecida
  /** aviso de rodapé extra (além do de independência) */
  footnote?: string;
}

// ── cópia da landing (src/components/Landing.tsx) ──────────────────────────
// Cada string abaixo existe literalmente na Landing.tsx (scripts/test-seo.mts
// confere). {preço} é trocado pelo preço padrão (state/price.ts) na renderização,
// como o withPrice() da landing faz antes do servidor responder.
export const LANDING = {
  heroMajor: {
    kicker: 'PGL Major Singapore, de 24/11 a 13/12',
    h1: ["Faça seu pick'em", 'do Major de Singapura'],
    sub: 'Escolha quem passa em cada stage, monte a chave dos playoffs e simule o Major inteiro. Depois, jogue as séries com um time ou chame os amigos pra uma liga.',
    assure: 'Grátis, sem cadastro, no navegador e no celular.',
    cta: "Fazer meu pick'em do Major",
    play: 'Jogar grátis',
  },
  heroGeral: {
    badge: 'Beta aberto, joga de graça no navegador',
    h1: ['Seu time de CS', 'rumo ao Major'],
    sub: 'Manager e simulador de Counter-Strike no navegador. Comande uma org, viva a carreira de pro ou dispute a ranqueada online, no PC e no celular.',
    cta: 'Jogar agora, de graça',
  },
  desk: {
    where: 'Singapura · 32 times',
    label: 'Favoritos ao título na simulação',
    runs: 'Majors simulados no jogo',
    listProjection: 'lista provisória até 02/11',
    listOfficial: 'lista oficial',
    foot: '3 stages suíços · playoffs em MD3 · final em MD5',
  },
  quick: {
    kicker: 'Em 1 minuto',
    title: 'Escolha por onde começar',
    subMajor: 'O Modo Major abre na hora. Nos outros, você cria um manager em segundos, sem e-mail.',
    subGeral: 'Você cria um manager em segundos, sem e-mail, e já entra jogando.',
  },
  doors: {
    major: { time: '~1 min', title: 'Modo Major', desc: "Faça o pick'em dos 32 times, jogue o Major com um time ou simule o campeonato inteiro.", meta: 'sem conta · grátis' },
    diario: { time: '2 min', title: 'Diário', desc: 'Quatro desafios por dia, os mesmos pra todo mundo.', meta: 'todo dia · grátis' },
    draft: { time: '~15 min', title: 'Draft', desc: 'Monte um cinco com lendas de cada era e dispute um Major avulso.', meta: 'partida rápida · rejogável' },
    carreira: { time: 'Campanha', title: 'Carreira', desc: 'Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.', meta: 'campanha longa · save neste navegador' },
  } satisfies Record<LandingDoorId, { time: string; title: string; desc: string; meta: string }>,
  modesHead: { kicker: 'Mais modos', title: 'Quando quiser ir mais fundo' },
  modes: {
    carreira: { title: 'Carreira', desc: 'Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.', meta: ['1 jogador · campanha'] },
    rtp: { title: 'Road to Pro', desc: 'Você é o jogador. Nos momentos-chave, a chance de cada jogada fica na tela: o % que você vê é o % que rola.', meta: ['Demo grátis', 'carreira completa na conta vitalícia'] },
    ultimate: { title: 'Ultimate', desc: 'Abra pacotes, colecione os jogadores reais de 2026 e dispute a ranqueada online contra outros managers.', meta: ['Online · ranqueada'] },
    online: { title: 'Online', desc: 'Ranqueada contra outros managers, duelo privado com amigos e o Major da Semana.', meta: ['Com o seu squad do Ultimate'] },
  } satisfies Record<LandingModeId, { title: string; desc: string; meta: string[] }>,
  faqTitle: 'Perguntas frequentes',
  faqLead: 'O essencial sobre modos, conta e pagamento. Ainda com dúvida? Chama no X: @castroomath.',
  /** só com o hero do Major, e em primeiro */
  faqMajor: ['O Modo Major é de graça?', "É. Pick'em dos 32 times, jogar o Major com um time, liga com os amigos e a simulação do campeonato inteiro, sem conta e sem criar manager. O palpite fica salvo neste navegador."] as [string, string],
  faq: [
    ['Preciso pagar pra jogar?', 'Não. Carreira, Ultimate, Draft, Diário e Online são de graça, incluindo a ranqueada online, e o Road to Pro tem demo grátis. O save fica no seu navegador. A conta de {preço} guarda o progresso na nuvem e libera o Road to Pro completo.'],
    ['O que a conta vitalícia me dá?', 'O Road to Pro completo com a Série do Dia, save na nuvem pra jogar no PC e no celular, compra de coins pra abrir mais packs no Ultimate, histórico de partidas e um selo de apoiador. É um pagamento único, sem mensalidade.'],
    ['Funciona no celular?', 'Sim. O jogo roda no navegador do celular com a mesma interface do PC, e dá pra instalar na tela inicial como um app.'],
    ['O Ultimate é o modo online?', 'Sim. No Ultimate você monta seu elenco dos jogadores reais de 2026 e enfrenta outros managers na fila ranqueada, subindo de divisão. É de graça: a conta só entra pra salvar na nuvem e comprar coins.'],
    ['Se eu não criar conta, perco o progresso?', 'O progresso fica salvo no localStorage do navegador. Se você limpar o cache ou trocar de aparelho, ele some. Com conta isso não acontece.'],
    ['Como pago os {preço}?', 'Cartão pelo Stripe ou Pix pelo Woovi. É um pagamento único pelos recursos persistentes, válido enquanto o Road to Major continuar em operação, conforme os Termos.'],
    ['De onde vêm os jogadores e times?', 'Os elencos e dados são curados a partir de HLTV e Liquipedia, do CS 1.6 ao CS2.'],
  ] as [string, string][],
  footer: 'Produto comercial independente, não afiliado ou endossado pela Valve, HLTV, Liquipedia, equipes ou jogadores.',
} as const;

/** {preço} → preço padrão formatado (o mesmo que a landing mostra antes de /api/account responder) */
export const withDefaultPrice = (s: string): string => s.split('{preço}').join(priceLabel(DEFAULT_PRICE_CENTS));
