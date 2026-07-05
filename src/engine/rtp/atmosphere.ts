// RTP iter41 — ATMOSFERA DA SALA: a arquibancada como personagem.
//
// Camada 100% de APRESENTAÇÃO (texto/CSS): nenhum número daqui toca odds,
// beats ou resultado. Tudo determinístico pelo matchSeed (hashStr) — a mesma
// partida sempre tem a mesma arena, a mesma torcida e as mesmas reações.
//
// O palco escala com o contexto REAL do save: academia = ginásio quase vazio
// (eco das calls); access/challenger = torcida presente; elite = arena lotada;
// MAJOR = o palco máximo, com walkout textual dos times. As frases de risco
// (stakes) derivam de dados que já existem (fase do circuito/Major, meta da
// diretoria, rival persistente) — nada inventado.

import { hashStr } from '../../state/hash';
import { stageLabel, objectiveStatus } from './circuit';
import type { MatchPrep } from './matchSim';
import type { MomentResult } from './moments';
import type { RoadToProSave } from './types';

export type AtmoStage = 'academy' | 'access' | 'challenger' | 'elite' | 'major';

export interface Atmosphere {
  stage: AtmoStage;
  venue: string;          // linha do local ("Ginásio da base — eco das calls")
  crowd: number;          // 0..100 — lotação (meter no header)
  crowdLabel: string;     // "QUASE VAZIO" / "LOTADA"…
  stakes: string | null;  // o que está em jogo (1 linha, dado real)
  walkout: string[] | null; // MAJOR: entrada textual dos times (antes do 1º beat)
  taunt: string | null;   // provocação do rival (só se prep.grudge > 0)
  rivalName: string | null;
}

// pick determinístico por chave — NUNCA consome RNG do jogo.
const pickBy = <T,>(pool: readonly T[], key: string): T => pool[hashStr(key) % pool.length];

// ── Palco por estágio ────────────────────────────────────────────────────────

const VENUES: Record<AtmoStage, readonly string[]> = {
  academy: [
    'Ginásio da liga de base — arquibancada quase vazia, as calls ecoam na sala',
    'CT improvisado da academia — meia dúzia de cadeiras dobráveis e o zumbido dos PCs',
    'Salão comunitário da base — os pais dos jogadores são metade do público',
  ],
  access: [
    'LAN house reformada — torcida modesta, mas barulhenta, colada no vidro',
    'Estúdio da liga de acesso — algumas dezenas de fãs e um caster empolgado',
    'Ginásio regional — a torcida local veio ver a promessa de perto',
  ],
  challenger: [
    'Arena de estúdio — arquibancada cheia e o coro da torcida atravessa o vidro',
    'Teatro adaptado pra LAN — ingressos esgotados no tier Challenger',
    'Pavilhão da liga — bandeiras, cornetas e um telão que não perdoa erro',
  ],
  elite: [
    'Arena LOTADA — o coro da torcida faz o chão tremer no tier de elite',
    'Estádio indoor esgotado — milhares de vozes num só grito',
    'Arena principal do circuito — luzes, pirotecnia e a elite assistindo',
  ],
  major: [
    'O PALCO MÁXIMO — arena do Major esgotada, o rugido chega antes de você',
    'Estádio do Major — vinte mil pessoas e o mundo inteiro no stream',
    'Arena do Major — corredor de flashes até o palco, o ar pesa diferente aqui',
  ],
};

const CROWD_BASE: Record<AtmoStage, number> = { academy: 8, access: 34, challenger: 62, elite: 88, major: 99 };
const CROWD_LABEL: Record<AtmoStage, string> = {
  academy: 'QUASE VAZIO', access: 'TORCIDA PRESENTE', challenger: 'ARQUIBANCADA CHEIA', elite: 'ARENA LOTADA', major: 'CASA CHEIA — RECORDE',
};

export function atmoStageOf(save: RoadToProSave, major: boolean): AtmoStage {
  return major ? 'major' : save.team.tier;
}

// ── Stakes (dados reais: Major/circuito/meta/rival) ──────────────────────────

