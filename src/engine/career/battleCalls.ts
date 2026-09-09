// CARREIRA — "A CHAMADA": o turno tático inspirado em RPG de turno (Pokémon).
//
// A diferença entre "assistir a partida" e "JOGAR a partida" é de quem é a
// decisão e de quem é o mérito. Até aqui o modo Tático do MatchScreen oferecia
// chamadas ABSTRATAS (rush/retake/force/save) — corretas mecanicamente, mas
// impessoais: nenhuma delas era do SEU elenco. Aqui as chamadas passam a ser
// GOLPES DO SEU TIME: cada opção nomeia o jogador que executa, é alimentada por
// um atributo dele e carrega a efetividade (estilo × postura) na cara.
//
// Tradução honesta do vocabulário de Pokémon pro CS — nada é inventado, tudo
// mapeia em sistema que JÁ existe no motor:
//   • golpe            → RoundCall + Stance já suportados pelo createMapSim
//   • tipo/efetividade → Playstyle do jogador × postura da chamada (stanceRelation)
//   • STAB             → a função (Role) do executor casa com o golpe
//   • PP (usos)        → chamadas fortes são limitadas por half (força/timeout)
//   • dano             → o round vencido; a barra de vida é o próprio placar (13)
//
// FONTE DA VERDADE: este módulo NÃO calcula resultado de round. Ele só MONTA as
// opções e devolve o (stance, call) que o caller entrega ao `sim.step()` do
// engine/match.ts — que segue sendo o único dono do placar, da economia e das
// stats. O `peekWinProb` do próprio sim dá a probabilidade exibida; aqui não há
// segunda matemática pra divergir (a lição do room.ts: placar com 5 cópias
// sincronizadas na mão gerou três bugs).
//
// Puro e determinístico: mesma entrada ⇒ mesmas chamadas. Sem React, sem relógio.

import type { Playstyle, Role, TPlayer } from '../../types';
import type { RoundCall, Stance } from '../match';
// [W5] identidade tática: marca golpe "de casa", golpe lido pelo adversário e golpe que contra
import {
  identityRoundDelta, isCounterCall, IDENTITY_NOUN,
  type IdentityCall, type IdentityEcon, type IdentityLabel,
} from './teamIdentity';

// ─────────────────────────────────────────────────────────────────────────────
// Efetividade (o "tipo" do golpe)

export type Effectiveness = 'super' | 'weak' | 'neutral';

/** Estilo do executor × postura do golpe. Espelha stanceRelation do MatchScreen:
 *  agressivo brilha em chamada agressiva e sofre na cautelosa, e vice-versa. */
export function effectivenessOf(style: Playstyle, stance: Stance): Effectiveness {
  if (stance === 'default') return 'neutral';
  if (stance === 'aggressive') return style === 'aggressive' ? 'super' : style === 'passive' ? 'weak' : 'neutral';
  return style === 'passive' ? 'super' : style === 'aggressive' ? 'weak' : 'neutral';
}

export const EFFECT_LABEL: Record<Effectiveness, string> = {
  super: 'Combina com o estilo dele',
  weak: 'Vai contra o estilo dele',
  neutral: 'Neutro pro estilo dele',
};

// ─────────────────────────────────────────────────────────────────────────────
// Contexto do round (o que o caller já tem em mãos vindo do MapSim)

export interface CallCtx {
  side: 'ct' | 't';
  round: number;              // 0-based, como sim.round()
  score: [number, number];    // [você, adversário]
  money: number;              // seu dinheiro (sim.money()[userIdx])
  isPistol: boolean;
  momentum: number;           // >0 você embalado, <0 eles (len com sinal)
  target: number;             // rounds pra fechar o mapa (13 normal)
  // [W5] identidade tática (opcional): a sua, a do adversário e quanto cada um
  // estuda o outro (scoutingOf). Sem isso os golpes saem sem marca de identidade.
  identity?: IdentityCtx;
}

export interface IdentityCtx {
  mine: IdentityLabel;   // identityLabel(save.identity)
  opp: IdentityLabel;    // identityLabel(derivedIdentity(adversário))
  myScouting: number;    // 0..1 — quanto EU leio o adversário
  oppScouting: number;   // 0..1 — quanto o adversário me lê
}

/** Round que MERECE virar turno. Espelha o BeatKind da transmissão do Ultimate
 *  (liveDrama.ts): pistola, match point, virada, sequência e overtime. Nos
 *  demais o mapa corre no ticker — o ritmo é desigual DE PROPÓSITO: uma partida
 *  de 24 rounds com 24 perguntas vira trabalho, e a Carreira tem dezenas delas. */
