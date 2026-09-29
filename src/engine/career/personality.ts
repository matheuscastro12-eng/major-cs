import { hashStr } from '../../state/hash';
import { attrsOf, type AttrsSource } from '../attrs/model';

export type PlayerPersonality = 'leader' | 'mercenary' | 'prodigy' | 'hothead' | 'resilient';

const PERSONALITIES: PlayerPersonality[] = ['leader', 'mercenary', 'prodigy', 'hothead', 'resilient'];

// ─────────────────────────────────────────────────────────────────────────────
// [fase 3 · vestiário] PERSONALIDADE DERIVADA DOS OCULTOS (estilo FM).
//
// Antes: um dos 5 tipos sorteado por hash do id. Agora a personalidade SAI dos
// atributos ocultos do jogador (profissionalismo, ambição, lealdade,
// temperamento) e da liderança visível, com rótulos estilo FM (Profissional
// modelo, Líder nato, Ambicioso, Leal, Temperamental, Mercenário…). O tipo
// antigo (`PlayerPersonality`, 5 valores) continua existindo como a VISÃO que
// os sistemas antigos leem (moral, fadiga, química, conversas, propostas): cada
// rótulo FM mapeia para um tipo antigo. Quem chama `playerPersonality(id)` sem
// fonte registrada (testes, scripts, Road to Pro) recebe o tipo por hash de
// sempre — compatibilidade total.

export type FmPersonality =
  | 'bornLeader' | 'modelPro' | 'professional' | 'resolute' | 'ambitious'
  | 'loyal' | 'temperamental' | 'mercenary' | 'unambitious' | 'balanced';

export interface PersonalityProfile {
  fm: FmPersonality;
  legacy: PlayerPersonality;
  professionalism: number; // 1–20 (oculto)
  ambition: number;        // 1–20 (oculto)
  loyalty: number;         // 1–20 (oculto)
  temperament: number;     // 1–20 (oculto)
  leadership: number;      // 1–20 (visível)
}

/** Tipo antigo por hash (o sorteio de sempre). */
export function hashPersonality(playerId: string): PlayerPersonality {
  return PERSONALITIES[hashStr(`personality:${playerId}`) % PERSONALITIES.length];
}

/** Rótulo FM a partir dos ocultos (ordem de prioridade: o traço mais marcante vence). */
export function fmPersonalityOf(h: { professionalism: number; ambition: number; loyalty: number; temperament: number }, leadership: number): FmPersonality {
  if (leadership >= 15 && h.temperament >= 11) return 'bornLeader';
  if (h.professionalism >= 13 && h.temperament >= 13) return 'modelPro';
  if (h.temperament <= 7) return 'temperamental';
  if (h.loyalty <= 7 && h.ambition >= 12) return 'mercenary';
  if (h.ambition >= 15) return 'ambitious';
  if (h.loyalty >= 13) return 'loyal';
  if (h.temperament >= 15) return 'resolute';
  if (h.professionalism >= 13) return 'professional';
  if (h.ambition <= 9) return 'unambitious';
  return 'balanced';
}

// rótulo FM → tipo antigo (o que moral/fadiga/química/conversas/propostas leem).
// 'balanced' (sem traço marcante) cai no tipo por hash: mantém a variedade antiga.
const LEGACY_OF: Record<Exclude<FmPersonality, 'balanced'>, PlayerPersonality> = {
  bornLeader: 'leader',
  modelPro: 'resilient',
  professional: 'resilient',
  resolute: 'resilient',
  unambitious: 'resilient',
  loyal: 'leader',
  ambitious: 'prodigy',
  temperamental: 'hothead',
  mercenary: 'mercenary',
};

/** Perfil completo derivado dos ocultos do jogador. */
export function derivePersonality(p: AttrsSource): PersonalityProfile {
  const x = attrsOf(p);
  const h = x.h;
  const leadership = x.a.leadership;
  const fm = fmPersonalityOf(h, leadership);
  const legacy = fm === 'balanced' ? hashPersonality(p.sourcePlayerId ?? p.id) : LEGACY_OF[fm];
  return { fm, legacy, professionalism: h.professionalism, ambition: h.ambition, loyalty: h.loyalty, temperament: h.temperament, leadership };
}

// Fonte dos jogadores para quem só tem o id (moral, fadiga, conversas…). A
// Carreira registra a sua (elenco + base); sem fonte, vale o hash de sempre.
type PersonalitySource = (playerId: string) => AttrsSource | null | undefined;
let source: PersonalitySource | null = null;
const cache = new Map<string, { key: string; profile: PersonalityProfile }>();
export function setPersonalitySource(fn: PersonalitySource | null): void {
  source = fn;
  cache.clear();
}