function majorStakes(save: RoadToProSave): string | null {
  const mj = save.world.major;
  if (!mj) return null;
  const t = mj.tournament;
  if (mj.phaseStage === 'playoffs') {
    if (t.phase === 'final') return 'GRANDE FINAL DO MAJOR — o troféu está na mesa. Não existe amanhã.';
    return 'Playoffs do Major — mata-mata: quem perder arruma as malas.';
  }
  const user = t.teams.find((tm) => tm.id === mj.userTeamId);
  if (user) {
    if (user.losses >= 2) return `Suíça ${user.wins}–${user.losses}: mais uma derrota e o Major acabou pra vocês.`;
    if (user.wins >= 2) return `Suíça ${user.wins}–${user.losses}: vencer aqui praticamente carimba a classificação.`;
    return `Fase Suíça do Major (${user.wins}–${user.losses}) — cada série vale uma vida.`;
  }
  return 'Fase Suíça do Major — cada série vale uma vida.';
}

function leagueStakes(save: RoadToProSave): string | null {
  const c = save.world.league;
  if (!c) return null;
  const stage = stageLabel(c);
  if (c.phase === 'playoffs') {
    return stage === 'GRANDE FINAL'
      ? 'GRANDE FINAL — o título do campeonato se decide agora.'
      : `${stage} — mata-mata: vencer aqui coloca vocês a um passo do título.`;
  }
  const obj = objectiveStatus(save);
  if (obj?.state === 'edge') return `${stage} — ${obj.note}`;
  if (obj) return `${stage} — meta da diretoria: ${save.world.objective?.label?.toLowerCase() ?? 'avançar'}.`;
  return `${stage} — três pontos que pesam na tabela.`;
}

function rivalStakes(save: RoadToProSave, prep: MatchPrep): string | null {
  if (!prep.grudge || !save.media?.rival) return null;
  const r = save.media.rival;
  const { w, l } = r.h2h;
  const h2h = w + l > 0 ? ` Retrospecto: ${w}–${l}.` : '';
  if (l > w) return `REVANCHE contra ${r.orgName} — ${r.playerNick} venceu o último capítulo.${h2h}`;
  return `Clássico contra ${r.orgName} — ${r.playerNick} do outro lado.${h2h}`;
}

// ── Walkout (MAJOR) ──────────────────────────────────────────────────────────

function majorWalkout(save: RoadToProSave, prep: MatchPrep): string[] {
  const seed = `walkout:${prep.matchSeed}`;
  const opener = pickBy([
    'As luzes apagam. O locutor anuncia os times e a arena vem abaixo.',
    'Fumaça no túnel, telão em contagem regressiva — hora do walkout.',
    'O hino do evento estoura nos alto-falantes — o túnel se abre.',
  ] as const, seed);
  return [
    opener,
    `${prep.opp.name} entra primeiro — vaias e aplausos se misturam.`,
    `Agora é a vez de ${save.team.teamName}: "${save.player.nick.toUpperCase()}!" ecoa das arquibancadas.`,
  ];
}

// O que está em jogo hoje, em 1 linha (rival > Major > circuito) — também
// alimenta a MANCHETE DO DIA do pré-jogo (iter43, broadcast.ts). Fonte única.
export function matchStakes(save: RoadToProSave, prep: MatchPrep, major: boolean): string | null {
  return rivalStakes(save, prep) ?? (major ? majorStakes(save) : leagueStakes(save));
}

// ── Atmosfera da partida (chamado uma vez, memoizado na Sala) ────────────────

export function matchAtmosphere(save: RoadToProSave, prep: MatchPrep, major: boolean): Atmosphere {
  const stage = atmoStageOf(save, major);
  const seed = `atmo:${prep.matchSeed}`;
  const venue = pickBy(VENUES[stage], seed);
  const jitter = (hashStr(`${seed}:crowd`) % 5) - 2;
  const crowd = Math.max(0, Math.min(100, CROWD_BASE[stage] + jitter));
  const rival = prep.grudge && save.media?.rival ? save.media.rival : null;
  const stakes = matchStakes(save, prep, major);
  return {
    stage, venue, crowd, crowdLabel: CROWD_LABEL[stage], stakes,
    walkout: stage === 'major' ? majorWalkout(save, prep) : null,
    taunt: rival?.taunt ?? null,
    rivalName: rival ? `${rival.playerNick} (${rival.tag})` : null,
  };
}

// ── Reação da torcida a cada beat (1 linha, pós-outcome) ─────────────────────

