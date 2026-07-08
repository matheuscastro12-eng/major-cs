// Redação da DRAFT5 in-game — gera o TEXTO das matérias do modo carreira.
//
// Problema que este módulo resolve: as manchetes eram strings fixas — todo
// split a mesma frase, o que mata a imersão em carreira longa. Aqui cada
// tipo de matéria tem 3-4 redações diferentes e a escolha é DETERMINÍSTICA
// por (split + chave): o mesmo save relê a mesma matéria, mas splits
// diferentes ganham textos diferentes. Dados concretos (placar, adversário,
// rating, prêmio) entram interpolados pra parecer cobertura de verdade.
//
// i18n: os textos usam ct() — sem tradução cadastrada caem no pt (padrão do
// projeto pra flavor text).
import { ct } from '../../state/career-i18n';

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

// escolhe uma variante estável por seed (split + chave da matéria)
export const pick = <T,>(seed: string, arr: T[]): T => arr[hash(seed) % arr.length];

export interface Story { title: string; body: string }

// ------------------------------------------------------------------- Major
export function storyMajorChampion(seed: string, org: string): Story {
  return pick(seed, [
    { title: `${org} ${ct('é CAMPEÃO MUNDIAL!')}`, body: `${org} ${ct('levantou o troféu do Major e entrou para a história do CS. Nas redes, torcedores já pedem estátua.')}` },
    { title: `${ct('O mundo é da')} ${org}`, body: `${ct('Campanha impecável e taça de Major na estante. A pergunta agora é outra: isso é o começo de uma era?')}` },
    { title: `${org} ${ct('no topo do mundo: é CAMPEÃ do Major')}`, body: `${ct('Do sonho ao troféu: a organização confirmou o favoritismo nos momentos decisivos e ninguém segurou a festa.')}` },
  ]);
}
export function storyMajorPlacement(seed: string, org: string, placement: number | string): Story {
  return pick(seed, [
    { title: `${org} ${ct('no Major:')} ${placement}º`, body: `${ct('A campanha mundial terminou em')} ${placement}º. ${ct('Fica o aprendizado — e a cobrança pra voltar mais forte.')}` },
    { title: `${ct('Fim de linha no Major para a')} ${org}`, body: `${ct('A caminhada parou em')} ${placement}º ${ct('lugar. Nos bastidores, a análise é fria: faltou pouco, mas no Major pouco é tudo.')}` },
    { title: `${org} ${ct('se despede do Major em')} ${placement}º`, body: `${ct('O sonho do título fica pra próxima. A experiência de palco mundial, essa ninguém tira do elenco.')}` },
  ]);
}
export function storyMajorHype(seed: string, majorName: string): Story {
  return pick(seed, [
    { title: `${ct('O MAJOR se aproxima:')} ${majorName}`, body: `${ct('O próximo split é o')} ${majorName}${ct('. As melhores organizações do mundo se preparam — é a chance de entrar pra história.')}` },
    { title: `${majorName}: ${ct('a contagem regressiva começou')}`, body: `${ct('Todo o cenário gira em torno de uma data. Classificar já é história; levantar a taça é imortalidade.')}` },
    { title: `${ct('Rumo ao')} ${majorName}`, body: `${ct('Analistas já montam seus power rankings e os elencos entram em modo Major. A pressão vai subir semana a semana.')}` },
  ]);
}

// ------------------------------------------------------------------ título
export function storyTitleWin(seed: string, org: string, circuit: string): Story {
  return pick(seed, [
    { title: `${org} ${ct('campeã do')} ${circuit}`, body: ct('Título conquistado! A torcida foi à loucura e a diretoria respira aliviada.') },
    { title: `${ct('A taça é da')} ${org}`, body: `${ct('Campanha de campeã no')} ${circuit}${ct(': consistência na fase de grupos e sangue frio no mata-mata.')}` },
    { title: `${org} ${ct('não deixa dúvidas e leva o')} ${circuit}`, body: ct('Quando o jogo apertou, o time apareceu. O vestiário celebra — e o mercado já olha para esse elenco com outros olhos.') },
  ]);
}

