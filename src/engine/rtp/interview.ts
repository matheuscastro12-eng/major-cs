// RTP iter44 — ENTREVISTA PÓS-JOGO: o herói desce do palco e encontra o microfone.
//
// Fecha o arco de transmissão: dia de jogo (iter43) → walkout/atmosfera (iter41)
// → partida → ENTREVISTA. Toda partida JOGADA rende uma entrevista relâmpago
// (1 pergunta); jogos grandes (Major, finais, clássico contra o rival) viram
// COLETIVA (2 perguntas, sala de imprensa lotada). Partidas SIMULADAS não têm
// entrevista — o herói não pisou no palco, e a graça daqui é responder pelo
// que VOCÊ acabou de jogar.
//
// Camada 100% de APRESENTAÇÃO e 100% stateless: a pergunta nasce da história
// REAL da série (MVP, clutches, derrota apertada, atropelo, revanche, vida no
// Major), determinística pelo matchSeed; a ESCOLHA da resposta é do jogador
// (esse é o jogo); a repercussão é semeada por seed+tom. Nada daqui mexe em
// moral/fama/números — v1 é puro sabor (fiação tom→fama é follow-up anotado).

import { hashStr } from '../../state/hash';
import { stageLabel } from './circuit';
import type { ProMatchResult } from './matchSim';
import type { RoadToProSave } from './types';

const pickBy = <T,>(pool: readonly T[], key: string): T => pool[hashStr(key) % pool.length];

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export type InterviewTone = 'humble' | 'confident' | 'provocative';
export const TONE_LABELS: Record<InterviewTone, string> = {
  humble: 'Humilde', confident: 'Confiante', provocative: 'Provocador',
};

export type InterviewContext =
  | 'major_champion' | 'major_final_loss' | 'major_qualified' | 'major_eliminated' | 'major_life'
  | 'league_title_win' | 'league_title_loss'
  | 'rival_win' | 'rival_loss'
  | 'mvp_show' | 'clutch_hero'
  | 'tight_loss' | 'stomp'
  | 'win' | 'loss'
  | 'followup';

export interface InterviewAnswer {
  tone: InterviewTone;
  text: string;
  echo?: boolean; // essa opção carrega a personalidade do herói (eco sutil)
}

export interface InterviewQuestion {
  context: InterviewContext;
  reporter: string;   // veículo + repórter (sabor de zona mista BR)
  question: string;
  answers: [InterviewAnswer, InterviewAnswer, InterviewAnswer];
}

export interface Interview {
  press: boolean;      // true = coletiva (jogos grandes); false = relâmpago
  setting: string;     // a moldura da cena (zona mista vs sala de imprensa)
  questions: InterviewQuestion[]; // 1 (relâmpago) ou 2 (coletiva)
}

// ─────────────────────────────────────────────────────────────────────────────
// Repórteres (veículos fictícios de cobertura BR)

