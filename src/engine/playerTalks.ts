// Player talks — T3.7 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Modelo enxuto inspirado no FM: o manager senta com um jogador específico,
// escolhe TÓPICO (playtime, esforço, defender no media, comportamento) e TOM
// (firme / amigável / motivacional). Cada combinação gera um outcome com
// delta de morale daquele jogador + cooldown.
//
// Diferente do TeamEvents (que afeta TIME inteiro), aqui afeta UM jogador.
// O CareerScreen pluga o botão "Conversar" no player profile/modal.
//
// T3.2: a reação ao tom é modulada pela PERSONALITY do jogador (leader,
// mercenary, prodigy, hothead, resilient) via personalityTalkResponse.

import { personalityTalkResponse } from './career/personality';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export type TalkTopicId =
  | 'playtime'      // promete/discute tempo de jogo
  | 'effort'        // cobra mais esforço nos treinos
  | 'defend'        // se oferece pra defender no media após criticismo
  | 'behavior'      // aborda comportamento (chegar atrasado, redes sociais)
  | 'extension'    // discute renovação de contrato
  | 'praise';       // elogia desempenho recente

export type TalkTone = 'firm' | 'friendly' | 'motivational';

export interface TalkOutcome {
  /** Delta na moral do player específico. */
  moraleDelta: number;
  /** Narrativa do resultado (1-2 frases) */
  outcome: string;
  /** Ícone visual (emoji-free — usado por CareerIcon name='check'/'warning'/etc). */
  tone: 'positive' | 'neutral' | 'negative';
}

export interface TalkResult {
  topic: TalkTopicId;
  toneUsed: TalkTone;
  outcome: TalkOutcome;
}