type CrowdBank = Record<'success' | 'partial' | 'fail' | 'big', readonly string[]>;

const CROWD_REACT: Record<AtmoStage, CrowdBank> = {
  academy: {
    success: [
      'Meia dúzia de palmas ecoa no ginásio vazio — e o seu banco explode.',
      'O coach bate na mesa de alegria; o eco responde pela torcida que não veio.',
      'Alguém grita seu nick lá do fundo — dá pra contar as vozes.',
    ],
    partial: ['Um "quaaase" atravessa o ginásio silencioso.', 'O caster local segura o grito pela metade.', 'As doze pessoas da arquibancada trocam olhares — foi quase.'],
    fail: ['Um assobio ecoa no ginásio quase vazio.', 'Dá pra ouvir a cadeira do adversário rangendo de tanto comemorar.', 'Silêncio — só o clique dos mouses e o suspiro do seu coach.'],
    big: ['Até o zelador parou pra ver esse round — o ginásio inteiro (as doze pessoas) de pé.', 'O caster local levanta da cadeira: "ISSO NÃO É ROUND DE BASE!"'],
  },
  access: {
    success: ['A torcida colada no vidro soca o ar — dá pra sentir daqui.', 'O caster estoura o microfone e a galera responde.', 'Gritam seu nick na arquibancada pequena — mas gritam alto.'],
    partial: ['Um "uuuh" percorre o estúdio — quase.', 'A torcida aplaude o esforço, ainda em pé de guerra.', 'O caster engole o grito: "ia ser o round do dia…"'],
    fail: ['A torcida local murcha; o nicho adversário faz a festa.', 'Um assobio de impaciência desce da arquibancada.', 'O vidro do estúdio fica em silêncio pela primeira vez hoje.'],
    big: ['A LAN inteira veio abaixo — round pra ninguém esquecer por aqui.', 'A torcida pequena faz barulho de arena grande — o vidro balança.'],
  },
  challenger: {
    success: ['O coro da torcida atravessa o vidro do palco — VAMOS!', 'Bandeiras balançam e a corneta não para.', 'O pavilhão canta seu nick em coro.'],
    partial: ['O estádio prende o grito na garganta — quase saiu.', 'Aplausos de respeito: a jogada foi corajosa.', 'O telão mostra o replay do quase — o pavilhão lamenta junto.'],
    fail: ['O pavilhão desaba num "aaaah" coletivo.', 'A torcida adversária toma conta do canto sul.', 'As cornetas param — dá pra ouvir a call deles do palco.'],
    big: ['O TEATRO EXPLODIU — as cadeiras da frente nem sabem o que viram.', 'O pavilhão inteiro pula junto — o round vai rodar a semana toda.'],
  },
  elite: {
    success: ['A ARENA VEM ABAIXO — o chão treme com o coro.', 'Vinte fileiras de pé, um só grito: o seu nick.', 'A onda da torcida dá a volta completa na arena.'],
    partial: ['A arena solta um "OOOH" e volta a ferver.', 'Milhares de pessoas aplaudem o risco — quase épico.', 'O telão repete o lance e a arena lamenta em uníssono.'],
    fail: ['A arena inteira faz "aaaah" — e o silêncio que segue pesa toneladas.', 'O setor adversário responde com o coro deles.', 'A pirotecnia fica pronta e não dispara — round deles.'],
    big: ['EXPLOSÃO NA ARENA — pirotecnia de round, o caster sem voz.', 'A arena vira um terremoto — os camarotes de pé junto com a geral.'],
  },
  major: {
    success: ['O MAJOR VEM ABAIXO — vinte mil vozes gritam ao mesmo tempo.', 'O rugido da arena chega antes do replay no telão.', 'O estádio inteiro canta seu nick — arrepio no braço.'],
    partial: ['O estádio faz "OOOOH" em uníssono — o mundo inteiro viu esse quase.', 'Aplausos de vinte mil pessoas pelo risco assumido.', 'O telão gigante repete o quase — o Major suspira junto.'],
    fail: ['Vinte mil pessoas fazem silêncio ao mesmo tempo — o som mais alto que existe.', 'O setor adversário explode; o seu segura a respiração.', 'O caster baixa o tom — o estádio inteiro sente o round escapar.'],
    big: ['ERUPÇÃO NO MAJOR — o round vai abrir todo highlight da temporada.', 'O Major perde a voz — até a mesa de análise levantou da cadeira.'],
  },
};