const REPORTERS = [
  'Portal ClutchBR', 'FragTV', 'GG Notícias', 'CSBR Live', 'Rádio Bomba A', 'Overtime Cast',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Leitura da história da série → contextos que aconteceram DE VERDADE

interface StoryCtx {
  nick: string; teamTag: string;
  oppName: string; oppTag: string;
  won: boolean; mapScore: [number, number];
  rivalNick: string | null;
  majorLabel: string | null;   // rótulo de fase do Major, se houver
}

function seriesTight(result: ProMatchResult): boolean {
  return (result.maps.length > 1 && Math.abs(result.mapScore[0] - result.mapScore[1]) === 1)
    || result.maps.some((m) => Math.abs(m.score[0] - m.score[1]) <= 2);
}

function seriesStomp(result: ProMatchResult): boolean {
  if (!result.won || result.mapScore[1] > 0) return false;
  const avgMargin = result.maps.reduce((s, m) => s + (m.score[0] - m.score[1]), 0) / result.maps.length;
  return avgMargin >= 7;
}

// Contextos em ordem de drama — o 1º vira a pergunta principal; numa coletiva,
// o 2º (se existir) vira a segunda pergunta. Lê o save ANTES do conclude, então
// classificação/eliminação no Major é derivada do W-L pré-jogo + este resultado.
export function matchedContexts(
  save: RoadToProSave, result: ProMatchResult,
  opts: { major: boolean; grudge: boolean },
): InterviewContext[] {
  const out: InterviewContext[] = [];
  const won = result.won;

  const mj = save.world.major;
  if (opts.major && mj) {
    if (mj.phaseStage === 'playoffs') {
      if (mj.tournament.phase === 'final') out.push(won ? 'major_champion' : 'major_final_loss');
      else if (!won) out.push('major_eliminated');
      else out.push('major_life');
    } else {
      const user = mj.tournament.teams.find((tm) => tm.id === mj.userTeamId);
      if (user && !won && user.losses >= 2) out.push('major_eliminated');
      else if (user && won && user.wins >= 2) out.push('major_qualified');
      else out.push('major_life');
    }
  }

  const league = save.world.league;
  if (!opts.major && league?.phase === 'playoffs' && stageLabel(league) === 'GRANDE FINAL') {
    out.push(won ? 'league_title_win' : 'league_title_loss');
  }

  if (opts.grudge) out.push(won ? 'rival_win' : 'rival_loss');
  if (result.mvp && won) out.push('mvp_show');
  if (result.heroStats.clutches >= 2) out.push('clutch_hero');
  if (!won && seriesTight(result)) out.push('tight_loss');
  if (seriesStomp(result)) out.push('stomp');
  out.push(won ? 'win' : 'loss');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Banco de perguntas — jornalismo esportivo BR de zona mista, por contexto.
// 2 variações por contexto, semeadas pelo matchSeed.

function questionFor(ctxId: InterviewContext, c: StoryCtx, seed: string): string {
  const q = (pool: readonly string[]) => pickBy(pool, `${seed}:q:${ctxId}`);
  switch (ctxId) {
    case 'major_champion': return q([
      `${c.nick}, CAMPEÃO DO MAJOR! Deixa eu te perguntar o que o Brasil inteiro quer saber: o que passou na sua cabeça quando caiu o último round?`,
      `${c.nick}, você acabou de levantar o troféu mais pesado do CS. Pra quem te via jogando em casa: que recado você manda agora?`,
    ]);
    case 'major_final_loss': return q([
      `${c.nick}, sei que a ferida tá aberta, mas preciso perguntar: o que faltou pra ${c.teamTag} na final?`,
      `${c.nick}, vice de Major também é história — mas ninguém joga pra ser vice. Onde essa final escapou?`,
    ]);
    case 'major_qualified': return q([
      `${c.nick}, CLASSIFICADOS! Vaga carimbada na próxima fase do Major. Essa série contra ${c.oppName} foi o plano ou foi coração?`,
      `${c.nick}, vocês garantem a vida no Major com essa vitória. O vestiário já pode comemorar ou a cabeça já tá na próxima?`,
    ]);
    case 'major_eliminated': return q([
      `${c.nick}, fim de caminhada no Major. É cedo, eu sei — mas o que você leva dessa campanha?`,
      `${c.nick}, a eliminação dói. ${c.oppName} foi melhor hoje ou vocês se perderam sozinhos?`,
    ]);
    case 'major_life': return q([
      `${c.nick}, ${c.majorLabel ?? 'cada série do Major vale uma vida'} — como se joga com esse peso nas costas?`,
      `${c.nick}, o Major não perdoa série ruim. Como a equipe administra a pressão jogo a jogo?`,
    ]);
    case 'league_title_win': return q([
      `${c.nick}, É CAMPEÃO! Título na conta depois de uma final contra ${c.oppName}. Dedica pra quem?`,
      `${c.nick}, taça levantada! Teve um momento na final em que você pensou "hoje ninguém tira da gente"?`,
    ]);
    case 'league_title_loss': return q([
      `${c.nick}, o título ficou com ${c.oppName}. Final é detalhe — qual detalhe custou o troféu hoje?`,
      `${c.nick}, perder uma grande final marca. O que você fala pro torcedor que ficou até o último round?`,
    ]);
    case 'rival_win': return q([
      `${c.nick}, mais um capítulo do clássico — e dessa vez ${c.rivalNick ?? 'o rival'} saiu calado. Isso vale mais que três pontos?`,
      `${c.nick}, vocês bateram ${c.oppName} no jogo que todo mundo marca no calendário. Tem gostinho especial ou é só mais uma série?`,
    ]);
    case 'rival_loss': return q([
      `${c.nick}, ${c.rivalNick ?? 'o rival'} venceu e já provocou na saída do palco. Vai responder aqui ou dentro do servidor?`,
      `${c.nick}, derrota no clássico sempre pesa dobrado. O que aconteceu contra ${c.oppName} hoje?`,
    ]);
    case 'mvp_show': return q([
      `${c.nick}, MVP da série com atuação de gala. Existe explicação tática pra esse seu dia ou foi só inspiração?`,
      `${c.nick}, o servidor foi seu hoje — MVP incontestável. Em que momento você sentiu que a partida tinha virado SUA?`,
    ]);
    case 'clutch_hero': return q([
      `${c.nick}, foram clutches atrás de clutches nessa série — a arena veio abaixo. O que passa na cabeça num 1vX com tudo em jogo?`,
      `${c.nick}, você virou rounds impossíveis hoje. Clutch se treina ou se nasce com isso?`,
    ]);
    case 'tight_loss': return q([
      `${c.nick}, uma série decidida no detalhe — ${c.mapScore[0]} a ${c.mapScore[1]} pra ${c.oppTag}. Derrota assim ensina ou só machuca?`,
      `${c.nick}, faltou um round aqui, uma bala ali. Onde essa série escorregou das mãos de vocês?`,
    ]);
    case 'stomp': return q([
      `${c.nick}, um ATROPELO — ${c.oppName} não viu de onde veio. Isso é recado pro resto da chave?`,
      `${c.nick}, vitória sem dar respiro pro adversário. Esse é o teto de vocês ou ainda tem mais?`,
    ]);
    case 'win': return q([
      `${c.nick}, vitória sólida sobre ${c.oppName}. O que funcionou hoje que vocês vinham buscando?`,
      `${c.nick}, mais três pontos na caminhada. Dá pra dizer que o time encontrou a identidade?`,
      `${c.nick}, série controlada contra ${c.oppName}. Esse é o nível que a gente deve esperar daqui pra frente?`,
      `${c.nick}, ${c.mapScore[0]} a ${c.mapScore[1]} no placar. Onde essa série foi ganha, na sua leitura?`,
    ]);
    case 'loss': return q([
      `${c.nick}, resultado ruim contra ${c.oppName}. Foi dia ruim ou tem algo maior pra corrigir?`,
      `${c.nick}, a torcida saiu em silêncio hoje. Que resposta vocês devem na próxima série?`,
      `${c.nick}, ${c.oppName} levou essa. O que o vestiário conversa depois de uma noite assim?`,
      `${c.nick}, o placar não ajudou hoje. Em que momento a série escapou do plano de vocês?`,
    ]);
    case 'followup': return q([
      `Última pergunta, ${c.nick}: o que muda na preparação de vocês daqui pra frente?`,
      `${c.nick}, pra fechar: um recado pra torcida que acompanhou tudo de fora?`,
      `Encerrando, ${c.nick}: qual é o próximo degrau dessa equipe?`,
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Respostas — 3 tons por contexto (a escolha é do jogador; isso é o jogo).

function answersFor(ctxId: InterviewContext, c: StoryCtx): Record<InterviewTone, string> {
  const w = c.won;
  switch (ctxId) {
    case 'major_champion': return {
      humble: 'Passou minha família, quem acreditou quando ninguém acreditava. Esse troféu não é meu, é nosso.',
      confident: 'Passou que a gente treinou pra esse exato momento. Ninguém aqui está surpreso — era pra ser nosso.',
      provocative: 'Passou a cara de todo mundo que duvidou. Guardei cada tweet. CADA um.',
    };
    case 'major_final_loss': return {
      humble: 'Faltou a gente. Eles foram melhores nos detalhes e final se ganha no detalhe. Parabéns a eles.',
      confident: 'Faltou um mapa. A gente volta pra próxima final — e da próxima vez a taça vem.',
      provocative: 'Faltou o juiz apitar o que tinha que apitar... brincadeira. Mas anota: essa conta a gente cobra.',
    };
    case 'major_qualified': return {
      humble: 'Foi trabalho. Cada um fez o simples bem feito — classificação é do grupo inteiro, comissão junto.',
      confident: 'Foi plano executado. A gente estudou eles a semana toda e deu exatamente o que preparamos.',
      provocative: 'Coração? A gente veio pra passar por cima de qualquer um da chave. Próximo.',
    };
    case 'major_eliminated': return {
      humble: 'Levo aprendizado. Dói muito, mas esse grupo é novo nesse palco — a gente volta mais maduro.',
      confident: 'Levo a certeza de que o nível é esse e a gente compete nele. Ano que vem tem Major de novo.',
      provocative: 'Ninguém aqui se perdeu sozinho. Reveja os rounds decisivos e me diz se faltou CS da nossa parte.',
    };
    case 'major_life': return {
      humble: 'Com humildade e um round de cada vez. Pressão é privilégio — muita equipe queria estar aqui.',
      confident: 'Peso? A gente treinou o ano inteiro pra carregar exatamente isso. Tô confortável.',
      provocative: 'Pressão é pros outros. Quem tem que se preocupar é quem cruza com a gente no bracket.',
    };
    case 'league_title_win': return {
      humble: 'Dedico pra base, pra quem limpou a gaveta de troféu esperando esse dia. Obrigado, torcida.',
      confident: 'Dedico pro vestiário. Time que treina como a gente treina levanta taça — simples assim.',
      provocative: 'Dedico pra imprensa que escalou a gente em quinto no power ranking. Beijos.',
    };
    case 'league_title_loss': return {
      humble: 'Custou a gente não estar cem por cento no dia mais importante. O torcedor merecia mais.',
      confident: 'Custou um detalhe que a gente já sabe qual é. Chegamos na final — ano que vem chegamos e vencemos.',
      provocative: 'Perguntem pra eles se foi tranquilo. Vice hoje, mas ninguém aí quer cruzar com a gente de novo.',
    };
    case 'rival_win': return {
      humble: 'Clássico é sempre difícil e hoje caiu pro nosso lado. Respeito total a eles — rivalidade boa é assim.',
      confident: 'Vale mais, claro. Clássico mostra quem tá na frente de verdade — e o placar de hoje fala sozinho.',
      provocative: `Fala pro ${c.rivalNick ?? 'rival'} que o microfone tá aberto se ele quiser explicar o placar.`,
    };
    case 'rival_loss': return {
      humble: 'Respondo trabalhando. Hoje eles mereceram — provocação faz parte, quem perdeu escuta calado.',
      confident: 'Respondo no próximo capítulo. Rivalidade é maratona, não é tiro — e essa história tá longe do fim.',
      provocative: 'Ele provoca porque sabe que precisa: no dia que me vencer jogando quieto, aí eu me preocupo.',
    };
    case 'mvp_show': return {
      humble: 'Foi o time que me deixou confortável pra jogar. MVP é individual, mas quem abre o jogo pra mim são eles.',
      confident: 'Preparação. Quem vê o clipe acha inspiração; quem vê o treino sabe que é rotina.',
      provocative: 'Explicação tática? Sou eu no servidor. Alguns dias o resto do mundo só assiste.',
    };
    case 'clutch_hero': return {
      humble: 'Sinceramente? Penso nos meus companheiros olhando a cam. Não posso deixar eles na mão.',
      confident: 'Passa silêncio. Clutch é matemática: informação, tempo e mira. Eu treino os três.',
      provocative: 'Penso que tem 1vX de novo porque deixaram sobrar pra mim... mas relaxa, eu resolvo.',
    };
    case 'tight_loss': return {
      humble: 'Ensina — se a gente tiver humildade de rever cada round. Detalhe se corrige com treino.',
      confident: 'Machuca hoje, ensina amanhã. Série de margem mínima contra essa equipe mostra que estamos no nível.',
      provocative: 'Escorregou nos rounds que o servidor resolveu ficar criativo. Semana que vem não escapa.',
    };
    case 'stomp': return {
      humble: 'Recado nenhum — foi um dia muito acima da média. Semana que vem começa do zero de novo.',
      confident: 'É recado, sim: quando nosso CS encaixa, esse é o padrão. E vem mais.',
      provocative: 'A chave inteira assistiu. Quem quiser conferir de perto, o bracket diz onde a gente vai estar.',
    };
    case 'win': return {
      humble: 'Funcionou a paciência. Vitória boa, mas tem muito erro pra corrigir no VOD ainda.',
      confident: 'Funcionou o que a gente vem construindo. Identidade se prova jogo a jogo — hoje provamos de novo.',
      provocative: `Funcionou tudo. O ${c.oppTag} que me desculpe, mas hoje só tinha um time no servidor.`,
    };
    case 'loss': return {
      humble: 'Tem coisa pra corrigir e a responsabilidade é nossa. O torcedor merece resposta rápida.',
      confident: 'Dia ruim. Time nenhum atravessa a temporada sem um — o importante é como a gente levanta.',
      provocative: 'Maior que hoje só a vontade de reencontrar eles no bracket. Guarda essa série.',
    };
    case 'followup': return {
      humble: w
        ? 'Muda nada: pé no chão, treino e respeito por quem vem pela frente. É o que trouxe a gente até aqui.'
        : 'Muda a atenção ao detalhe. E pra torcida: obrigado por ficar — a resposta vem dentro do servidor.',
      confident: w
        ? 'A régua sobe. Time que vence tem obrigação de vencer de novo — e a gente aceita essa cobrança.'
        : 'A confiança não muda. O trabalho tá certo; resultado é consequência e ela vem.',
      provocative: w
        ? 'Muda que agora todo mundo estuda a gente. Boa sorte — demo não mostra o que vem por aí.'
        : 'Anota os nomes de hoje. Temporada é longa e a gente tem memória ótima.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eco de personalidade — UMA opção referencia sutilmente quem o herói é.
// (save.player.personality: leader/mercenary/prodigy/hothead/resilient)

const PERSONA_TONE: Record<string, InterviewTone> = {
  leader: 'humble', resilient: 'humble', prodigy: 'confident', mercenary: 'confident', hothead: 'provocative',
};

const PERSONA_ECHO: Record<string, string> = {
  leader: 'Ninguém vence sozinho nesse jogo — o grupo vem antes de mim, sempre.',
  resilient: 'Já estive muito mais embaixo e voltei. É disso que eu sou feito.',
  prodigy: 'Eu cresci pra esses palcos — desde moleque era aqui que eu me via.',
  mercenary: 'Meu trabalho fala por mim. E o mercado inteiro tá vendo.',
  hothead: 'E quem duvidou sabe exatamente onde me encontrar.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Coletiva ou zona mista?

export function isPressConference(save: RoadToProSave, opts: { major: boolean; grudge: boolean }): boolean {
  if (opts.major) return true; // qualquer série de Major tem sala de imprensa
  if (opts.grudge) return true; // clássico contra o rival lota a coletiva
  const league = save.world.league;
  return !!league && league.phase === 'playoffs' && stageLabel(league) === 'GRANDE FINAL';
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem da entrevista (determinística pelo matchSeed)

export function buildInterview(
  save: RoadToProSave, result: ProMatchResult,
  opts: { major: boolean; matchSeed: number; grudge: boolean },
): Interview {
  const seed = `itv:${opts.matchSeed}`;
  const press = isPressConference(save, opts);
  // Rótulo REAL da fase do Major (era um campo morto, sempre null): a pergunta
  // de 'major_life' cita a campanha de verdade — "Suíça 2–1" / "playoffs".
  const mj = opts.major ? save.world.major : null;
  const mjUser = mj?.tournament.teams.find((tm) => tm.id === mj.userTeamId);
  const majorLabel = mj
    ? (mj.phaseStage === 'playoffs'
        ? 'playoffs do Major, onde cada série vale uma vida'
        : mjUser ? `Suíça ${mjUser.wins}–${mjUser.losses}, cada série valendo uma vida` : null)
    : null;
  const story: StoryCtx = {
    nick: save.player.nick, teamTag: save.team.tag,
    oppName: result.oppName, oppTag: result.oppTag,
    won: result.won, mapScore: result.mapScore,
    rivalNick: save.media?.rival?.playerNick ?? null,
    majorLabel,
  };

  const contexts = matchedContexts(save, result, opts);
  const chosen: InterviewContext[] = press
    ? [contexts[0], contexts[1] ?? 'followup']
    : [contexts[0]];

  const personaTone = PERSONA_TONE[save.player.personality];
  const echoText = PERSONA_ECHO[save.player.personality];

  const questions = chosen.map((ctxId, qi) => {
    const base = answersFor(ctxId, story);
    const answers = (['humble', 'confident', 'provocative'] as const).map((tone): InterviewAnswer => {
      // eco de personalidade só na 1ª pergunta, no tom natural do herói — sutil.
      const echo = qi === 0 && tone === personaTone && !!echoText;
      return { tone, text: echo ? `${base[tone]} ${echoText}` : base[tone], echo };
    }) as [InterviewAnswer, InterviewAnswer, InterviewAnswer];
    return {
      context: ctxId,
      reporter: pickBy(REPORTERS, `${seed}:rep:${qi}`),
      question: questionFor(ctxId, story, `${seed}:${qi}`),
      answers,
    };
  });

  const setting = press
    ? pickBy([
        'Sala de imprensa lotada — flashes, gravadores empilhados e transmissão ao vivo.',
        'Coletiva oficial: a assessoria pede ordem, mas a sala está fervendo.',
        'Mesa da coletiva, garrafa d’água e vinte microfones apontados pra você.',
      ] as const, `${seed}:set`)
    : pickBy([
        'Na saída do palco, um microfone encosta antes de você tirar o fone.',
        'Zona mista apertada — o repórter te alcança ainda no corredor.',
        'Meio caminho pro vestiário e a câmera acende na sua frente — ao vivo.',
      ] as const, `${seed}:set`);

  return { press, setting, questions };
}

// ─────────────────────────────────────────────────────────────────────────────
// Repercussão — o eco imediato da resposta (semeado por seed+tom+resultado).
// Nada de stats: uma linha de consequência de sabor.

export function repercussion(
  tone: InterviewTone,
  ctx: { matchSeed: number; qIndex: number; won: boolean; rival: boolean; rivalNick: string | null; press: boolean },
): string {
  const key = `rep:${ctx.matchSeed}:${ctx.qIndex}:${tone}`;
  if (tone === 'provocative') {
    if (ctx.rival) return pickBy([
      `${ctx.rivalNick ?? 'O rival'} já respondeu nos stories. Isso vai longe…`,
      'A frase virou clipe antes de você sair da sala. O clássico ganhou mais um capítulo.',
    ] as const, key);
    return pickBy([
      'Isso vai dar manchete amanhã — a assessoria já olhou feio.',
      'O recorte já circula com legenda em caps lock. O chat pegou fogo.',
      ctx.won ? 'A torcida adversária anotou. Bom ter razão no próximo encontro…' : 'Declaração corajosa pra quem perdeu — a imprensa não vai esquecer.',
    ] as const, key);
  }
  if (tone === 'confident') return pickBy([
    'O clipe já roda no Twitter — hype puro no chat.',
    ctx.won ? 'A bancada elogia: “é assim que fala um time grande.”' : 'Metade da mesa comprou a confiança; a outra metade quer ver na próxima série.',
    'A frase vira thumbnail de vídeo antes da meia-noite.',
  ] as const, key);
  return pickBy([
    'A torcida amou a postura — “esse aí tem a cabeça no lugar.”',
    'Corta pro estúdio: a bancada elogia a maturidade da resposta.',
    ctx.won ? 'Resposta de campeão — até o adversário deu like.' : 'Dignidade na derrota: o respeito da comunidade só cresceu.',
  ] as const, key);
}

// Fecho da cena depois da última resposta.
export function interviewCloser(press: boolean, matchSeed: number): string {
  return press
    ? pickBy([
        'A assessoria encerra: “obrigado a todos” — os flashes continuam até a porta.',
        '“Sem mais perguntas.” Você levanta e a sala ainda murmura sua última frase.',
      ] as const, `close:${matchSeed}`)
    : pickBy([
        'O repórter agradece e você segue pro vestiário com o fone no pescoço.',
        'Câmera desliga, tapinha nas costas — “boa entrevista” — e o corredor te engole.',
      ] as const, `close:${matchSeed}`);
}