export interface PlayerTalkState {
  /** Split atual */
  split: number;
  /** Morale do jogador (0-100) — usado como contexto pra calibrar reação */
  currentMorale: number;
  /** Idade do jogador (afeta receptividade — veteranos reagem diferente) */
  age?: number;
  /** Último split em que esse player teve conversa (cooldown) */
  lastTalkAtSplit?: number;
  /** T3.2: id do player pra resolver personality (modula a reação ao tom).
   *  Opcional pra retrocompat — se ausente, reação é "neutra" (sem
   *  personalityTalkResponse). */
  playerId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de tópicos

export const TALK_TOPICS: { id: TalkTopicId; label: string; description: string }[] = [
  { id: 'playtime',  label: 'Discutir playtime',          description: 'Conversar sobre tempo de jogo e papel no time.' },
  { id: 'effort',    label: 'Cobrar mais empenho',         description: 'Pedir mais foco nos treinos e nas scrims.' },
  { id: 'defend',    label: 'Defender no media',           description: 'Se posicionar publicamente ao lado do jogador após crítica.' },
  { id: 'behavior',  label: 'Falar sobre comportamento',   description: 'Abordar atrasos, postura nas redes ou atritos internos.' },
  { id: 'extension', label: 'Falar sobre extensão',        description: 'Sentir o ar pra renovação de contrato (não fecha aqui).' },
  { id: 'praise',    label: 'Elogiar desempenho',          description: 'Reconhecer trabalho recente publicamente.' },
];

export const TALK_TONES: { id: TalkTone; label: string }[] = [
  { id: 'firm',         label: 'Firme' },
  { id: 'friendly',     label: 'Amigável' },
  { id: 'motivational', label: 'Motivacional' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown

const TALK_COOLDOWN_SPLITS = 1; // não pode conversar 2 splits seguidos

export function canTalkNow(state: PlayerTalkState): boolean {
  if (state.lastTalkAtSplit == null) return true;
  return state.split - state.lastTalkAtSplit > TALK_COOLDOWN_SPLITS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução
//
// Matriz determinística topic × tone → outcome. Cada combinação tem uma
// "intenção esperada" — se o tom bate com a expectativa, dá ganho; se
// quebra, desce. Considera moral atual e idade como modificadores.

// "Ideal tone" por topic — quando o user acerta, ganha mais. Quando erra,
// ainda funciona mas com retorno menor (ou até negativo).
const IDEAL_TONE_BY_TOPIC: Record<TalkTopicId, TalkTone> = {
  playtime:  'friendly',
  effort:    'firm',
  defend:    'motivational',
  behavior:  'firm',
  extension: 'friendly',
  praise:    'motivational',
};

export function resolvePlayerTalk(
  state: PlayerTalkState,
  topic: TalkTopicId,
  tone: TalkTone,
): TalkResult {
  const ideal = IDEAL_TONE_BY_TOPIC[topic];
  const isIdeal = tone === ideal;

  // Base delta: ideal +6, near-miss +2, errado -3
  let delta = isIdeal ? 6 : 2;

  // Modificador por moral atual:
  //   - moral alta (>70): conversa firme com player feliz pode soar arrogante (-2)
  //   - moral baixa (<35): qualquer atenção positiva ajuda mais (+2)
  if (state.currentMorale >= 70 && tone === 'firm' && (topic === 'effort' || topic === 'behavior')) {
    delta -= 2;
  }
  if (state.currentMorale < 35 && (tone === 'friendly' || tone === 'motivational')) {
    delta += 2;
  }

  // Veteranos (>=28) toleram menos amigável-bobo e respondem melhor a firme
  if (state.age != null && state.age >= 28) {
    if (tone === 'friendly') delta -= 1;
    if (tone === 'firm') delta += 1;
  }
  // Jovens (<=21) respondem melhor a motivacional
  if (state.age != null && state.age <= 21 && tone === 'motivational') {
    delta += 2;
  }

  // Praise tem teto baixo: elogiar quem já tá bem dá pouco
  if (topic === 'praise' && state.currentMorale >= 75) {
    delta = Math.min(delta, 2);
  }
  // Behavior com tom errado (motivacional/amigável) pode soar como você relevando — moral cai
  if (topic === 'behavior' && tone === 'friendly') {
    delta = -2;
  }

  // T3.2: personality modula o delta final. Líder aceita firme bem, mercenário
  // desconta praise, hothead amplifica, etc. Sem playerId, pula esse passo.
  if (state.playerId) {
    delta = personalityTalkResponse(state.playerId, topic, tone, delta);
  }

  const outcomeText = buildOutcomeText(topic, tone, delta);
  const toneCat: TalkOutcome['tone'] = delta >= 4 ? 'positive' : delta <= -1 ? 'negative' : 'neutral';

  return {
    topic,
    toneUsed: tone,
    outcome: {
      moraleDelta: delta,
      outcome: outcomeText,
      tone: toneCat,
    },
  };
}

// Texto narrativo determinístico — mapa topic × tone → frase. Mantém o feel
// "consequência humana" sem virar wall of text.
function buildOutcomeText(topic: TalkTopicId, tone: TalkTone, delta: number): string {
  const positive = delta >= 4;
  const negative = delta <= -1;
  const lookup: Record<TalkTopicId, Record<TalkTone, { good: string; ok: string; bad: string }>> = {
    playtime: {
      friendly:     { good: 'Ele agradece a conversa franca e sai motivado.',                 ok: 'Conversa cordial, sem grandes mudanças.',           bad: 'Ele aceita os termos mas continua um pouco frustrado.' },
      firm:         { good: 'Você é direto. Ele entende a hierarquia.',                       ok: 'Ele entende a posição, sem entusiasmo.',            bad: 'A firmeza incomoda. Ele acha que merece mais.' },
      motivational: { good: 'Você vende o projeto. Ele compra a ideia.',                       ok: 'Discurso bonito mas ele queria pragmatismo.',       bad: 'Ele percebe que era só conversa motivacional.' },
    },
    effort: {
      friendly:     { good: 'O carinho funciona como cobrança suave.',                          ok: 'Ele concorda mas sem urgência.',                     bad: 'A delicadeza foi interpretada como pouco aperto.' },
      firm:         { good: 'A bronca acerta. Ele assume responsabilidade.',                    ok: 'Ele aceita a bronca.',                               bad: 'Ele sente que está sendo isolado e se fecha.' },
      motivational: { good: 'Você liga o estilo motivacional. Ele se inflama.',                 ok: 'Discurso ok, ele tenta.',                            bad: 'Ele acha que você está fingindo.' },
    },
    defend: {
      friendly:     { good: 'Ele agradece a parceria — relação se fortalece.',                 ok: 'Conversa morna; ele agradece.',                       bad: 'Ele acha que você está pisando em ovos.' },
      firm:         { good: 'Você é direto sobre o plano público. Ele respeita.',              ok: 'Plano definido sem afeição.',                          bad: 'A firmeza não combina com o momento.' },
      motivational: { good: 'Discurso de "estamos juntos" funciona. Ele se sente armado.',     ok: 'Mensagem aceita sem grande efeito.',                  bad: 'Ele esperava só apoio, não discurso.' },
    },
    behavior: {
      friendly:     { good: 'Conversa amena mas pouco firme.',                                  ok: 'Ele entende mas o recado fica fraco.',               bad: 'Ele leva como aceitação tácita do comportamento.' },
      firm:         { good: 'A bronca chega forte. Ele se ajusta.',                             ok: 'Ele aceita a bronca.',                                bad: 'A firmeza vira atrito aberto.' },
      motivational: { good: 'Você fala dos valores. Ele se identifica.',                        ok: 'Discurso passa mas sem ação concreta.',              bad: 'Ele acha o discurso vazio diante do problema.' },
    },
    extension: {
      friendly:     { good: 'Ele se abre sobre o futuro — sinal positivo pra renovação.',     ok: 'Conversa exploratória sem compromisso.',             bad: 'Ele acha que você está pressionando.' },
      firm:         { good: 'Você marca posição. Ele respeita mas pesa o ar.',                ok: 'Conversa direta sem grande efeito imediato.',         bad: 'Ele sente um ultimato implícito e fica defensivo.' },
      motivational: { good: 'Vende o projeto de longo prazo. Ele responde.',                   ok: 'Discurso ok mas ele queria detalhes.',                bad: 'Ele percebe que é só sonho sem números.' },
    },
    praise: {
      friendly:     { good: 'Ele recebe bem — relação se fortalece.',                          ok: 'Elogio simpático sem grande impacto.',               bad: '—' },
      firm:         { good: 'Elogio direto, sem floreio. Ele aprecia.',                       ok: 'Mensagem fria mas honesta.',                          bad: 'Soa como obrigação, não reconhecimento.' },
      motivational: { good: 'Você infla o ego no momento certo. Ele se motiva.',              ok: 'Elogio padrão, ele agradece.',                        bad: 'Soa exagerado.' },
    },
  };
  const cell = lookup[topic][tone];
  if (positive) return cell.good;
  if (negative) return cell.bad;
  return cell.ok;
}

// Helper pro modal: agrupa tones em colunas pra cada topic. O `_topic` não é
// usado hoje (mesmas opções pra qualquer tópico), mas mantém a assinatura
// preparada pra quando alguns tons forem desabilitados conforme contexto.
export function buildTalkOptions(_topic: TalkTopicId): { tone: TalkTone; toneLabel: string }[] {
  return TALK_TONES.map((t) => ({ tone: t.id, toneLabel: t.label }));
}
