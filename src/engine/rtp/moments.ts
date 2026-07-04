// RTP3 — momentos-chave: o protagonista vive 4 decisões por partida.
//
// Cada momento é uma situação (entry, clutch, call de IGL, pistol…) com 2-3
// opções. A opção testa um ATRIBUTO específico, com um perfil de risco (aggro/
// safe/smart). A resolução usa o atributo EFETIVO (já modulado pelo estado
// off-game — ver engine/rtp/match.ts) × dificuldade do adversário × RNG.
//
// O resultado vira deltas na linha do protagonista (frags, mortes, aberturas,
// clutches) + narrativa. A média dos momentos (momentScore) determina se você
// carrega ou entrega a partida (boost no skill efetivo na simulação do time).

import type { Rng } from '../rng';
import { ATTR_LABEL, type AttrKey } from '../attributes';
import type { Role } from '../../types';

export type MomentStyle = 'aggro' | 'safe' | 'smart';
export type MomentResult = 'success' | 'partial' | 'fail';

export interface MomentOption {
  id: string;
  label: string;
  attr: AttrKey;        // atributo testado
  style: MomentStyle;
  desc: string;
}

export interface Moment {
  id: string;
  kind: string;
  title: string;
  situation: string;
  options: MomentOption[];
}

export interface MomentOutcome {
  result: MomentResult;
  value: number;        // 0..1 (peso no momentScore)
  frags: number;
  deaths: number;
  openings: number;
  clutches: number;
  narrative: string;
  execPerf?: number;    // v15 — performance no minigame do momento-chave (0..1)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Atributo "assinatura" de cada função (o duelo característico da role).
const ROLE_DUEL_ATTR: Record<Role, AttrKey> = {
  Entry: 'aim', AWP: 'awp', Rifler: 'aim', Support: 'teamwork', Lurker: 'anticipation', IGL: 'decisions',
};
const ROLE_DUEL_LABEL: Record<Role, string> = {
  Entry: 'Abrir o bombsite', AWP: 'Segurar o AWP no ângulo', Rifler: 'Vencer o duelo de rifle',
  Support: 'Util perfeito pro time', Lurker: 'Ler a rotação no flanco', IGL: 'Chamar o mid-round',
};

// ─────────────────────────────────────────────────────────────────────────────
// Geração dos 4 momentos da partida

export function generateMoments(role: Role): Moment[] {
  const duelAttr = ROLE_DUEL_ATTR[role];

  const pistol: Moment = {
    id: 'm-pistol', kind: 'pistol',
    title: 'Round de pistola',
    situation: 'Primeiro round, todo mundo de Glock/USP. O pistol decide o embalo do half.',
    options: [
      { id: 'rush', label: 'Rushar agressivo', attr: 'aim', style: 'aggro', desc: 'Duelo seco. Alto risco, alto retorno.' },
      { id: 'stack', label: 'Stack com o time', attr: 'teamwork', style: 'safe', desc: 'Joga junto, troca garantida.' },
      { id: 'read', label: 'Ler e reposicionar', attr: 'gameSense', style: 'smart', desc: 'Pega o ângulo certo na informação.' },
    ],
  };

  const duel: Moment = {
    id: 'm-duel', kind: 'duel',
    title: ROLE_DUEL_LABEL[role],
    situation: 'Round de gun. A jogada passa por você — é o seu momento na função.',
    options: [
      { id: 'commit', label: 'Ir pra cima', attr: duelAttr, style: 'aggro', desc: 'Confia na mão e força o espaço.' },
      { id: 'trade', label: 'Jogar pelo trade', attr: 'teamwork', style: 'safe', desc: 'Garante a troca, sem heroísmo.' },
      { id: 'angle', label: 'Pegar off-angle', attr: 'offAngles', style: 'smart', desc: 'Surpreende num ângulo incomum.' },
    ],
  };

  const clutch: Moment = {
    id: 'm-clutch', kind: 'clutch',
    title: 'Clutch 1vX',
    situation: 'Round perdido… menos você. Vivo contra 2, bomba plantada, o time confia.',
    options: [
      { id: 'aggro', label: 'Pegar os duelos', attr: 'aim', style: 'aggro', desc: 'Vai pra cima antes do flush.' },
      { id: 'time', label: 'Jogar o tempo', attr: 'composure', style: 'smart', desc: 'Isola os duelos, usa o relógio.' },
      { id: 'fake', label: 'Fake defuse / reposição', attr: 'gameSense', style: 'safe', desc: 'Engana e força o erro.' },
    ],
  };

  const mapPoint: Moment = {
    id: 'm-mappoint', kind: 'mappoint',
    title: 'Round de mapa',
    situation: 'Match point. A pressão é máxima e a torcida segura a respiração.',
    options: [
      { id: 'star', label: 'Assumir a responsa', attr: 'clutch', style: 'aggro', desc: 'Quer a bola na hora decisiva.' },
      { id: 'team', label: 'Confiar no sistema', attr: 'discipline', style: 'safe', desc: 'Executa o treinado, sem inventar.' },
      { id: 'calm', label: 'Manter a frieza', attr: 'concentration', style: 'smart', desc: 'Respira e joga limpo.' },
    ],
  };

  return [pistol, duel, clutch, mapPoint];
}

// Geradores extras (RTP overhaul) — situações táticas reais. Mesma shape Moment.

export function generateEntry(role: Role): Moment {
  return {
    id: 'm-entry', kind: 'entry',
    title: 'Abertura no bombsite',
    situation: 'Execução montada. O time joga os smokes e a porta é sua: a primeira bala decide o round.',
    options: [
      { id: 'dry', label: 'Entrar seco na frente', attr: 'aimMovement', style: 'aggro', desc: 'Swing rápido, sem esperar util. Pega o ângulo de surpresa.' },
      { id: 'flash', label: 'Esperar o flash do colega', attr: role === 'Support' ? 'teamwork' : 'reaction', style: 'safe', desc: 'Entra cego do inimigo, troca garantida.' },
      { id: 'jiggle', label: 'Jiggle pra puxar info', attr: 'gameSense', style: 'smart', desc: 'Mostra e recolhe pra ler a defesa antes.' },
    ],
  };
}

export function generateRetake(): Moment {
  return {
    id: 'm-retake', kind: 'retake',
    title: 'Retake — bomba plantada',
    situation: 'Perderam o site, bomba no chão, relógio correndo. Vocês precisam retomar JÁ.',
    options: [
      { id: 'fast', label: 'Retake rápido no grito', attr: 'aim', style: 'aggro', desc: 'Invade junto antes do tempo apertar.' },
      { id: 'util', label: 'Retake com utilitário', attr: 'composure', style: 'smart', desc: 'Joga molotov/smoke pra forçar o erro.' },
      { id: 'pick', label: 'Caçar o pick e isolar', attr: 'offAngles', style: 'safe', desc: 'Pega um e transforma em vantagem numérica.' },
    ],
  };
}

// Sub-momento de UMA etapa do clutch (1vX). Varia conforme inimigos vivos +
// tempo de bomba. Cada etapa é resolvida por resolveMoment (state machine na UI).
export function clutchStepMoment(alive: number, bombSecs: number | null): Moment {
  const pressured = bombSecs != null && bombSecs <= 8;
  const situation = bombSecs != null
    ? `1v${alive} no retake — bomba plantada, ${bombSecs}s no relógio. ${pressured ? 'O tempo está apertando.' : 'Dá pra jogar.'}`
    : `1v${alive}. O time confia, a torcida prende a respiração. É você contra ${alive}.`;
  return {
    id: `m-clutchstep-${alive}`, kind: 'clutch',
    title: `CLUTCH 1v${alive}`,
    situation,
    options: [
      { id: 'duel', label: 'Pegar o próximo duelo', attr: 'aim', style: 'aggro', desc: 'Vai pra cima do isolado agora.' },
      { id: 'time', label: pressured ? 'Correr pro defuse' : 'Jogar o tempo', attr: pressured ? 'composure' : 'concentration', style: 'smart', desc: pressured ? 'Aposta no defuse sob pressão.' : 'Isola os duelos, usa o relógio.' },
      { id: 'read', label: 'Ler e reposicionar', attr: 'anticipation', style: 'safe', desc: 'Surpreende num ângulo que ninguém espera.' },
    ],
  };
}

// Beat de IGL — chamada de mid-round que mexe com o TIME todo (não só você).
export function generateIGL(): Moment {
  return {
    id: 'm-igl', kind: 'igl',
    title: 'Call de mid-round',
    situation: 'A informação chegou. Os 4 esperam sua chamada — o que a gente executa?',
    options: [
      { id: 'exec', label: 'Executar no A agora', attr: 'decisions', style: 'aggro', desc: 'Compromete o time num hit rápido e coordenado.' },
      { id: 'fake', label: 'Fake B e vira pro A', attr: 'vision', style: 'smart', desc: 'Puxa a rotação e abre o outro lado.' },
      { id: 'default', label: 'Default e joga a info', attr: 'leadership', style: 'safe', desc: 'Mantém o controle de mapa, decide no detalhe.' },
    ],
  };
}

export function generateEconomy(): Moment {
  return {
    id: 'm-economy', kind: 'economy',
    title: 'Decisão de economia',
    situation: 'Caixa curta depois de perder o último. O time olha pra você: o que a gente faz?',
    options: [
      { id: 'force', label: 'Force buy — vai pra cima', attr: 'decisions', style: 'aggro', desc: 'Compra tudo agora pra não dar eco fácil.' },
      { id: 'save', label: 'Save — guarda pro próximo', attr: 'discipline', style: 'safe', desc: 'Economiza, joga o full no round seguinte.' },
      { id: 'halfbuy', label: 'Meio-buy esperto', attr: 'gameSense', style: 'smart', desc: 'Armas leves + util, aposta no surpreender.' },
    ],
  };
}

// Variedade de conteúdo — situações táticas extras (mesma shape Moment, prontas
// pra entrar no buildBeatPlan como as demais).

// Eco forçado — de pistol contra full buy. O round é "perdido", mas dano e info
// têm valor. A role muda a leitura: Support joga o stack, o resto caça exit.
export function generateForcedEco(role: Role): Moment {
  return {
    id: 'm-forcedeco', kind: 'forcedeco',
    title: 'Eco forçado',
    situation: 'Zero de caixa: cinco pistols contra full buy. Ninguém espera o round — e é exatamente por isso que ele vale ouro.',
    options: [
      { id: 'rushstack', label: 'Rush juntos num ângulo só', attr: role === 'Support' ? 'teamwork' : 'aim', style: 'aggro', desc: 'Cinco pistols na mesma porta. Ou sai o milagre, ou sai rápido.' },
      { id: 'damage', label: 'Tirar dano e sair vivo', attr: 'discipline', style: 'safe', desc: 'Quebra colete de longe e preserva o próximo round.' },
      { id: 'exit', label: 'Caçar a exit frag no tempo', attr: 'anticipation', style: 'smart', desc: 'Espera a saída deles relaxar e pune a arma cara.' },
    ],
  };
}

// Anti-eco — o round que "não pode" perder. Jogar demais é o único jeito de errar.
export function generateAntiEco(): Moment {
  return {
    id: 'm-antieco', kind: 'antieco',
    title: 'Anti-eco',
    situation: 'Eles estão de pistol e vocês de full. Round obrigatório — perder aqui quebra a economia E o moral. Como você joga?',
    options: [
      { id: 'punish', label: 'Pushar e atropelar', attr: 'aim', style: 'aggro', desc: 'Vai pra cima antes que armem a cilada. Cuidado com o stack.' },
      { id: 'range', label: 'Segurar distância', attr: 'discipline', style: 'safe', desc: 'Pistol não ganha duelo de longe. Zero brecha, zero vergonha.' },
      { id: 'spread', label: 'Fechar as trocas em dupla', attr: 'positioning', style: 'smart', desc: 'Cada ângulo com cobertura — se um cair, o rush morre no trade.' },
    ],
  };
}

// Pós-plant 1vX com o kit — você é o último CT vivo, defuse na mão. Kind
// 'clutch' de propósito: fechar aqui conta (e narra) como clutch.
export function generatePostPlant(): Moment {
  return {
    id: 'm-postplant', kind: 'clutch',
    title: 'Pós-plant — 1vX com o kit',
    situation: 'Bomba plantada, você é o último CT vivo — mas tem o kit. O relógio corre e cada passo faz barulho.',
    options: [
      { id: 'clear', label: 'Limpar os duelos antes', attr: 'aim', style: 'aggro', desc: 'Mata primeiro, defusa depois. Sem ninguém vivo, não tem stick errado.' },
      { id: 'ninja', label: 'Ninja defuse na smoke', attr: 'composure', style: 'smart', desc: 'Entra calado, sticka na fumaça e reza meio segundo.' },
      { id: 'sound', label: 'Fake no kit pra puxar o push', attr: 'anticipation', style: 'safe', desc: 'Toca o defuse, solta e espera — quem vier apressado, morre.' },
    ],
  };
}

// Decisão de save — o round já foi; a briga agora é pela economia do próximo.
export function generateSaveCall(role: Role): Moment {
  return {
    id: 'm-savecall', kind: 'savecall',
    title: 'Salvar ou tentar?',
    situation: 'Deu ruim: 2v4, bomba plantada e o round praticamente perdido. Na sua mão, uma AWP/rifle caro. O que você faz com os segundos que restam?',
    options: [
      { id: 'try', label: 'Tentar o impossível', attr: 'clutch', style: 'aggro', desc: 'Ninguém salva highlight. Vai atrás do retake maluco.' },
      { id: 'save', label: 'Salvar as armas', attr: 'discipline', style: 'safe', desc: 'Engole o round e garante o full buy do próximo. Frio, mas certo.' },
      { id: 'flank', label: 'Sumir e punir o exit', attr: role === 'Lurker' ? 'anticipation' : 'gameSense', style: 'smart', desc: 'Se esconde no flanco e cobra caro de quem sair comemorando.' },
    ],
  };
}

// Timeout tático — o jogo travou e o coach pausou. O que você faz da pausa
// mexe com o TIME todo, não só com você.
export function generateTimeout(role: Role): Moment {
  return {
    id: 'm-timeout', kind: 'timeout',
    title: 'Timeout tático',
    situation: 'Sequência de rounds perdidos e o coach pediu pausa. Trinta segundos, cinco cabeças quentes. O que você coloca na mesa?',
    options: [
      { id: 'fire', label: 'Cobrar atitude no grito', attr: 'communication', style: 'aggro', desc: 'Sacode o time. Ou acorda todo mundo, ou racha de vez.' },
      { id: 'reset', label: 'Acalmar e resetar', attr: role === 'IGL' ? 'leadership' : 'composure', style: 'safe', desc: 'Respira, limpa a lousa: "round novo, jogo novo".' },
      { id: 'adjust', label: 'Propor o ajuste tático', attr: 'vision', style: 'smart', desc: 'Você viu o padrão deles. Aponta a correção exata.' },
    ],
  };
}

// Último round do half — a última chance de mexer no placar antes da troca de
// lado (e a última leitura que eles levam pro intervalo).
export function generateLastRoundHalf(role: Role): Moment {
  const duelAttr = ROLE_DUEL_ATTR[role];
  return {
    id: 'm-lasthalf', kind: 'lasthalf',
    title: 'Último round do half',
    situation: 'Round 12. O que acontecer aqui vira o tom do intervalo — e a informação que você mostrar agora, eles estudam na troca de lado.',
    options: [
      { id: 'momentum', label: 'Fechar o half por cima', attr: duelAttr, style: 'aggro', desc: 'Carrega o round na sua função e entra no intervalo embalado.' },
      { id: 'standard', label: 'Jogar o padrão treinado', attr: 'discipline', style: 'safe', desc: 'Nada de invenção: executa o protocolo e não entrega leitura.' },
      { id: 'pocket', label: 'Gastar a jogada ensaiada', attr: 'vision', style: 'smart', desc: 'Solta a estratégia do bolso — eles não têm demo disso.' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução de um momento

const STYLE_MOD: Record<MomentStyle, { chance: number; winFrags: number; winOpen: number; failDeath: number }> = {
  // aggro: ceiling alto (mais frags/aberturas), mas falha custa morte
  aggro: { chance: -0.06, winFrags: 2, winOpen: 1, failDeath: 1 },
  // safe: alta taxa de sucesso, impacto modesto, raramente morre
  safe: { chance: +0.10, winFrags: 1, winOpen: 0, failDeath: 0 },
  // smart: equilibrado, recompensa leitura
  smart: { chance: +0.02, winFrags: 1, winOpen: 0, failDeath: 0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Narrativa por SITUAÇÃO — cada `kind` de momento (entry, retake, eco, call de
// IGL, save…) rende uma frase própria pra cada desfecho, em vez de 3 linhas
// genéricas pra tudo. Puro texto: NÃO toca em value/frags/deaths/chance.
// `failAggro` é usado quando o estilo era agressivo (o custo de morrer aparece);
// `failSafe` cobre os desfechos seguros/inteligentes.

interface MomentNarr { success: string; partial: string; failAggro: string; failSafe: string; }

const MOMENT_NARR: Record<string, MomentNarr> = {
  default: {
    success: 'Jogada perfeita — o round vira pro seu lado.',
    partial: 'Saiu meia-boca: trocou um, mas não decidiu o round.',
    failAggro: 'Foi pego na agressão — morreu cedo e abriu o round pro adversário.',
    failSafe: 'Não funcionou: o adversário leu a jogada.',
  },
  pistol: {
    success: 'Pistola limpa! Você abriu o round e o time entra no half com sangue nos olhos.',
    partial: 'Trocou no pistol, mas o round ficou 50/50 — ninguém dominou.',
    failAggro: 'Rushou seco e morreu na entrada: o pistol já começou perdido.',
    failSafe: 'O stack não pegou nada — eles leram o setup e passaram fácil.',
  },
  duel: {
    success: 'Duelo ganho na função — você abriu espaço e o round desandou pro seu lado.',
    partial: 'Trocou um, mas não foi o duelo que decide o round.',
    failAggro: 'Foi pego forçando o duelo: morreu cedo e entregou o espaço.',
    failSafe: 'Perdeu a leitura — o adversário chegou primeiro no ângulo.',
  },
  clutch: {
    success: 'CLUTCH! Você fechou o 1vX sozinho e o comms explode.',
    partial: 'Levou o clutch quase até o fim — tirou um ou dois, mas caiu no último duelo.',
    failAggro: 'Foi atrás dos duelos rápido demais e o clutch morreu na pressa.',
    failSafe: 'Jogou o tempo, mas não achou a brecha — o round escapou.',
  },
  mappoint: {
    success: 'No match point você assumiu a responsa e cravou o round que fecha o mapa.',
    partial: 'Round de mapa quente: você contribuiu, mas foi pro detalhe.',
    failAggro: 'A pressão do match point pesou — arriscou demais e caiu.',
    failSafe: 'Executou o padrão, mas eles tinham a resposta pro round decisivo.',
  },
  entry: {
    success: 'Entry perfeito! Você abriu o bombsite na primeira bala e o time inundou atrás.',
    partial: 'Trocou na entrada: abriu o espaço, mas o refrag veio junto.',
    failAggro: 'Swingou seco e comeu o crossfire — entry fatal logo na porta.',
    failSafe: 'A flash saiu torta e a entrada travou no choke.',
  },
  retake: {
    success: 'Retake cirúrgico! Vocês retomaram o site e desarmaram no talo.',
    partial: 'Retomaram o site, mas o defuse não deu tempo — round dividido.',
    failAggro: 'Invadiram afobados e o retake morreu no crossfire pós-plant.',
    failSafe: 'O utilitário não foi suficiente: eles seguraram o pós-plant.',
  },
  igl: {
    success: 'Call certeira! O mid-round pegou a defesa de calças curtas e o round saiu coordenado.',
    partial: 'A chamada funcionou pela metade — deu espaço, mas não fechou o round.',
    failAggro: 'O hit rápido bateu na cabeça do stack — a call não pegou.',
    failSafe: 'O default não achou a abertura e o tempo escorreu.',
  },
  economy: {
    success: 'Decisão de caixa premiada: a compra pegou eles no contrapé e o round veio.',
    partial: 'A economia segurou, mas o round mesmo ficou no fio.',
    failAggro: 'O force não colou — perderam o duelo e a caixa junto.',
    failSafe: 'Salvaram a grana, mas doeu ceder o round de graça.',
  },
  forcedeco: {
    success: 'MILAGRE de eco! Cinco pistols atropelaram o full buy — que roubo de round!',
    partial: 'O eco tirou dano e uma arma cara, mesmo sem levar o round.',
    failAggro: 'O rush de pistol morreu junto no primeiro ângulo: eco previsível.',
    failSafe: 'Tiraram um pouco de dano e saíram — o full buy passou por cima.',
  },
  antieco: {
    success: 'Anti-eco resolvido no capricho: round obrigatório no bolso, economia intacta.',
    partial: 'Levaram o anti-eco, mas alguém quase deu vexame na correria.',
    failAggro: 'Pisou na cilada do stack de pistol — o anti-eco virou vergonha e prejuízo.',
    failSafe: 'Deixaram a distância curta e um pistol roubou o round que não podia perder.',
  },
  savecall: {
    success: 'Retake maluco! Você virou o que ninguém dava nada — highlight puro.',
    partial: 'Tirou um antes de cair; o round já era, mas custou caro pra eles.',
    failAggro: 'Foi atrás do impossível e entregou a arma — save nenhum.',
    failSafe: 'Salvou o rifle/AWP e garantiu o full buy do próximo. Frio e certo.',
  },
  timeout: {
    success: 'O timeout pegou! O time saiu da pausa reconectado e virou a chave.',
    partial: 'A pausa acalmou os ânimos, mas o embalo deles não sumiu de vez.',
    failAggro: 'Cobrou no grito e racharam mais — a pausa piorou o clima.',
    failSafe: 'Resetaram a cabeça, mas o adversário voltou com o mesmo gás.',
  },
  lasthalf: {
    success: 'Fechou o último round do half por cima e entra no intervalo embalado.',
    partial: 'Round 12 dividido — nem ganhou momento, nem entregou leitura.',
    failAggro: 'Forçou no fim do half e deu o round de bandeja antes da virada.',
    failSafe: 'Jogou seguro, mas eles roubaram o último round e o momentum.',
  },
};

function momentNarrative(kind: string, style: MomentStyle, result: MomentResult): string {
  const bank = MOMENT_NARR[kind] ?? MOMENT_NARR.default;
  if (result === 'success') return bank.success;
  if (result === 'partial') return bank.partial;
  return style === 'aggro' ? bank.failAggro : bank.failSafe;
}

export function resolveMoment(
  moment: Moment,
  option: MomentOption,
  effAttr: number,         // atributo EFETIVO (1-20) já com modificadores off-game
  oppStrength: number,     // ~48-80
  rng: Rng,
): MomentOutcome {
  const skill = clamp(effAttr / 20, 0, 1);
  const style = STYLE_MOD[option.style];
  const oppPenalty = (oppStrength - 55) / 150;   // adversário forte dificulta (v10: ~1.5× + centro mais baixo → tiers altos punem de verdade)
  const successChance = clamp(0.22 + skill * 0.62 + style.chance - oppPenalty, 0.05, 0.92);

  const roll = rng();
  // A banda de "partial" cabe DENTRO do resto (1 - successChance), reservando um
  // mínimo de fail — sem isso, com chance >= 0.82 o fail (e o risco de morte do
  // estilo agressivo) ficava matematicamente inalcançável.
  const partialBand = Math.min(0.18, (1 - successChance) * 0.7);
  let result: MomentResult;
  if (roll < successChance) result = 'success';
  else if (roll < successChance + partialBand) result = 'partial';
  else result = 'fail';

  const isClutch = moment.kind === 'clutch';
  let frags = 0, deaths = 0, openings = 0, clutches = 0;
  let value: number;

  if (result === 'success') {
    value = 1;
    frags = style.winFrags + (isClutch ? 1 : 0);
    openings = style.winOpen + (moment.kind === 'duel' && option.style === 'aggro' ? 0 : 0);
    if (moment.kind === 'pistol' && option.style === 'aggro') openings += 1;
    if (isClutch) clutches = 1;
  } else if (result === 'partial') {
    value = 0.55;
    frags = 1;
  } else {
    value = 0.1;
    deaths = 1 + (option.style === 'aggro' ? style.failDeath : 0);
  }

  const narrative = momentNarrative(moment.kind, option.style, result);

  return { result, value, frags, deaths, openings, clutches, narrative };
}

// ─────────────────────────────────────────────────────────────────────────────
// Odds transparentes — decompõe a MESMA fórmula que o resolveMoment usa, pra que
// o % mostrado na UI seja EXATAMENTE o % rolado. Garantia de honestidade.

export const STYLE_LABEL: Record<MomentStyle, string> = {
  aggro: 'Agressivo', safe: 'Seguro', smart: 'Inteligente',
};

export interface OddsSeg { label: string; pct: number; kind: 'base' | 'skill' | 'style' | 'opp'; }

export interface OddsBreakdown {
  total: number;                 // 0..1 — == successChance do resolveMoment
  segments: OddsSeg[];           // contribuições assinadas (%) que compõem o total
  attr: AttrKey;
  attrLabel: string;
  effAttr: number;               // 1-20 (atributo efetivo, já com condição)
  conditions: { label: string; delta: number }[]; // contexto (já embutido no effAttr)
  ceilingFrags: number;          // frags no sucesso (teto)
  floorDeaths: number;           // mortes na falha (piso, estilo aggro)
}

// effAttr = atributo EFETIVO (1-20, já modulado pela condição off-game).
// oppStrength ~ 48-90. factors = prep.factors (conditionModifiers), só pra contexto.
export function explainOdds(
  opt: MomentOption,
  effAttr: number,
  oppStrength: number,
  factors: { label: string; delta: number }[],
): OddsBreakdown {
  const skill = clamp(effAttr / 20, 0, 1);
  const style = STYLE_MOD[opt.style];
  const oppPenalty = (oppStrength - 55) / 150;   // espelha resolveMoment (v10)
  const total = clamp(0.22 + skill * 0.62 + style.chance - oppPenalty, 0.05, 0.92);
  return {
    total,
    segments: [
      { label: 'Base', pct: 22, kind: 'base' },
      { label: ATTR_LABEL[opt.attr], pct: Math.round(skill * 0.62 * 100), kind: 'skill' },
      { label: STYLE_LABEL[opt.style], pct: Math.round(style.chance * 100), kind: 'style' },
      { label: `vs ${Math.round(oppStrength)} OVR`, pct: -Math.round(oppPenalty * 100), kind: 'opp' },
    ],
    attr: opt.attr,
    attrLabel: ATTR_LABEL[opt.attr],
    effAttr,
    conditions: factors,
    ceilingFrags: style.winFrags,
    floorDeaths: style.failDeath,
  };
}

// Resumo agregado dos momentos (pra UI e pro boost na simulação). execAvg =
// média das EXECUÇÕES nos minigames (null se nenhum momento-chave foi jogado).
export function summarizeMoments(outcomes: MomentOutcome[]): {
  score: number; frags: number; deaths: number; openings: number; clutches: number; execAvg: number | null;
} {
  if (outcomes.length === 0) return { score: 0.5, frags: 0, deaths: 0, openings: 0, clutches: 0, execAvg: null };
  const frags = outcomes.reduce((a, o) => a + o.frags, 0);
  const deaths = outcomes.reduce((a, o) => a + o.deaths, 0);
  const openings = outcomes.reduce((a, o) => a + o.openings, 0);
  const clutches = outcomes.reduce((a, o) => a + o.clutches, 0);
  const score = outcomes.reduce((a, o) => a + o.value, 0) / outcomes.length;
  const execs = outcomes.filter((o) => typeof o.execPerf === 'number');
  const execAvg = execs.length ? execs.reduce((a, o) => a + (o.execPerf ?? 0), 0) / execs.length : null;
  return { score, frags, deaths, openings, clutches, execAvg };
}