export function isKeyRound(ctx: CallCtx): boolean {
  const [you, them] = ctx.score;
  if (ctx.isPistol) return true;                       // round 1 e 13
  if (you === ctx.target - 1 || them === ctx.target - 1) return true; // match point dos dois lados
  if (ctx.round >= 2 * ctx.target - 2) return true;    // overtime
  if (Math.abs(ctx.momentum) >= 3) return true;        // sequência (embalo ou sangria)
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Golpes

export interface CallMove {
  id: string;
  label: string;              // nomeia QUEM executa — é o time do jogador na tela
  desc: string;
  icon: string;
  call: RoundCall | null;     // null = só postura (sem chamada one-shot)
  stance: Stance;
  by: TPlayer;                // o executor
  attr: number;               // atributo que alimenta o golpe (0..100, do executor)
  attrLabel: string;
  effect: Effectiveness;
  stab: boolean;              // função do executor casa com o golpe (bônus de identidade)
  cost: 'free' | 'limited';   // 'limited' gasta um uso do half (PP)
  // [W5] identidade tática (só preenchidos com ctx.identity; default false/'')
  home: boolean;              // chamada "de casa": o time treinou isso (bônus)
  countered: boolean;         // o adversário estudou essa tendência (desconto)
  counter: boolean;           // este golpe CONTRA a identidade do adversário
  identityNote: string;       // explicação legível ("o adversário estudou o seu rush: −4%")
}

// atributo que "alimenta" cada tipo de chamada + a função natural dela (STAB).
const CALL_ATTR: Record<RoundCall, { key: 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'; label: string; role: Role }> = {
  rush:   { key: 'aim',         label: 'mira',        role: 'Entry' },
  retake: { key: 'clutch',      label: 'clutch',      role: 'Support' },
  force:  { key: 'igl',         label: 'comando',     role: 'IGL' },
  save:   { key: 'consistency', label: 'consistência', role: 'Rifler' },
};

const attrOf = (p: TPlayer, k: 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'): number => Number(p[k] ?? 50);

/** Melhor executor do elenco pra um tipo de chamada: prioriza a função natural
 *  do golpe e, dentro dela, o maior atributo. Sem ninguém da função, pega o
 *  maior atributo do elenco (o time joga com o que tem — e isso APARECE). */
function bestFor(players: TPlayer[], call: RoundCall): TPlayer | null {
  if (!players.length) return null;
  const { key, role } = CALL_ATTR[call];
  const natural = players.filter((p) => p.role === role || p.role2 === role);
  const pool = natural.length ? natural : players;
  return pool.reduce((best, p) => (attrOf(p, key) > attrOf(best, key) ? p : best), pool[0]);
}

function moveFrom(players: TPlayer[], call: RoundCall, stance: Stance, icon: string, label: (nick: string) => string, desc: string, cost: 'free' | 'limited'): CallMove | null {
  const by = bestFor(players, call);
  if (!by) return null;
  const meta = CALL_ATTR[call];
  return {
    id: `${call}:${stance}`,
    label: label(by.nick),
    desc,
    icon,
    call,
    stance,
    by,
    attr: attrOf(by, meta.key),
    attrLabel: meta.label,
    effect: effectivenessOf(by.playstyle, stance),
    stab: by.role === meta.role || by.role2 === meta.role,
    cost,
    home: false, countered: false, counter: false, identityNote: '',
  };
}

/** [W5] Marca cada golpe com a leitura de identidade. Usa a MESMA função que o
 *  motor aplica (identityRoundDelta) — o texto explica o que o peekWinProb já
 *  contém; aqui não nasce nenhuma % nova. */
function applyIdentity(moves: CallMove[], ctx: CallCtx): CallMove[] {
  const id = ctx.identity;
  if (!id) return moves;
  const econ: IdentityEcon = ctx.isPistol ? 'pistol' : ctx.money < 4500 ? 'low' : 'full';
  return moves.map((m) => {
    const asCall: IdentityCall = { side: ctx.side, econ, call: m.call ?? 'default', stance: m.stance };
    const d = identityRoundDelta(
      { team: 0, label: id.mine, readBy: id.oppScouting, auto: false },
      { ownerSide: ctx.side, ownerEcon: econ, ownerAction: { call: asCall.call, stance: asCall.stance }, oppAuto: true },
    );
    const counter = id.opp.strength > 0 && isCounterCall(id.opp, asCall);
    const notes = [...d.notes];
    if (counter) notes.push(`contra o ${IDENTITY_NOUN[id.opp.kind]} deles`);
    return { ...m, home: d.home, countered: d.countered, counter, identityNote: notes.join(' · ') };
  });
}

/**
 * Os golpes disponíveis neste round. SEMPRE no máximo 4 (a mão de Pokémon —
 * escolher entre 4 é decisão; entre 9 é planilha), e sempre montados a partir
 * do SEU elenco: trocou de time, mudaram as opções e os nomes.
 *
 * Composição: 1 agressiva, 1 defensiva, 1 econômica (contextual) e a neutra —
 * que é a única sempre disponível (não custa nada e não depende de dinheiro).
 */
export function movesFor(players: TPlayer[], ctx: CallCtx): CallMove[] {
  const out: CallMove[] = [];
  const pushIf = (m: CallMove | null) => { if (m) out.push(m); };

  // ATAQUE — no T é o rush; no CT é o agressivo de fora (mesma mecânica 'rush',
  // que o motor já pune/recompensa por lado em roundEffect).
  pushIf(moveFrom(
    players, 'rush', 'aggressive', '🔥',
    (n) => (ctx.side === 't' ? `Rush com ${n} na frente` : `${n} joga agressivo pra fora`),
    ctx.side === 't' ? 'Todo mundo atrás dele. Ganha o site no peito ou perde o round.' : 'Sai do site pra pegar o ataque antes de montar. Alto risco.',
    'free',
  ));

  // DEFESA — retake/segurar. No CT é o pão com manteiga; no T vira pós-plant.
  pushIf(moveFrom(
    players, 'retake', 'cautious', '🛡',
    (n) => (ctx.side === 'ct' ? `${n} segura e retoma` : `Plant e pós-plant com ${n}`),
    ctx.side === 'ct' ? 'Cede o espaço, junta o time e retoma com utilitário.' : 'Planta rápido e joga o relógio — o round vira defesa.',
    'free',
  ));

  // ECONOMIA — contextual, LIMITADA (o "PP") e EXCLUSIVA: as duas faixas usam o
  // mesmo limiar do decideBuy do motor (4500 = full, 2600 = force). Abaixo de
  // 2600 não existe "forçar" de verdade — é eco disfarçado; o que resta é poupar.
  // Faixas exclusivas também garantem que o leque nunca passe de 4 e engula a
  // opção neutra (bug pego pelo teste: no caixa curto o jogador ficava sem saída).
  if (!ctx.isPistol) {
    if (ctx.money >= 2600 && ctx.money < 4500) {
      pushIf(moveFrom(
        players, 'force', 'aggressive', '💰',
        (n) => `${n} manda forçar`,
        'Compra tudo agora e aposta o próximo round. Se der errado, dois rounds sem arma.',
        'limited',
      ));
    } else if (ctx.money < 2600) {
      pushIf(moveFrom(
        players, 'save', 'cautious', '🪙',
        (n) => `${n} chama o save`,
        'Guarda as armas e o dinheiro. Provavelmente perde este round pra ganhar os próximos.',
        'free',
      ));
    }
  }

  // NEUTRA — o default do time. Sempre presente e SEMPRE por último: nenhum
  // turno pode ficar sem saída, e o jogador precisa poder dizer "confia no que a
  // gente treinou". Reservar a vaga (3 táticas + 1 neutra) é estrutural, não
  // depende das faixas acima continuarem exclusivas.
  const tactical = out.splice(0, 3);
  out.length = 0;
  out.push(...tactical);
  const anchor = players.find((p) => p.role === 'IGL') ?? players[0];
  if (anchor) {
    out.push({
      id: 'default:default',
      label: `Jogar o padrão de ${anchor.nick}`,
      desc: 'O sistema treinado, sem aposta. O time joga como o coach montou.',
      icon: '⚖',
      call: null,
      stance: 'default',
      by: anchor,
      attr: attrOf(anchor, 'igl'),
      attrLabel: 'comando',
      effect: 'neutral',
      stab: anchor.role === 'IGL',
      cost: 'free',
      home: false, countered: false, counter: false, identityNote: '',
    });
  }

  return applyIdentity(out.slice(0, 4), ctx);
}

/** Usos de chamada LIMITADA por half (o "PP" do golpe forte). */
export const LIMITED_USES_PER_HALF = 2;