// -------------------------------------------------------------------- tier
export function storyTierUp(seed: string, org: string, tierName: string): Story {
  return pick(seed, [
    { title: `${org} ${ct('promovida ao')} ${tierName}`, body: ct('Subir de divisão coloca a org mais perto do Major. Patrocinadores de olho.') },
    { title: `${ct('Acesso garantido:')} ${org} ${ct('no')} ${tierName}`, body: ct('O projeto deu certo. Agora o desafio muda de tamanho — e a folha salarial também vai querer acompanhar.') },
    { title: `${org} ${ct('sobe! Bem-vinda ao')} ${tierName}`, body: ct('A promoção premia uma temporada de trabalho. Nos fóruns, a pergunta é se o elenco atual segura o nível de cima.') },
  ]);
}
export function storyTierDown(seed: string, org: string, tierName: string): Story {
  return pick(seed, [
    { title: `${org} ${ct('rebaixada ao')} ${tierName}`, body: ct('Temporada para esquecer: a queda de divisão pressiona o elenco e o caixa.') },
    { title: `${ct('A queda:')} ${org} ${ct('jogará o')} ${tierName}`, body: ct('O rebaixamento expõe as escolhas da temporada. Reconstrução é a palavra da vez nos bastidores.') },
    { title: `${org} ${ct('não resiste e cai pro')} ${tierName}`, body: ct('Faltou resultado na hora da verdade. A boa notícia: divisão de baixo também é palco pra se reinventar.') },
  ]);
}

// --------------------------------------------------------------- diretoria
export function storyBoardMet(seed: string, objText: string): Story {
  return pick(seed, [
    { title: ct('Diretoria satisfeita'), body: `${ct('Objetivo cumprido')}: "${objText}". ${ct('A confiança subiu.')}` },
    { title: ct('Meta batida, bastidores em paz'), body: `"${objText}" ${ct('era a cobrança — e foi entregue. O planejamento do próximo split começa com crédito na mesa.')}` },
    { title: ct('Diretoria aprova a temporada'), body: `${ct('Com o objetivo')} "${objText}" ${ct('cumprido, a cúpula elogiou o trabalho da comissão em reunião interna.')}` },
  ]);
}
export function storyBoardMissed(seed: string, objText: string): Story {
  return pick(seed, [
    { title: ct('Diretoria cobra resultados'), body: `${ct('Objetivo não cumprido')}: "${objText}". ${ct('A confiança caiu — atenção redobrada no próximo split.')}` },
    { title: ct('Bastidores em alerta após meta frustrada'), body: `"${objText}" ${ct('ficou no papel. Fontes internas falam em paciência curta na cúpula.')}` },
    { title: ct('Conta não fechou: diretoria quer resposta'), body: `${ct('A promessa era')} "${objText}" — ${ct('não veio. O próximo split começa com a lupa em cima da comissão.')}` },
  ]);
}
export function storyUltimatum(seed: string): Story {
  return pick(seed, [
    { title: ct('Ultimato da diretoria'), body: ct('A confiança chegou ao limite. O próximo campeonato precisa mostrar evolução ou o cargo estará em risco.') },
    { title: ct('Cadeira quente: cúpula perde a paciência'), body: ct('Apuração da DRAFT5: a permanência da comissão técnica está condicionada a resultado imediato. Não há mais margem.') },
  ]);
}
export function storyPressure(seed: string): Story {
  return pick(seed, [
    { title: ct('Pressão aumenta nos bastidores'), body: ct('Diretoria e torcida cobram uma resposta imediata depois dos resultados recentes.') },
    { title: ct('Clima pesa nos corredores da org'), body: ct('Os últimos resultados acenderam o alerta. Internamente, fala-se em "resposta dentro do servidor" — e rápido.') },
  ]);
}