/** Perfil do jogador pelo id (null sem fonte ou jogador desconhecido). */
export function personalityProfileOf(playerId: string): PersonalityProfile | null {
  const p = source?.(playerId);
  if (!p) return null;
  const key = `${p.aim}|${p.awp}|${p.igl}|${p.clutch}|${p.consistency}|${p.role}|${p.age ?? ''}|${p.attrs ? 'a' : ''}`;
  const hit = cache.get(playerId);
  if (hit && hit.key === key) return hit.profile;
  const profile = derivePersonality({ ...p, id: playerId });
  if (cache.size > 5000) cache.clear();
  cache.set(playerId, { key, profile });
  return profile;
}

export function playerPersonality(playerId: string): PlayerPersonality {
  return personalityProfileOf(playerId)?.legacy ?? hashPersonality(playerId);
}

export const FM_PERSONALITY_LABEL: Record<FmPersonality, string> = {
  bornLeader: 'Líder nato',
  modelPro: 'Profissional modelo',
  professional: 'Profissional',
  resolute: 'Determinado',
  ambitious: 'Ambicioso',
  loyal: 'Leal',
  temperamental: 'Temperamental',
  mercenary: 'Mercenário',
  unambitious: 'Acomodado',
  balanced: 'Equilibrado',
};

export const FM_PERSONALITY_DESC: Record<FmPersonality, string> = {
  bornLeader: 'Liderança alta e cabeça no lugar: puxa o vestiário e arrasta a moral do grupo.',
  modelPro: 'Profissionalismo e temperamento exemplares: treina bem, aceita cobrança e raramente cria atrito.',
  professional: 'Leva o trabalho a sério e responde bem a cobranças justas.',
  resolute: 'Temperamento de aço: segura a pressão e não se abala com fase ruim.',
  ambitious: 'Quer títulos e um clube maior. Cobra projeto e fica inquieto em time pequeno.',
  loyal: 'Apegado ao clube: aceita menos para ficar e resiste a propostas.',
  temperamental: 'Pavio curto: reage forte a cobrança, a banco e a derrota, e entra em atrito fácil.',
  mercenary: 'Pouca lealdade e muita ambição: o dinheiro e a próxima proposta mandam.',
  unambitious: 'Sem grande ambição: aceita papel menor sem reclamar muito.',
  balanced: 'Sem traço marcante: reage de forma previsível.',
};

export function personalityDevelopmentBonus(playerId: string, split: number, age: number): number {
  if (playerPersonality(playerId) !== 'prodigy' || age > 23) return 0;
  return hashStr(`prodigy:${playerId}:${split}`) % 2 === 0 ? 1 : 0;
}

export function personalityMoraleDelta(
  playerId: string,
  context: { champion: boolean; objectiveMet: boolean; expiring: boolean },
): number {
  const personality = playerPersonality(playerId);
  if (personality === 'leader') return context.champion ? 2 : context.objectiveMet ? 1 : 2;
  if (personality === 'mercenary') return context.expiring ? -5 : 0;
  if (personality === 'hothead') return context.champion ? 4 : context.objectiveMet ? 1 : -4;
  if (personality === 'resilient') return context.objectiveMet ? 1 : 3;
  return context.champion ? 2 : 0;
}

export function personalityOfferBonus(playerId: string, morale: number): number {
  const personality = playerPersonality(playerId);
  if (personality === 'mercenary') return 25;
  if (personality === 'hothead' && morale < 45) return 15;
  if (personality === 'leader') return -10;
  return 0;
}