export function crowdBeatLine(atmo: Atmosphere, result: MomentResult, big: boolean, seedKey: string): string {
  const bank = CROWD_REACT[atmo.stage];
  const pool = big && result === 'success' ? bank.big : bank[result];
  return pickBy(pool, `crowd:${seedKey}`);
}

// ── Linha de ambiente ocasional nos interlúdios (~metade deles) ──────────────

const INTERLUDE_AMBIENT: Record<AtmoStage, readonly string[]> = {
  academy: ['No ginásio, só o eco das calls e o ventilador do PC preenchendo o silêncio.', 'O coach anota algo na prancheta; o ginásio vazio deixa tudo mais alto.', 'Alguém abre um refrigerante na arquibancada — dá pra ouvir do palco.'],
  access: ['A torcida pequena puxa um canto improvisado entre os rounds.', 'O caster local aproveita o intervalo pra hypear o próximo round.', 'Uma bandeira improvisada sobe no fundo do estúdio.'],
  challenger: ['A arquibancada bate palma em ritmo — o pavilhão não esfria.', 'O telão mostra o replay e a torcida reage de novo.', 'A corneta insiste no mesmo riff — e o pavilhão responde inteiro.'],
  elite: ['A arena canta sem parar — o som não baixa nem entre os rounds.', 'A ola dá mais uma volta completa enquanto os times resetam.', 'Os telões duelam de estatísticas — a arena vaia e aplaude ao mesmo tempo.'],
  major: ['O estádio do Major não respira — vinte mil pessoas grudadas em cada pixel.', 'Entre rounds, o coro das torcidas duela de um setor pro outro.', 'O telão mostra a taça no lounge — o estádio inteiro aponta.'],
};

// Retorna a linha ~50% das vezes (determinístico) — ambiente ocasional, não spam.
export function interludeAmbientLine(atmo: Atmosphere, seedKey: string): string | null {
  if (hashStr(`amb-gate:${seedKey}`) % 2 !== 0) return null;
  return pickBy(INTERLUDE_AMBIENT[atmo.stage], `amb:${seedKey}`);
}

// ── Kicker de pressão (clutch / match point / decider) ───────────────────────

const PRESSURE_KICKER: Record<AtmoStage, readonly string[]> = {
  academy: ['ATÉ O GINÁSIO VAZIO PRENDE A RESPIRAÇÃO', 'SÓ O TIC-TAC DO RELÓGIO NO GINÁSIO', 'O COACH PARA DE ANOTAR — TODO MUNDO OLHA PRA SUA TELA'],
  access: ['A TORCIDA PRENDE A RESPIRAÇÃO', 'O ESTÚDIO INTEIRO EM SILÊNCIO', 'ATÉ O CASTER BAIXA A VOZ'],
  challenger: ['O PAVILHÃO PRENDE A RESPIRAÇÃO', 'NINGUÉM SENTADO NA ARQUIBANCADA', 'AS CORNETAS PARAM — SÓ O CORAÇÃO NO PEITO'],
  elite: ['A ARENA PRENDE A RESPIRAÇÃO', 'MILHARES DE PESSOAS EM SILÊNCIO ABSOLUTO', 'A ARENA INTEIRA DE PÉ, SEM UM RUÍDO'],
  major: ['O MAJOR INTEIRO PRENDE A RESPIRAÇÃO', 'VINTE MIL PESSOAS, ZERO RUÍDO', 'O MUNDO INTEIRO PAUSOU NESSE ROUND'],
};

export function pressureKicker(atmo: Atmosphere, seedKey: string): string {
  return pickBy(PRESSURE_KICKER[atmo.stage], `pk:${seedKey}`);
}

// ── Fechamento de atmosfera na tela de resultado ─────────────────────────────