// ------------------------------------------------------------------ elenco
export function storyStar(seed: string, nick: string, rating: number): Story {
  const r = rating.toFixed(2);
  if (rating >= 1.15) return pick(seed, [
    { title: `${nick} ${ct('foi o destaque do split')}`, body: `${nick} ${ct('fechou a campanha com rating')} ${r} — ${ct('atuação de melhor em quadra. A imprensa já comenta.')}` },
    { title: `${ct('O split de')} ${nick} ${ct('foi de outro planeta')}`, body: `Rating ${r} ${ct('no acumulado. Nos rankings individuais da temporada, o nome dele aparece em negrito.')}` },
    { title: `${nick} ${ct('carrega e o número prova:')} ${r}`, body: ct('Consistência de estrela: série após série entregando acima da linha. Times grandes anotam o nome.') },
  ]);
  return pick(seed, [
    { title: `${nick} ${ct('foi o destaque do split')}`, body: `${nick} ${ct('fechou a campanha com rating')} ${r}. ${ct('Boa entrega individual.')}` },
    { title: `${ct('Relatório do split: ')}${nick} ${ct('acima da média')}`, body: `${ct('Rating')} ${r} ${ct('no fechamento — o mais constante do elenco numa temporada de oscilação.')}` },
  ]);
}
export function storyRisers(seed: string, names: string): Story {
  return pick(seed, [
    { title: `${ct('Em ascensão:')} ${names}`, body: `${ct('A comissão técnica destaca a evolução de')} ${names} ${ct('no último split.')}` },
    { title: `${ct('Curva pra cima:')} ${names}`, body: `${ct('Os números de')} ${names} ${ct('melhoraram de forma consistente. O teto ainda não apareceu.')}` },
  ]);
}
export function storySliders(seed: string, names: string, plural: boolean): Story {
  return pick(seed, [
    { title: `${ct('Em queda:')} ${names}`, body: `${names} ${plural ? ct('perderam') : 'perdeu'} ${ct('rendimento. Veteranos cobram mais minutos de treino.')}` },
    { title: `${ct('Sinal amarelo para')} ${names}`, body: `${ct('A forma caiu e os analistas notaram. Recuperar')} ${plural ? ct('esses nomes') : ct('esse nome')} ${ct('é o dever de casa da comissão.')}` },
  ]);
}
export function storyUnhappy(seed: string, names: string, plural: boolean): Story {
  return pick(seed, [
    { title: `${ct('Vestiário:')} ${names} insatisfeito${plural ? 's' : ''}`, body: ct('Moral baixa no elenco. Vitórias, renovação de contrato e títulos levantam o astral.') },
    { title: `${ct('Bastidores: clima ruim com')} ${names}`, body: ct('Apuração da DRAFT5 indica insatisfação no vestiário. Sem resposta rápida, o assunto vaza pro servidor.') },
  ]);
}

// ----------------------------------------------------------------- mercado
export function storyOffer(seed: string, orgName: string, nick: string, ovr: number, feeText: string): Story {
  return pick(seed, [
    { title: `${orgName} ${ct('sonda')} ${nick}`, body: `${ct('Proposta de')} ${feeText} ${ct('pelo seu')} ${nick} (OVR ${ovr}${ct('). Decida na janela de transferências.')}` },
    { title: `${ct('Rumor de mercado:')} ${nick} ${ct('na mira da')} ${orgName}`, body: `${ct('Fontes ouvidas pela DRAFT5 confirmam interesse concreto:')} ${feeText} ${ct('na mesa por')} ${nick} (OVR ${ovr}).` },
    { title: `${orgName} ${ct('abre o cofre por')} ${nick}`, body: `${feeText} ${ct('é a oferta. Vender financia reforços; segurar manda recado de projeto vencedor.')}` },
  ]);
}
export function storyReleases(seed: string, names: string, single: boolean): Story {
  return pick(seed, [
    { title: `${ct('Contrato vencido:')} ${names}`, body: `${single ? ct('O jogador saiu') : ct('Os jogadores saíram')} ${ct('de graça por fim de contrato. Reforce o elenco no mercado.')}` },
    { title: `${ct('Fim de ciclo:')} ${names} ${single ? ct('deixa a org') : ct('deixam a org')}`, body: ct('Saída sem custo e sem receita — o tipo de despedida que o financeiro odeia. O mercado abre com vaga no elenco.') },
  ]);
}

// ------------------------------------------------------------------ torcida
export function storyFansAngry(seed: string): Story {
  return pick(seed, [
    { title: ct('Torcida pede reação'), body: ct('As arquibancadas perderam a paciência. O próximo split começa com cobrança por desempenho e atitude.') },
    { title: ct('Paciência da torcida no limite'), body: ct('Enquetes nos fóruns, cobrança nos comentários: a base quer mudança de postura já no próximo campeonato.') },
  ]);
}
export function storyFansParty(seed: string): Story {
  return pick(seed, [
    { title: ct('Festa com a torcida'), body: ct('O título levou a torcida às ruas e aumentou a expectativa pelo próximo campeonato.') },
    { title: ct('A festa que parou os fóruns'), body: ct('Clipes da comemoração dominaram as redes. Ser campeão muda o humor de tudo — inclusive do mercado.') },
  ]);
}