export function personalityFatigueDelta(playerId: string): number {
  const personality = playerPersonality(playerId);
  if (personality === 'resilient') return -2;
  if (personality === 'hothead') return 1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// T3.2 — Expansão das personalities (sem novo schema; tudo derivado da
// personality já calculada via hash). Integra com PlayerTalks (T3.7) e
// Chemistry (T3.4) pra que cada personality tenha comportamento mensurável
// em sistemas diferentes.

/**
 * Modula o delta de morale de um PlayerTalk baseado na personality.
 * Recebe o delta CALCULADO pelo engine de talks (ideal+modificadores) e
 * devolve o delta AJUSTADO pra essa personality.
 *
 * Idéia: cada personality reage diferente a tom/tópico.
 *   - leader: aceita firme bem, valoriza conversas francas
 *   - mercenary: praise/amigável tem efeito reduzido (só $$ importa)
 *   - prodigy: motivacional rende mais; firme dói mais
 *   - hothead: firme/behavior amplifica (pra cima ou pra baixo)
 *   - resilient: tudo é absorvido (efeitos atenuados, pra cima e pra baixo)
 */
export function personalityTalkResponse(
  playerId: string,
  topic: 'playtime' | 'effort' | 'defend' | 'behavior' | 'extension' | 'praise',
  tone: 'firm' | 'friendly' | 'motivational',
  baseDelta: number,
): number {
  const personality = playerPersonality(playerId);
  let delta = baseDelta;

  if (personality === 'leader') {
    // Líder valoriza firmeza e franqueza
    if (tone === 'firm') delta += 1;
    if (topic === 'defend') delta += 2;
    if (tone === 'motivational' && delta > 0) delta -= 1; // discurso bonito é desconfiado
  } else if (personality === 'mercenary') {
    // Mercenário é frio: praise e amigável rendem pouco
    if (topic === 'praise') delta = Math.round(delta * 0.4);
    if (tone === 'friendly') delta = Math.round(delta * 0.6);
    if (topic === 'extension') delta = Math.round(delta * 0.7);
  } else if (personality === 'prodigy') {
    // Jovem talento responde a motivacional, mas dói firme
    if (tone === 'motivational') delta = Math.round(delta * 1.5);
    if (tone === 'firm' && topic !== 'effort') delta = Math.round(delta * 0.6);
  } else if (personality === 'hothead') {
    // Reage explosivamente: positivo dobra, negativo dobra também
    if (topic === 'behavior' || topic === 'effort') {
      delta = Math.round(delta * 1.8);
    }
  } else if (personality === 'resilient') {
    // Resistente: atenua tudo
    delta = Math.round(delta * 0.7);
  }

  return delta;
}

/**
 * Bônus de chemistry que ESTE player adiciona aos pares dele. Líderes
 * "puxam" o time pra cima (química sobe mais rápido com qualquer um);
 * hothead arrasta pra baixo levemente.
 *
 * Retorna multiplicador aplicado ao gain por partida. Default 1.0.
 */
export function personalityChemBonus(playerId: string): number {
  const personality = playerPersonality(playerId);
  if (personality === 'leader') return 1.4;       // líder sobe química com qualquer um
  if (personality === 'resilient') return 1.15;   // resiliente é fácil de conviver
  if (personality === 'mercenary') return 0.8;    // mercenário é frio com o time
  if (personality === 'hothead') return 0.7;      // hothead irrita os outros
  return 1.0;                                      // prodigy, neutral
}

// ─────────────────────────────────────────────────────────────────────────────
// Cor de reação pra PlayerTalks. O delta já é modulado por personalityTalkResponse;
// isto dá VOZ a essa modulação: uma cláusula curta anexada ao outcome do talk que
// reflete COMO cada tipo encaixou o papo (positivo/neutro/negativo). Sem isso,
// líder e esquentado saíam com a mesma narração — o texto agora acompanha o número.
export function personalityTalkColor(
  personality: PlayerPersonality,
  valence: 'positive' | 'neutral' | 'negative',
): string {
  const table: Record<PlayerPersonality, Record<typeof valence, string>> = {
    leader: {
      positive: 'Como líder do elenco, ele já leva o recado pra call — o grupo entra mais afinado.',
      neutral: 'Ele ouve, assente e volta pro servidor sem drama.',
      negative: 'Discorda na lata, mas encara de frente: líder não foge de conversa dura.',
    },
    mercenary: {
      positive: 'Ele agradece seco — no fundo, só o próximo contrato move o ponteiro dele.',
      neutral: 'Dá de ombros: enquanto o salário cair em dia, tá tudo certo.',
      negative: 'Nem se abala — já calcula quanto vale a ficha dele no mercado.',
    },
    prodigy: {
      positive: 'O moleque sai de olho brilhando, doido pra soltar a mão no próximo deathmatch.',
      neutral: 'Ele acena meio sem saber o peso do papo — ainda aprende o jogo por trás do jogo.',
      negative: 'A cobrança pesa no jovem: sai cabisbaixo, mastigando cada palavra.',
    },
    hothead: {
      positive: 'Ele se inflama na hora — quer entrar no próximo round só pra te dar razão.',
      neutral: 'Segura a explosão dessa vez, mas o pavio curto tá à mostra.',
      negative: 'Estoura na hora: soco na mesa, headset arrancado e porta batida.',
    },
    resilient: {
      positive: 'Ele absorve com a calma de sempre e toca o baile.',
      neutral: 'Nada o abala: ouve, processa e segue o treino como se nada fosse.',
      negative: 'Encaixa a crítica sem drama — amanhã tá no servidor como se nada tivesse rolado.',
    },
  };
  return table[personality][valence];
}

// Label humanizado pra UI (chip no profile do player).
export const PERSONALITY_LABEL: Record<PlayerPersonality, string> = {
  leader: 'Líder',
  mercenary: 'Mercenário',
  prodigy: 'Promessa',
  hothead: 'Esquentado',
  resilient: 'Resiliente',
};

// Descrição curta dos efeitos (tooltip).
export const PERSONALITY_DESC: Record<PlayerPersonality, string> = {
  leader: 'Aceita cobranças firmes e levanta a química do elenco.',
  mercenary: 'Só importa $. Praise e amizade rendem pouco.',
  prodigy: 'Talento jovem. Responde a motivação; sofre com firmeza.',
  hothead: 'Volátil. Reações dobradas — pra cima e pra baixo.',
  resilient: 'Absorve adversidade. Tudo afeta menos.',
};

