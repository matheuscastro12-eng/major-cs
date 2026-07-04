// Team events — T3.6 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Eventos contextuais que aparecem entre splits estilo Football Manager:
// briga interna, oferta de bootcamp, scandal, fanmeet, sponsor visita, etc.
// Cada um traz 2-4 ESCOLHAS, cada uma com deltas em moral / budget / board
// (confiança da diretoria) + narrativa do resultado.
//
// Pipeline:
//   1) `tryGenerateTeamEvent(save, rng)` chamado na virada de split.
//      Devolve evento se sorteou; null caso contrário.
//   2) Save guarda `pendingTeamEvent: { eventId, splitWhen }` até user responder.
//   3) UI (TeamEventModal) mostra title + body + choices.
//   4) `resolveTeamEvent(save, choiceId)` devolve patch a aplicar no save.
//
// Filosofia dos eventos: o impacto numérico individual é pequeno (-10 a +10
// pontos de morale, -5 a +5 de board, alguns milhares de $ em budget) — mas
// quando se acumulam ao longo dos splits, viram inflexões reais na carreira.
// Categorias variam pra dar sensação de "vida" e quebrar a repetição.

import type { Rng } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export type TeamEventCategory =
  | 'internal'    // briga, sub que pede mais playtime, líder do vestiário
  | 'media'       // entrevista, scandal, viralizou
  | 'commercial'  // sponsor visita, evento de marca
  | 'training'   // oferta de bootcamp, novo método de scrim
  | 'staff';      // coach pede aumento, oferta externa de coach

export interface TeamEventChoice {
  id: string;
  label: string;         // texto do botão
  outcome: string;       // narrativa de 1 frase que aparece pós-escolha
  budgetDelta?: number;  // soma no caixa
  boardDelta?: number;   // soma na confiança (board 0-100)
  // moraleDelta aplicado em TODOS os jogadores ativos (squad) somando neste valor.
  // Pra um evento que só afeta UM jogador, faríamos `targetedPlayerId` — não temos
  // este nível ainda; eventos atuais afetam o time inteiro.
  moraleDelta?: number;
  // Se true, recusar/perder o evento dispara `fired` (escalada extrema).
  triggersFire?: boolean;
}

export interface TeamEventDef {
  id: string;
  category: TeamEventCategory;
  title: string;
  body: string;          // setup, 1-2 frases
  choices: TeamEventChoice[];
  weight: number;        // peso relativo (sorteado proporcionalmente)
  minSplit?: number;     // só após split X (NPC eventos avançados só aparecem mais tarde)
  minTier?: number;      // 1-4; só topa clubes nesse tier OU MELHOR (tier MENOR = melhor)
}