// ------------------------------------------------------- partida (série)
export type SeriesAngle = 'upset' | 'dominant' | 'close' | 'win' | 'lossClose' | 'loss' | 'upsetAgainst';
export function storySeries(
  seed: string,
  ctx: { org: string; tag: string; oppTag: string; score: string; label: string; angle: SeriesAngle },
): Story {
  const { org, tag, oppTag, score, label, angle } = ctx;
  const vs = `${tag} ${score} ${oppTag}`;
  switch (angle) {
    case 'upset': return pick(seed, [
      { title: `${ct('ZEBRA! ')}${vs}`, body: `${org} ${ct('derrubou um favorito no')} ${label} ${ct('e virou o assunto do dia entre analistas e torcedores.')}` },
      { title: `${org} ${ct('surpreende e atropela o papel:')} ${vs}`, body: `${ct('Ninguém tinha essa na bala. O')} ${label} ${ct('ganhou um vilão — ou um novo protagonista.')}` },
    ]);
    case 'dominant': return pick(seed, [
      { title: `${ct('Atropelo:')} ${vs}`, body: `${org} ${ct('controlou a série do início ao fim no')} ${label}${ct('. A torcida já pede voo mais alto.')}` },
      { title: `${vs}: ${ct('não teve jogo')}`, body: `${ct('Vitória sem sustos no')} ${label}. ${ct('Quando o CT trava e o TR converte, o placar fica com essa cara.')}` },
    ]);
    case 'close': return pick(seed, [
      { title: `${ct('No detalhe:')} ${vs}`, body: `${ct('Série decidida nos rounds finais no')} ${label}. ${org} ${ct('mostrou frieza quando a partida pediu.')}` },
      { title: `${vs} — ${ct('vitória suada no')} ${label}`, body: ct('Jogo de margens mínimas: cada round de pistola, cada clutch pesou. Venceu quem errou menos no fim.') },
    ]);
    case 'lossClose': return pick(seed, [
      { title: `${ct('Por um triz:')} ${vs}`, body: `${ct('Derrota apertada no')} ${label}. ${ct('O resultado dói, mas a leitura interna é de que o nível competitivo está lá.')}` },
      { title: `${vs}: ${ct('faltou um round')}`, body: `${ct('A série escapou nos detalhes no')} ${label}. ${ct('Nos bastidores, a bronca é com os rounds de economia jogados fora.')}` },
    ]);
    case 'upsetAgainst': return pick(seed, [
      { title: `${ct('Tropeço:')} ${vs}`, body: `${org} ${ct('caiu diante de um adversário que o papel dizia ser menor. No')} ${label}${ct(', o papel não joga.')}` },
      { title: `${vs} — ${ct('a derrota que ninguém esperava')}`, body: `${ct('Favorito dentro do servidor é outra história: o')} ${label} ${ct('cobrou caro a desatenção.')}` },
    ]);
    case 'loss': return pick(seed, [
      { title: `${vs} ${ct('no')} ${label}`, body: `${ct('Derrota sem desculpas. A comissão já revê a VOD em busca do que corrigir antes da próxima série.')}` },
      { title: `${org} ${ct('não encontra o jogo:')} ${vs}`, body: `${ct('Faltou plano B no')} ${label}. ${ct('A boa notícia: tem tempo de ajustar antes da próxima.')}` },
    ]);
    default: return pick(seed, [
      { title: `${vs} ${ct('no')} ${label}`, body: `${org} ${ct('fez o dever de casa e segue viva na briga. Consistência é o nome do jogo.')}` },
      { title: `${org} ${ct('vence:')} ${vs}`, body: `${ct('Resultado sólido no')} ${label}${ct('. Sem brilho excessivo, sem susto — do jeito que comissão gosta.')}` },
    ]);
  }
}