export function atmoCloser(stage: AtmoStage, won: boolean, tight: boolean, seedKey: string): string {
  const pools: Record<AtmoStage, { w: readonly string[]; wTight: readonly string[]; l: readonly string[]; lTight: readonly string[] }> = {
    academy: {
      w: ['O ginásio quase vazio, mas o seu banco comemora como se fosse final de Major.', 'O coach recolhe a prancheta sorrindo — no ginásio da base, vitória tem gosto de futuro.', 'Os poucos presentes aplaudem; alguém filma de celular — "esse aí vai longe".'],
      wTight: ['O eco da comemoração preenche o ginásio — série sofrida, vitória de gente grande.', 'Série no detalhe e o ginásio vazio nem percebeu o tamanho do que viu.'],
      l: ['O ginásio esvazia em silêncio; amanhã tem treino de novo.', 'As cadeiras dobráveis se fecham uma a uma — derrota de base dói igual.', 'O coach só diz "VOD amanhã cedo" — o eco responde por todo mundo.'],
      lTight: ['O coach bate no seu ombro: "por um detalhe". O ginásio vazio concorda em silêncio.', 'Um round aqui, uma bala ali — o ginásio esvazia com a sensação do quase.'],
    },
    access: {
      w: ['A torcida pequena invade a frente do palco pra comemorar com vocês.', 'O caster local grita seu nick no encerramento — a LAN aplaude de pé.', 'A galera colada no vidro pede foto — vitória que cria torcedor.'],
      wTight: ['A LAN veio abaixo no round final — a torcida local sai rouca.', 'Série decidida no fio — o estúdio pequeno fez barulho de arena.'],
      l: ['A torcida local vai embora cabisbaixa, mas alguém grita "próxima é nossa!"', 'O estúdio esvazia devagar; o caster encerra com "esse time ainda vai dar o que falar".'],
      lTight: ['Derrota no detalhe — a torcida aplaude de pé mesmo assim.', 'Perdeu no fio, mas a arquibancada pequena reconhece: aplausos até a saída.'],
    },
    challenger: {
      w: ['O pavilhão canta o nome do time enquanto vocês saem do palco.', 'Bandeiras no alto e corneta sem parar — o tier Challenger conhece vocês agora.', 'O telão congela no placar final e o pavilhão explode de novo.'],
      wTight: ['Série decidida no fio — o teatro inteiro de pé, ingresso pago com juros.', 'O pavilhão sai rouco: série apertada que valeu cada segundo.'],
      l: ['As bandeiras baixam devagar; o pavilhão reconhece a luta com aplausos.', 'A torcida adversária faz a festa; a sua promete voltar mais alto.'],
      lTight: ['Derrota apertada — a torcida aplaude de pé mesmo assim.', 'O pavilhão inteiro sabe: faltou um detalhe. Os aplausos dizem "volta logo".'],
    },
    elite: {
      w: ['A arena explode uma última vez — confete no ar e o coro do seu nick.', 'As luzes varrem a arena lotada — vitória de elite, comemoração de elite.', 'A arena canta até o time sumir no túnel — noite pra guardar.'],
      wTight: ['A arena vai ao delírio no round final — série pra ficar na memória do circuito.', 'Decidida no fio — a arena inteira de pé, ninguém foi embora antes do fim.'],
      l: ['A arena esvazia em murmúrio; o telão repete o lance que escapou.', 'O setor adversário canta sozinho; o seu sai em silêncio respeitoso.'],
      lTight: ['A arena aplaude de pé os dois times — derrota no detalhe, respeito conquistado.', 'Série de margem mínima — a arena reconhece: aplausos pros dois lados.'],
    },
    major: {
      w: ['CONFETE CAI DO TETO DA ARENA — o Major inteiro grita o seu nick.', 'O rugido do Major não para — vocês saem do palco em câmera lenta.'],
      wTight: ['O Major explode no último round — série épica, o estádio sem voz.', 'Decidida no fio diante de vinte mil pessoas — série que entra pra história do Major.'],
      l: ['Vinte mil pessoas em silêncio respeitoso enquanto o telão apaga.', 'O confete cai — do outro lado do palco. Dói assistir.'],
      lTight: ['O Major aplaude de pé os dois times — derrota apertada no palco máximo.', 'Um detalhe separou vocês da glória — o estádio inteiro reconhece de pé.'],
    },
  };
  const p = pools[stage];
  const pool = won ? (tight ? p.wTight : p.w) : tight ? p.lTight : p.l;
  return pickBy(pool, `closer:${seedKey}`);
}