export interface PendingTeamEvent {
  eventId: string;
  splitWhen: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo

export const TEAM_EVENTS: TeamEventDef[] = [
  // ─── INTERNAL ──────────────────────────────────────────────────
  {
    id: 'team_locker_room_argument',
    category: 'internal',
    title: 'Discussão no vestiário',
    body: 'Após uma derrota apertada, dois titulares começaram a se acusar em frente ao elenco. O coach pede sua intervenção antes da próxima scrim.',
    weight: 12,
    choices: [
      { id: 'mediate',       label: 'Mediar entre os dois',     outcome: 'Você reúne os dois e fecha o assunto. Time respeita a postura calma.', moraleDelta: 4 },
      { id: 'side_with_igl', label: 'Ficar do lado do IGL',     outcome: 'O IGL agradece, mas o outro lado fica ressentido.',                   moraleDelta: -2, boardDelta: 2 },
      { id: 'punish_both',   label: 'Multar os dois envolvidos', outcome: 'Você impõe disciplina. Caixa cresce um pouco, moral cai.',          budgetDelta: 8000, moraleDelta: -6 },
    ],
  },
  {
    id: 'team_practice_extra',
    category: 'internal',
    title: 'Pedido por treinos extras',
    body: 'O elenco quer puxar treinos extras no fim de semana antes do próximo torneio. Vai consumir tempo de descanso.',
    weight: 8,
    choices: [
      { id: 'approve',  label: 'Liberar treinos no fim de semana', outcome: 'Time fica mais afiado. Cansaço pesa, mas os jogadores se sentem ouvidos.', moraleDelta: 5 },
      { id: 'deny',     label: 'Negar — fim de semana é folga',     outcome: 'Time descansa mas se sente desmotivado em parte da formação.',           moraleDelta: -3 },
    ],
  },
  {
    id: 'team_veteran_speaks',
    category: 'internal',
    title: 'O veterano abre o jogo',
    body: 'O membro mais experiente do elenco pede uma conversa franca: ele acha que vocês ainda não jogam como um time de elite.',
    weight: 6,
    minSplit: 3,
    choices: [
      { id: 'thank',      label: 'Agradecer e perguntar o que mudar', outcome: 'Veterano lidera reunião tática. Química sobe.', moraleDelta: 6, boardDelta: 2 },
      { id: 'dismiss',    label: 'Cortar a conversa curto',           outcome: 'Ele se cala — mas o vestiário sente o atrito.', moraleDelta: -5 },
    ],
  },
  {
    id: 'team_substitute_unhappy',
    category: 'internal',
    title: 'O reserva quer playtime',
    body: 'Seu reserva mandou DM cobrando mais tempo de jogo. Outros clubes já piscaram pra ele.',
    weight: 10,
    choices: [
      { id: 'promise',     label: 'Prometer playtime no próximo torneio', outcome: 'Reserva fica. Você se compromete — se não cumprir, vai doer.',   moraleDelta: 2 },
      { id: 'tell_truth',  label: 'Ser honesto: vai continuar reserva',   outcome: 'Ele agradece a sinceridade, mas pondera saída no fim de contrato.', moraleDelta: -2 },
      { id: 'bonus',       label: 'Pagar bônus pra ficar quieto',          outcome: 'Resolve agora, mas custa caro.',                                  budgetDelta: -25000, moraleDelta: 1 },
    ],
  },

  // ─── MEDIA ─────────────────────────────────────────────────────
  {
    id: 'media_clip_viral',
    category: 'media',
    title: 'Clipe viral!',
    body: 'Um highlight do seu duelista virou TikTok. Marca de roupas quer fechar parceria pequena pra capitalizar.',
    weight: 7,
    choices: [
      { id: 'accept',  label: 'Aceitar parceria de roupa',  outcome: 'Caixa engorda, time vira presença no feed.', budgetDelta: 18000, moraleDelta: 3 },
      { id: 'pass',    label: 'Passar — não é seu estilo',  outcome: 'Você mantém a postura discreta. Sem efeito.',                            },
    ],
  },
  {
    id: 'media_scandal',
    category: 'media',
    title: 'Polêmica nas redes',
    body: 'Um titular postou opinião controversa. Os comentários estão pegando fogo.',
    weight: 6,
    minSplit: 2,
    choices: [
      { id: 'apologize', label: 'Pedir pra ele apagar e desculpar',   outcome: 'Crise atenuada. Jogador acha que foi censurado.',     moraleDelta: -3, boardDelta: 4 },
      { id: 'support',   label: 'Defender publicamente o jogador',    outcome: 'Elenco se une atrás de você. Diretoria não gosta.',  moraleDelta: 6, boardDelta: -8 },
      { id: 'ignore',    label: 'Ignorar — vai passar',                outcome: 'Crise some em 3 dias. Sem efeito relevante.',                          },
    ],
  },
  {
    id: 'media_interview',
    category: 'media',
    title: 'Convite pra entrevista',
    body: 'Um podcast grande quer 1h com você e o IGL. Boa exposição, mas gasta um dia inteiro de prep.',
    weight: 5,
    choices: [
      { id: 'go',     label: 'Vão os dois',                            outcome: 'Entrevista repercute bem. Diretoria fica satisfeita.',          boardDelta: 4 },
      { id: 'igl',    label: 'Só o IGL vai (você gerencia)',           outcome: 'IGL brilha sozinho. Você foca no time.',                       moraleDelta: 2 },
      { id: 'pass',   label: 'Recusar — não é o momento',              outcome: 'Foco no jogo. Sem efeito.',                                                                                       },
    ],
  },

  // ─── COMMERCIAL ────────────────────────────────────────────────
  {
    id: 'commercial_sponsor_visit',
    category: 'commercial',
    title: 'Patrocinador visita o gaming house',
    body: 'Um dos seus sponsors quer trazer executivos pra conhecer o time pessoalmente. Vão pedir 1 manhã.',
    weight: 7,
    choices: [
      { id: 'host',  label: 'Receber em grande estilo',          outcome: 'Sponsor adora o tratamento — relação melhora.',  budgetDelta: 12000, boardDelta: 3 },
      { id: 'brief', label: 'Visita breve, jogadores focados',    outcome: 'Sponsor entende a prioridade competitiva.',     boardDelta: 1                  },
      { id: 'pass',  label: 'Reagendar — fim de semana de scrim', outcome: 'Sponsor fica desapontado.',                     boardDelta: -3                },
    ],
  },
  {
    id: 'commercial_merch',
    category: 'commercial',
    title: 'Lançamento de merch',
    body: 'Vocês podem lançar uma camisa edição limitada agora. Tem custo de produção mas pode render bem.',
    weight: 5,
    minSplit: 4,
    choices: [
      { id: 'launch', label: 'Lançar agora',          outcome: 'Esgota em 2 dias. Fãs em festa.',                  budgetDelta: 45000, moraleDelta: 3 },
      { id: 'wait',   label: 'Esperar próximo split',  outcome: 'Sem efeito imediato. Pode dar bom ou não.',                                            },
    ],
  },

  // ─── TRAINING ──────────────────────────────────────────────────
  {
    id: 'training_bootcamp_offer',
    category: 'training',
    title: 'Oferta de bootcamp europeu',
    body: 'Uma TO oferece um bootcamp de 2 semanas na Europa antes do próximo torneio. Inclui scrims contra times tier-1.',
    weight: 5,
    minSplit: 3,
    choices: [
      { id: 'pay',     label: 'Pagar e ir',                  outcome: 'Time volta calibrado. Caixa pesa mas vale a pena.', budgetDelta: -80000, moraleDelta: 6 },
      { id: 'partial', label: 'Ir apenas com os titulares',  outcome: 'Compromisso parcial. Custo menor mas elenco se divide.', budgetDelta: -40000, moraleDelta: 2 },
      { id: 'decline', label: 'Recusar — caixa apertado',    outcome: 'Decisão prudente, mas time perde a chance de subir o nível.',                  },
    ],
  },
  {
    id: 'training_new_methodology',
    category: 'training',
    title: 'Novo método de prep do analista',
    body: 'Seu analista propõe trocar o método de review pra usar VODs auto-clipados por IA. Demanda 1 split de adaptação.',
    weight: 4,
    minSplit: 2,
    choices: [
      { id: 'try',  label: 'Tentar — vale o risco',  outcome: 'Adaptação dói 1 split. Depois rende muito.', moraleDelta: -2 },
      { id: 'pass', label: 'Manter o que funciona',   outcome: 'Coach mantém método. Sem mudança imediata.',                  },
    ],
  },

  // ─── STAFF ─────────────────────────────────────────────────────
  {
    id: 'staff_coach_offer',
    category: 'staff',
    title: 'Outro clube quer seu coach',
    body: 'Um rival do Tier 1 quer assinar com seu coach. Ele veio te dizer pessoalmente — tá esperando sua resposta.',
    weight: 6,
    minSplit: 4,
    choices: [
      { id: 'raise',   label: 'Subir o salário pra ele ficar',  outcome: 'Coach fica e agradece a confiança.',                       budgetDelta: -40000, moraleDelta: 4, boardDelta: -2 },
      { id: 'let_go',  label: 'Liberar — não pague mais',        outcome: 'Coach saí. Você vai precisar contratar substituto.',     boardDelta: -5, moraleDelta: -3 },
    ],
  },
  {
    id: 'staff_analyst_complains',
    category: 'staff',
    title: 'Analista pede recursos',
    body: 'Seu analista quer comprar acesso a serviço premium de stats de VOD. Não é barato.',
    weight: 5,
    choices: [
      { id: 'buy',  label: 'Aprovar a compra',           outcome: 'Análises ficam mais ricas.',                       budgetDelta: -15000, moraleDelta: 2 },
      { id: 'cut',  label: 'Negar — improvise',           outcome: 'Analista entende, mas trabalha com menos ferramentas.',          moraleDelta: -1 },
    ],
  },

  // ─── EXPANSÃO iter8 — mais eventos de vida (evita esgotar o catálogo) ─────

  // ─── INTERNAL ──────────────────────────────────────────────────
  {
    id: 'team_igl_burnout',
    category: 'internal',
    title: 'O IGL quer largar a call',
    body: 'Depois de uma sequência de vetos ruins e mid-rounds travados, seu IGL admite que o peso de chamar está comendo o próprio jogo. Ele cogita passar o comando pra outro.',
    weight: 7,
    minSplit: 2,
    choices: [
      { id: 'keep',   label: 'Convencer ele a seguir na call',      outcome: 'Você reforça a confiança. Ele topa segurar o comando, aliviado por ser ouvido.', moraleDelta: 4 },
      { id: 'share',  label: 'Dividir a call por bomb site',        outcome: 'Vocês distribuem a chamada entre ele e o lurker. Frescor tático, mas leva tempo pra afinar.', moraleDelta: 1 },
      { id: 'free',   label: 'Tirar o peso e soltar o fragging dele', outcome: 'Ele volta a fragar solto, mas o time fica sem norte nos mid-rounds por um tempo.', moraleDelta: -1 },
    ],
  },
  {
    id: 'team_offstrat_lurker',
    category: 'internal',
    title: 'O lurker joga por conta',
    body: 'Seu lurker vem largando o default pra caçar picks sozinho. Às vezes fecha um clutch de 1vX; às vezes estoura o timing do time inteiro na execução.',
    weight: 7,
    choices: [
      { id: 'rein',   label: 'Cobrar disciplina no setup', outcome: 'Ele volta ao book. Menos highlight de lurk, mais rounds jogados no sistema.', moraleDelta: -1, boardDelta: 2 },
      { id: 'trust',  label: 'Dar liberdade — é o instinto dele', outcome: 'Ele agradece a confiança e assume de vez o papel de faísca imprevisível do time.', moraleDelta: 4 },
    ],
  },
  {
    id: 'team_comms_toxic',
    category: 'internal',
    title: 'Comms pegando fogo',
    body: 'O coach te mostra um VOD de scrim: sua estrela flamou o time inteiro depois de um eco perdido. O clima azedou no meio do bloco de treino.',
    weight: 8,
    minSplit: 2,
    choices: [
      { id: 'talk',   label: 'Chamar a estrela pra uma conversa reservada', outcome: 'Ele reconhece o excesso e pede desculpas ao grupo. O comms limpa.', moraleDelta: 3 },
      { id: 'fine',   label: 'Multar por quebra de conduta',                outcome: 'Recado dado e caixa cresce — mas a estrela fica ressentida.', budgetDelta: 6000, moraleDelta: -4 },
      { id: 'ignore', label: 'Deixar rolar — é competitivo',                outcome: 'Sem intervenção, o atrito no comms vira rotina.', moraleDelta: -2 },
    ],
  },

  // ─── MEDIA ─────────────────────────────────────────────────────
  {
    id: 'media_hltv_top20',
    category: 'media',
    title: 'Cotado no Top 20 da HLTV',
    body: 'A imprensa especula que seu fragger pode entrar no ranking anual dos melhores do mundo. A hype tá alta e ele sabe disso.',
    weight: 5,
    minSplit: 3,
    choices: [
      { id: 'hype',   label: 'Bancar a narrativa e pedir foco',  outcome: 'Ele canaliza a pressão no treino. Motivação lá em cima.', moraleDelta: 5 },
      { id: 'humble', label: 'Pregar pés no chão',                outcome: 'Você prega humildade. Ele entende, mas esfria um tico a empolgação.', moraleDelta: 1, boardDelta: 2 },
    ],
  },
  {
    id: 'media_roster_leak',
    category: 'media',
    title: 'Vazou uma troca no elenco',
    body: 'Um insider tuitou que você estaria de olho num rifler de outro time. O vestiário viu o print e ficou desconfortável.',
    weight: 6,
    minSplit: 2,
    choices: [
      { id: 'deny',      label: 'Desmentir e reafirmar o grupo', outcome: 'Você fecha a questão publicamente. O elenco relaxa.', moraleDelta: 3 },
      { id: 'nocomment', label: 'Não confirmar nem negar',        outcome: 'O silêncio mantém a dúvida no ar — alguns titulares ficam na defensiva.', moraleDelta: -3, boardDelta: 1 },
    ],
  },
  {
    id: 'media_coach_bug_probe',
    category: 'media',
    title: 'Jornalista mexe em caso antigo',
    body: 'Um repórter investiga um suposto abuso do bug de câmera de coach numa era passada do clube. Pode respingar na imagem, mesmo sem seu envolvimento.',
    weight: 4,
    minSplit: 4,
    choices: [
      { id: 'open',   label: 'Colaborar e abrir os demos antigos', outcome: 'Transparência total. A diretoria aprova a postura e o assunto morre rápido.', boardDelta: 5 },
      { id: 'legal',  label: 'Passar pro jurídico e não comentar',  outcome: 'Sem declaração, a história perde força — mas fica um clima no ar.', boardDelta: -2 },
      { id: 'deny',   label: 'Negar tudo publicamente',             outcome: 'Negativa dura. Se algo aparecer depois, vai custar caro.', boardDelta: 2, moraleDelta: -1 },
    ],
  },

  // ─── COMMERCIAL ────────────────────────────────────────────────
  {
    id: 'commercial_major_stickers',
    category: 'commercial',
    title: 'Dinheiro das figurinhas',
    body: 'A classificação pro Major liberou a cota de stickers do time na loja do jogo. A receita das figurinhas caiu na conta.',
    weight: 5,
    minSplit: 3,
    minTier: 2,
    choices: [
      { id: 'reinvest', label: 'Reinvestir no bootcamp',  outcome: 'A grana vira preparação. O time sente o investimento no nível das scrims.', budgetDelta: 20000, moraleDelta: 3 },
      { id: 'bank',     label: 'Guardar no caixa',          outcome: 'Reserva reforçada pra janela de transferências que vem aí.', budgetDelta: 35000 },
    ],
  },
  {
    id: 'commercial_energy_drink',
    category: 'commercial',
    title: 'Sponsor de energético',
    body: 'Uma marca de energético topa um contrato gordo, mas exige menção ao vivo dos jogadores em toda stream. Parte do elenco torce o nariz pro jabá.',
    weight: 5,
    choices: [
      { id: 'sign',      label: 'Assinar — a grana ajuda',       outcome: 'Caixa engorda. Alguns jogadores reclamam do jabá no meio das lives.', budgetDelta: 30000, moraleDelta: -2 },
      { id: 'negotiate', label: 'Negociar menos menções',         outcome: 'Acordo equilibrado: menos dinheiro, menos jabá forçado.', budgetDelta: 15000 },
      { id: 'pass',      label: 'Recusar — não combina com o time', outcome: 'Você preserva a vibe das lives. Sem receita extra.' },
    ],
  },

  // ─── TRAINING ──────────────────────────────────────────────────
  {
    id: 'training_demo_leak',
    category: 'training',
    title: 'Vazou um demo de scrim',
    body: 'Um demo com seus setups novos apareceu num fórum às vésperas do campeonato. Metade das suas execuções de treino tá exposta.',
    weight: 5,
    minSplit: 3,
    choices: [
      { id: 'rework', label: 'Refazer o playbook às pressas', outcome: 'Noites viradas remontando as chamadas. Cansaço sobe, mas a surpresa é preservada.', moraleDelta: -3 },
      { id: 'adapt',  label: 'Manter e variar no detalhe',     outcome: 'Vocês trocam timings e utility sem jogar tudo fora. Aposta calculada.', moraleDelta: 1 },
    ],
  },
  {
    id: 'training_aim_coach',
    category: 'training',
    title: 'Contratar um aim coach',
    body: 'Surgiu a chance de trazer um especialista só em mira e duelos por um bloco de treinos. Rotinas de crosshair placement, prefire e spray control. Não é barato.',
    weight: 4,
    minSplit: 3,
    choices: [
      { id: 'hire', label: 'Contratar por um split', outcome: 'Duelos de entrada mais afiados e mira mais consistente. O nível sobe.', budgetDelta: -25000, moraleDelta: 4 },
      { id: 'pass', label: 'Deixar pra próxima',       outcome: 'Vocês seguem com a rotina atual. Sem custo, sem ganho.' },
    ],
  },

  // ─── STAFF ─────────────────────────────────────────────────────
  {
    id: 'staff_sports_psych',
    category: 'staff',
    title: 'Oferta de psicólogo esportivo',
    body: 'Um psicólogo esportivo especializado em esports se ofereceu pra trabalhar controle emocional e clutch pressure com o elenco.',
    weight: 5,
    minSplit: 2,
    choices: [
      { id: 'hire',  label: 'Contratar em tempo integral', outcome: 'O time aprende a segurar o tremor no 1v1. Cabeça mais fria nos rounds decisivos.', budgetDelta: -20000, moraleDelta: 5 },
      { id: 'trial', label: 'Fazer um período de teste',    outcome: 'Sessões pontuais antes dos playoffs. Efeito mais tímido, custo menor.', budgetDelta: -8000, moraleDelta: 2 },
      { id: 'pass',  label: 'Recusar — não é prioridade',   outcome: 'Vocês seguem no instinto. Sem mudança.' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// State shape (subset do CareerSave usado por este engine)

export interface TeamEventState {
  /** Split atual */
  split: number;
  /** Tier do clube (1-4) */
  tier: number;
  /** Oferta/evento pendente — UI mostra modal de escolha */
  pendingTeamEvent?: PendingTeamEvent | null;
  /** Ids de eventos já resolvidos no histórico (evita repetir o mesmo) */
  resolvedTeamEvents?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração

const BASE_EVENT_CHANCE = 0.32; // chance por split de gerar evento em condições neutras

/**
 * Tenta gerar um evento de time nesta virada de split.
 * Não muta nada — quem decide guardar é o consumer.
 */
export function tryGenerateTeamEvent(
  s: TeamEventState,
  rng: Rng,
): PendingTeamEvent | null {
  if (s.pendingTeamEvent) return null;
  if (rng() > BASE_EVENT_CHANCE) return null;

  const resolved = new Set(s.resolvedTeamEvents ?? []);
  const pool = TEAM_EVENTS.filter((ev) => {
    if (resolved.has(ev.id)) {
      // Eventos só "re-podem" depois de muitos splits. Por simplicidade, no
      // catálogo atual quase nenhum repete — se queremos mais, soltamos o
      // resolvedTeamEvents periodicamente.
      return false;
    }
    if (ev.minSplit && s.split < ev.minSplit) return false;
    if (ev.minTier && s.tier > ev.minTier) return false; // tier MENOR = melhor; minTier=2 = só topa tier 1 e 2
    return true;
  });
  if (pool.length === 0) return null;

  // weighted pick
  const totalW = pool.reduce((sum, ev) => sum + ev.weight, 0);
  let pick = rng() * totalW;
  let chosen = pool[0];
  for (const ev of pool) {
    pick -= ev.weight;
    if (pick <= 0) {
      chosen = ev;
      break;
    }
  }

  return { eventId: chosen.id, splitWhen: s.split };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução

export interface ResolveResult {
  /** Texto do outcome (narrativa) — UI mostra como confirmação */
  outcome: string;
  /** Patch parcial que o consumer aplica no CareerSave */
  patch: TeamEventPatch;
}

export interface TeamEventPatch {
  budgetDelta?: number;
  boardDelta?: number;
  /** Aplicado em TODOS os players ativos no morale Record */
  moraleDelta?: number;
  /** Adicionar ao resolvedTeamEvents (histórico) */
  newResolvedId: string;
  /** Limpar o pendingTeamEvent (sempre) */
  clearPending: true;
  triggersFire?: boolean;
}

/**
 * Resolve o evento pela escolha selecionada. Devolve outcome + patch.
 * NÃO muta o save — consumer aplica via update().
 */
export function resolveTeamEvent(
  s: TeamEventState,
  choiceId: string,
): ResolveResult | null {
  if (!s.pendingTeamEvent) return null;
  const def = TEAM_EVENTS.find((ev) => ev.id === s.pendingTeamEvent!.eventId);
  if (!def) return null;
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return null;

  return {
    outcome: choice.outcome,
    patch: {
      budgetDelta: choice.budgetDelta,
      boardDelta: choice.boardDelta,
      moraleDelta: choice.moraleDelta,
      newResolvedId: def.id,
      clearPending: true,
      triggersFire: choice.triggersFire,
    },
  };
}

/**
 * Lookup do evento (pro UI mostrar title + body + choices).
 */
export function teamEventById(id: string): TeamEventDef | undefined {
  return TEAM_EVENTS.find((ev) => ev.id === id);
}

/**
 * Limpa o pending quando o split passa sem resposta (raro — UI deve forçar
 * a escolha — mas é fail-safe).
 */
export function expireTeamEventOnSplitChange(s: TeamEventState, newSplit: number): PendingTeamEvent | null {
  const ev = s.pendingTeamEvent ?? null;
  if (ev && ev.splitWhen < newSplit) {
    return ev;
  }
  return null;
}