// --------------------------------------------------- mercado da IA (cena viva)
export function storyAIMoveFree(seed: string, toName: string, nick: string, role: string, ovr: number, outNick: string, crisis: boolean): Story {
  const opener = crisis ? `${ct('Em crise, a')} ${toName}` : `${ct('A')} ${toName}`;
  return pick(seed, [
    { title: `${toName} ${ct('contrata')} ${nick} ${ct('do mercado livre')}`, body: `${opener} ${ct('foi ao mercado livre e fechou com o')} ${role} ${nick} (OVR ${ovr}). ${outNick} ${ct('perde a vaga e fica livre no mercado.')}` },
    { title: `${ct('OFICIAL:')} ${nick} ${ct('é o novo')} ${role} ${ct('da')} ${toName}`, body: `${ct('Sem custo de transferência: o OVR')} ${ovr} ${ct('estava livre no mercado. Quem sai da vaga é')} ${outNick}${ct(', agora à procura de clube.')}` },
    { title: `${toName} ${ct('anuncia')} ${nick}`, body: `${opener} ${ct('apostou no mercado livre pra resolver a posição de')} ${role}. ${nick} (OVR ${ovr}) ${ct('chega pra vaga de')} ${outNick}.` },
  ]);
}
export function storyAIMoveTrade(seed: string, toName: string, fromName: string, nick: string, role: string, ovr: number, outNick: string, crisis: boolean): Story {
  const opener = crisis ? `${ct('Em crise, a')} ${toName}` : `${ct('A')} ${toName}`;
  return pick(seed, [
    { title: `${toName} ${ct('tira')} ${nick} ${ct('da')} ${fromName}`, body: `${opener} ${ct('buscou o')} ${role} ${nick} (OVR ${ovr}) ${ct('na')} ${fromName}; ${outNick} ${ct('faz o caminho inverso na troca.')}` },
    { title: `${ct('BOMBA no mercado:')} ${nick} ${ct('troca')} ${fromName} ${ct('por')} ${toName}`, body: `${ct('Negócio fechado entre as orgs: o')} ${role} ${ct('de OVR')} ${ovr} ${ct('muda de camisa e')} ${outNick} ${ct('vai na direção contrária.')}` },
    { title: `${nick} ${ct('é o novo reforço da')} ${toName}`, body: `${opener} ${ct('convenceu a')} ${fromName} ${ct('a liberar seu')} ${role} (OVR ${ovr}). ${ct('Na troca,')} ${outNick} ${ct('ganha novo endereço.')}` },
  ]);
}

// ------------------------------------------------ forma individual (orgânica)
export function storyHotForm(seed: string, nick: string, avg: number, org: string): Story {
  const r = avg.toFixed(2);
  return pick(seed, [
    { title: `${nick} ${ct('está EM CHAMAS')}`, body: `${ct('Média')} ${r} ${ct('nas últimas séries pela')} ${org}${ct('. Nos rankings de forma da DRAFT5, ninguém entrega mais que ele agora.')}` },
    { title: `${ct('A fase de')} ${nick} ${ct('virou pauta no cenário')}`, body: `${r} ${ct('de rating médio na janela recente. Adversários já montam o plano de jogo em cima de frear o astro da')} ${org}.` },
    { title: `${ct('Que fase:')} ${nick} ${ct('não erra')}`, body: `${ct('Sequência rara de consistência — média')} ${r} ${ct('nas últimas séries. Na')} ${org}${ct(', a ordem é simples: dar espaço pra ele decidir.')}` },
  ]);
}

// ------------------------------------------------- matéria completa (leitura)
// Expande uma manchete do feed numa MATÉRIA de verdade, nos moldes da Draft5:
// lide (o body da manchete) + contexto + aspas de uma fonte + análise + gancho
// de fechamento. Tudo determinístico pelo id da manchete — reabrir a mesma
// matéria mostra o mesmo texto.
export interface ArticleCtx {
  id: string; title: string; body: string; cat?: string;
  tone: 'good' | 'bad' | 'info'; split: number; org: string;
}

// fontes fictícias por tom (quem "fala" na matéria)
const SPEAKERS_GOOD = [
  { who: 'o coach, em entrevista à DRAFT5', q: [
    'O grupo vem trabalhando muito e o resultado é consequência. Mas aqui ninguém se contenta — a régua sobe toda semana.',
    'A gente sabia do nosso teto. O que me deixa feliz é ver o plano de jogo aparecendo dentro do servidor.',
    'Isso é mérito dos jogadores. Meu trabalho é só não atrapalhar o que esse elenco tem de talento.',
  ]},
  { who: 'o capitão da equipe', q: [
    'A confiança tá lá em cima, mas pé no chão: semana que vem tem mais e ninguém vai nos dar nada de graça.',
    'A torcida merece esse momento. Cada treino puxado valeu a pena.',
  ]},
];
const SPEAKERS_BAD = [
  { who: 'uma fonte próxima à organização, sob anonimato', q: [
    'O clima não é de crise, mas ninguém está confortável. As cobranças internas já começaram.',
    'Existe uma pressão real. Se os resultados não vierem rápido, mudanças não estão descartadas.',
  ]},
  { who: 'o coach, em tom de desabafo', q: [
    'Errar faz parte, repetir o erro não. A resposta tem que vir dentro do servidor, não em nota oficial.',
    'Assumo a responsabilidade. O elenco tem qualidade e vamos provar isso já na próxima série.',
  ]},
];
const SPEAKERS_INFO = [
  { who: 'um analista ouvido pela DRAFT5', q: [
    'É o tipo de movimento que só se avalia com o tempo. No papel faz sentido; o servidor dirá o resto.',
    'O cenário está mais competitivo do que nunca — qualquer detalhe desses muda uma classificação.',
  ]},
  { who: 'uma fonte do mercado', q: [
    'Tem mais conversa acontecendo nos bastidores do que o público imagina. Essa história ainda vai render.',
  ]},
];

// contexto e análise por editoria
const CONTEXT_BY_CAT: Record<string, string[]> = {
  result: [
    'O resultado mexe diretamente com as contas do split: cada série vale posição na tabela, e posição vale vaga de playoff — além de pesar no ranking VRS, que define convites e seed nos torneios seguintes.',
    'Mais do que o placar, o que fica é a leitura do momento: forma recente define confiança, e confiança define como o time entra nos rounds decisivos das próximas semanas.',
  ],
  transfer: [
    'A janela de transferências costuma recompensar quem se antecipa: contratos, moral do vestiário e teto salarial entram na mesma conta, e um movimento puxa o outro em efeito dominó pelo cenário.',
    'No mercado, timing é tudo. Quem compra reação paga caro; quem planeja com antecedência monta elenco com margem — e esse tipo de história raramente termina no primeiro capítulo.',
  ],
  board: [
    'Nos bastidores, resultado e paciência andam juntos: diretorias toleram derrota com plano, não derrota com silêncio. A régua interna é a meta do split — e ela não muda por causa de uma semana boa ou ruim.',
    'A relação entre comissão técnica e cúpula é o termômetro real de qualquer projeto. Quando a confiança oscila, tudo fica mais caro: renovação, reforço e até o tempo de treino.',
  ],
  scout: [
    'Os relatórios de scouting valem ouro na preparação: tendência de mapa, estilo de jogo e individualidades do adversário mudam o veto — e o veto, muitas vezes, decide a série antes do primeiro round.',
    'Conhecer o adversário é metade do plano de jogo. A outra metade é ter frieza pra executar o anti-strat quando a partida aperta.',
  ],
  scene: [
    'O cenário competitivo não para: enquanto uma região celebra, outra recalcula rota. Ranking, convites e vagas de Major formam um tabuleiro global em que todo resultado importa.',
    'É esse ecossistema em movimento que torna cada split único — narrativas nascem, rivalidades esquentam e o Major segue no horizonte como régua definitiva.',
  ],
};
const CLOSER_BY_TONE: Record<string, string[]> = {
  good: [
    'O desafio agora é transformar o momento em rotina. No CS, o difícil não é chegar — é sustentar o nível série após série.',
    'Resta saber se este capítulo é ponto fora da curva ou o começo de algo maior. A DRAFT5 segue acompanhando.',
  ],
  bad: [
    'O calendário não dá trégua: a resposta precisa vir já na próxima série, e a DRAFT5 acompanha cada passo dessa reconstrução.',
    'Momentos assim definem projetos — pra cima ou pra baixo. Os próximos resultados dirão qual é o caso.',
  ],
  info: [
    'A história ainda tem capítulos pela frente, e os desdobramentos devem aparecer nas próximas semanas. A DRAFT5 acompanha.',
    'Como sempre no cenário, a única certeza é que nada fica parado por muito tempo.',
  ],
};

export function buildArticle(a: ArticleCtx): string[] {
  // OBS: a lide (a.body) NÃO entra aqui — a página já a mostra como standfirst
  // logo abaixo do título. Repetir viraria parágrafo duplicado. O corpo abre
  // direto no contexto e expande dali.
  const paras: string[] = [];
  // contexto por editoria
  const ctxPool = CONTEXT_BY_CAT[a.cat ?? 'scene'] ?? CONTEXT_BY_CAT.scene;
  paras.push(ct(pick(`${a.id}:ctx`, ctxPool)));
  // aspas de uma fonte (por tom)
  const speakers = a.tone === 'good' ? SPEAKERS_GOOD : a.tone === 'bad' ? SPEAKERS_BAD : SPEAKERS_INFO;
  const sp = pick(`${a.id}:who`, speakers);
  paras.push(`"${ct(pick(`${a.id}:q`, sp.q))}", ${ct('disse')} ${ct(sp.who)}.`);
  // análise ancorada na org/split
  paras.push(ct(pick(`${a.id}:an`, [
    `${ct('No caso da')} ${a.org}${ct(', o contexto do Split')} ${a.split} ${ct('amplifica tudo: com a temporada em andamento, cada semana é uma prova nova — e o elenco sabe que consistência vale mais que pico de forma.')}`,
    `${ct('Internamente, a')} ${a.org} ${ct('trata o Split')} ${a.split} ${ct('como um projeto por etapas: o discurso é de processo, mas ninguém esconde que resultado é o que sustenta processo.')}`,
    `${ct('Pra')} ${a.org}${ct(', o timing importa: no Split')} ${a.split}${ct(', com objetivos da diretoria na mesa e o mercado sempre atento, nenhum resultado é só um resultado.')}`,
  ])));
  // fechamento por tom
  paras.push(ct(pick(`${a.id}:close`, CLOSER_BY_TONE[a.tone] ?? CLOSER_BY_TONE.info)));
  return paras;
}

// -------------------------------------------------------------- social/mundo
export function storySocialStar(seed: string, nick: string, team: string): Story {
  return pick(seed, [
    { title: `${nick} ${ct('dominando o cenário')}`, body: `${nick} (${team}${ct(') está em outro nível nesse split. Provavelmente o melhor do mundo agora. 🔥')}` },
    { title: `${ct('alguém para o')} ${nick}?`, body: `${ct('3 séries seguidas carregando a')} ${team}${ct('. se isso não é forma de melhor do mundo eu não sei o que é 🐐')}` },
    { title: `${nick} ${ct('tá jogando MUITO')}`, body: `${ct('clipes do')} ${nick} ${ct('pipocando na TL toda noite. a')} ${team} ${ct('achou um monstro 👹')}` },
  ]);
}
export function storySocialMeme(seed: string, org: string, champion: boolean): Story {
  if (champion) return pick(seed, [
    { title: `${org} ${ct('CAMPEÃO e a TL surtou')}`, body: `${org} ${ct('levantou a taça e o povo foi à loucura. MERECIDO. 🐐🏆')}` },
    { title: `${ct('acordem, a')} ${org} ${ct('é campeã')}`, body: `${ct('quem apostou na')} ${org} ${ct('no começo do split levanta a mão 🙌 taça em casa e ninguém reclama')}` },
  ]);
  return pick(seed, [
    { title: `e a ${org}...?`, body: `${ct('mais um split da')} ${org} ${ct('sem troféu. calma que ano que vem é nosso 😅🙏')}` },
    { title: `${ct('thread: o que falta pra')} ${org}?`, body: `${ct('elenco tem nome, tem investimento... e a taça que não vem. abre o debate aí 👇')}` },
  ]);
}
export function storySocialHot(seed: string, team: string): Story {
  return pick(seed, [
    { title: `${ct('Fica de olho na')} ${team}`, body: `${ct('A')} ${team} ${ct('vem subindo no ranking e promete brigar lá em cima. Time pra acompanhar. 📈')}` },
    { title: `${team} ${ct('é o time mais subestimado do circuito')}`, body: `${ct('os números da')} ${team} ${ct('nos últimos tempos são de playoff. ninguém tá falando disso 🤫')}` },
  ]);
}
export function storyWorldChampion(seed: string, champ: string, league: string, region: string, runnerUp?: string): Story {
  return pick(seed, [
    { title: `${champ} ${ct('campeão na')} ${region}`, body: `${champ} ${ct('venceu o')} ${league}${runnerUp ? ` ${ct('sobre')} ${runnerUp}` : ''}. ${ct('A cena segue fervendo enquanto você disputa a sua região.')}` },
    { title: `${region}: ${ct('a taça do')} ${league} ${ct('ficou com a')} ${champ}`, body: `${runnerUp ? `${ct('Final contra')} ${runnerUp} ${ct('e ')}` : ''}${ct('mais um capítulo na corrida mundial por vagas de Major.')}` },
  ]);
}
