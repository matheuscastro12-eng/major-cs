// RTP v8 — IDENTIDADE & PERKS: a camada RPG de progressão do protagonista.
//
// Três eixos que constroem a identidade do jogador ao longo da carreira:
//   1. NÍVEL/XP  — sobe jogando (rating, vitória, MVP). Cada nível dá 1 ponto de perk.
//   2. PERKS     — gastáveis numa ÁRVORE por função (Entry/AWP/Rifler/Support/
//                  Lurker/IGL) + uma trilha UNIVERSAL. Passivos honestos que entram
//                  no jogo de verdade (atributo efetivo, resistência a tilt, XP de
//                  treino, fama) — nada de número escondido.
//   3. TRAITS    — emergentes: você NÃO escolhe, eles se revelam pelo seu estilo
//                  (abridor nato, clutch merchant, mata-gigante…). Pequenos bônus
//                  + sabor. Detectados por contadores vitalícios (progression.tally).
//
// Puro e determinístico. Sem React, sem import de matchSim (evita ciclo — o
// contexto da partida chega via MatchProgressCtx montado pelo matchSim).

import type { Role } from '../../types';
import type { AttrKey } from '../attributes';
import type { RtpIconName } from './icons';
import type { RoadToProSave, PlayerProgression, ProgressTally } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
// Efeito de um perk/trait. Todos os campos são opcionais e se AGREGAM (soma pra
// attr/tiltResist/fatores; PRODUTO pra multiplicadores). matchFactor é SÓ display
// honesto no Round Room — perks que mexem em `attr` já aparecem no % base (não
// duplicam), então um perk usa `attr` OU `matchFactor`, nunca os dois no mesmo eixo.
export interface PerkEffect {
  attr?: Partial<Record<AttrKey, number>>;   // +N flat no atributo efetivo (entra no roll real)
  matchFactor?: { label: string; delta: number }; // fator visível nas odds (perks sem attr)
  tiltResist?: number;                        // 0..1 — amortece tombo de moral pós-derrota
  trainingXpMult?: number;                    // ex.: 1.12 = +12% XP de treino
  fameMult?: number;                          // ex.: 1.3 = fama pós-partida rende +30%
}

// ─────────────────────────────────────────────────────────────────────────────
// PERKS — árvore por função + trilha universal

export type PerkTree = Role | 'universal';

export interface PerkDef {
  id: string;
  tree: PerkTree;
  tier: 1 | 2 | 3 | 4 | 5;
  reqLevel: number;
  reqPerk?: string;            // pré-requisito (perk anterior na mesma trilha)
  style?: string;              // RTP v17 — perk de ESTILO DE JOGO (StyleDef.id); estilos da mesma função são mutuamente exclusivos
  label: string;
  desc: string;
  icon: RtpIconName;
  effect: PerkEffect;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS DE JOGO (RTP v17) — especializações mutuamente exclusivas por função.
//
// Cada função tem DOIS estilos com uma trilha de 3 perks cada. Desbloquear o
// primeiro perk de um estilo COMPROMETE a carreira com ele: o estilo rival da
// mesma função tranca (identidade > acúmulo — e replay value: a mesma função
// rende duas carreiras diferentes). Efeitos na régua dos perks existentes;
// nenhum toque no matchSim — tudo entra pelos mesmos agregadores.

export interface StyleDef {
  id: string;
  role: Role;
  label: string;
  desc: string;
  icon: RtpIconName;
}

export const STYLES: StyleDef[] = [
  { id: 'st_e_rush', role: 'Entry', label: 'Cara do Rush', icon: 'fire',
    desc: 'Explosão pura: você chega ANTES da granada. O site abre no peito.' },
  { id: 'st_e_cirurgico', role: 'Entry', label: 'Abridor Cirúrgico', icon: 'brain',
    desc: 'Entrada montada: flash do suporte, peek na hora certa, trade garantido.' },
  { id: 'st_a_ataque', role: 'AWP', label: 'AWP de Ataque', icon: 'spark',
    desc: 'A AWP como arma de pressão: peek agressivo, flick, re-peek.' },
  { id: 'st_a_ancora', role: 'AWP', label: 'Âncora Absoluta', icon: 'snow',
    desc: 'A AWP como muralha: o ângulo é seu e atravessar custa caro.' },
  { id: 'st_r_estrela', role: 'Rifler', label: 'Estrela do Rifle', icon: 'fame',
    desc: 'O rifle que decide: multi-kill, highlight, o round nas suas costas.' },
  { id: 'st_r_motor', role: 'Rifler', label: 'Motor do Time', icon: 'gym',
    desc: 'O rifle que sustenta: troca certa, posição certa, o piso que não cede.' },
  { id: 'st_s_mago', role: 'Support', label: 'Mago do Utilitário', icon: 'bomb',
    desc: 'Lineup de livro: sua granada vale um abate antes do primeiro tiro.' },
  { id: 'st_s_guarda', role: 'Support', label: 'Guarda-costas', icon: 'team',
    desc: 'A estrela joga solta porque você segura o mundo nas costas dela.' },
  { id: 'st_l_info', role: 'Lurker', label: 'Fantasma de Informação', icon: 'brain',
    desc: 'Você lurka por INFO: cada passo ouvido vira uma chamada certa.' },
  { id: 'st_l_solo', role: 'Lurker', label: 'Executor Solo', icon: 'skull',
    desc: 'Você lurka pra MATAR: flank fechado, faca no round, xeque-mate.' },
  { id: 'st_i_lab', role: 'IGL', label: 'Cientista do CS', icon: 'chart',
    desc: 'O jogo é um laboratório: demo, dado e anti-strat pra cada adversário.' },
  { id: 'st_i_voz', role: 'IGL', label: 'Comandante de Vestiário', icon: 'team',
    desc: 'O jogo é gente: voz firme, time blindado, ninguém tilta no seu turno.' },
];

export function styleById(id: string): StyleDef | undefined {
  return STYLES.find((s) => s.id === id);
}

export function stylesFor(role: Role): StyleDef[] {
  return STYLES.filter((s) => s.role === role);
}

export const PERKS: PerkDef[] = [
  // ── Universal (qualquer função) ───────────────────────────────────────────
  { id: 'u_grind', tree: 'universal', tier: 1, reqLevel: 1, label: 'Rato de treino', icon: 'gym',
    desc: '+12% de XP em todo treino. Você aproveita cada hora de servidor.', effect: { trainingXpMult: 1.12 } },
  { id: 'u_habits', tree: 'universal', tier: 2, reqLevel: 5, reqPerk: 'u_grind', label: 'Hábitos de pro', icon: 'balance',
    desc: 'Rotina profissional: aguenta melhor a pressão e mantém a disciplina.', effect: { tiltResist: 0.15, attr: { discipline: 1, stamina: 1 } } },
  { id: 'u_icon', tree: 'universal', tier: 3, reqLevel: 12, reqPerk: 'u_habits', label: 'Ídolo da torcida', icon: 'fame',
    desc: 'Sua fama rende 50% mais e você comanda o vestiário.', effect: { fameMult: 1.5, attr: { leadership: 1 } } },

  // ── Entry ───────────────────────────────────────────────────────────────
  { id: 'e_first', tree: 'Entry', tier: 1, reqLevel: 1, label: 'Primeira bala', icon: 'spark',
    desc: 'Você abre o round melhor que ninguém.', effect: { attr: { aim: 1, aimMovement: 1 }, matchFactor: { label: 'Abertura', delta: 5 } } },
  { id: 'e_aggr', tree: 'Entry', tier: 2, reqLevel: 5, reqPerk: 'e_first', label: 'Agressão calibrada', icon: 'fire',
    desc: 'Entra rápido sem perder o controle da mira.', effect: { attr: { reflexes: 1, reaction: 1 } } },
  { id: 'e_spear', tree: 'Entry', tier: 3, reqLevel: 12, reqPerk: 'e_aggr', label: 'Ponta de lança', icon: 'crosshair',
    desc: 'Sua entrada define o round — o time joga atrás de você.', effect: { attr: { aim: 1 }, matchFactor: { label: 'Ponta de lança', delta: 8 } } },

  // ── AWP ─────────────────────────────────────────────────────────────────
  { id: 'a_onetap', tree: 'AWP', tier: 1, reqLevel: 1, label: 'Um tiro, um abate', icon: 'crosshair',
    desc: 'AWP na mão é dinheiro no banco.', effect: { attr: { awp: 2 }, matchFactor: { label: 'AWP letal', delta: 6 } } },
  { id: 'a_hold', tree: 'AWP', tier: 2, reqLevel: 5, reqPerk: 'a_onetap', label: 'Segurar ângulo', icon: 'snow',
    desc: 'Paciência de sniper: segura o ângulo e pune o peek.', effect: { attr: { preAim: 1, positioning: 1 } } },
  { id: 'a_flick', tree: 'AWP', tier: 3, reqLevel: 12, reqPerk: 'a_hold', label: 'Flick impossível', icon: 'spark',
    desc: 'Reflexo de AWP de elite — o no-scope vira opção.', effect: { attr: { crosshair: 1, reflexes: 1 }, matchFactor: { label: 'Flick', delta: 7 } } },

  // ── Rifler ────────────────────────────────────────────────────────────────
  { id: 'r_spray', tree: 'Rifler', tier: 1, reqLevel: 1, label: 'Controle de spray', icon: 'crosshair',
    desc: 'Domina o recuo — segura o feixe no alvo.', effect: { attr: { spray: 2, tap: 1 } } },
  { id: 'r_metro', tree: 'Rifler', tier: 2, reqLevel: 5, reqPerk: 'r_spray', label: 'Metrônomo', icon: 'balance',
    desc: 'Rendimento constante rodada após rodada.', effect: { attr: { consistency: 1 }, matchFactor: { label: 'Consistência', delta: 5 } } },
  { id: 'r_deadeye', tree: 'Rifler', tier: 3, reqLevel: 12, reqPerk: 'r_metro', label: 'Olho de águia', icon: 'spark',
    desc: 'Mira cirúrgica: a cabeça é sempre o alvo.', effect: { attr: { aim: 1, headshot: 2 } } },

  // ── Support ─────────────────────────────────────────────────────────────
  { id: 's_util', tree: 'Support', tier: 1, reqLevel: 1, label: 'Mestre do utilitário', icon: 'bomb',
    desc: 'Suas granadas montam o round pro time.', effect: { attr: { teamwork: 1 }, matchFactor: { label: 'Utilitário', delta: 5 } } },
  { id: 's_glue', tree: 'Support', tier: 2, reqLevel: 5, reqPerk: 's_util', label: 'Cola do time', icon: 'team',
    desc: 'Mantém a comunicação limpa e a disciplina em pé.', effect: { attr: { communication: 1, discipline: 1 } } },
  { id: 's_self', tree: 'Support', tier: 3, reqLevel: 12, reqPerk: 's_glue', label: 'Altruísta', icon: 'balance',
    desc: 'Se sacrifica pela troca sem abalar a cabeça.', effect: { attr: { positioning: 1 }, tiltResist: 0.12 } },

  // ── Lurker ──────────────────────────────────────────────────────────────
  { id: 'l_flank', tree: 'Lurker', tier: 1, reqLevel: 1, label: 'Sombra', icon: 'skull',
    desc: 'Aparece onde ninguém espera.', effect: { attr: { offAngles: 1, anticipation: 1 } } },
  { id: 'l_time', tree: 'Lurker', tier: 2, reqLevel: 5, reqPerk: 'l_flank', label: 'Timing de lurk', icon: 'brain',
    desc: 'Lê o mapa e chega na hora exata.', effect: { attr: { gameSense: 1 }, matchFactor: { label: 'Timing de lurk', delta: 6 } } },
  { id: 'l_dna', tree: 'Lurker', tier: 3, reqLevel: 12, reqPerk: 'l_time', label: 'DNA de clutch', icon: 'snow',
    desc: 'No 1vX, o tempo desacelera pra você.', effect: { attr: { clutch: 1, composure: 1 }, matchFactor: { label: 'Clutch', delta: 8 } } },

  // ── IGL ─────────────────────────────────────────────────────────────────
  { id: 'i_default', tree: 'IGL', tier: 1, reqLevel: 1, label: 'Mid-round caller', icon: 'brain',
    desc: 'Lê o mid-round e ajusta a chamada na hora.', effect: { attr: { decisions: 1 }, matchFactor: { label: 'Mid-round', delta: 5 } } },
  { id: 'i_master', tree: 'IGL', tier: 2, reqLevel: 5, reqPerk: 'i_default', label: 'Mente mestra', icon: 'balance',
    desc: 'Comanda o time e enxerga o jogo de cima.', effect: { attr: { leadership: 1, gameSense: 1 } } },
  { id: 'i_eco', tree: 'IGL', tier: 3, reqLevel: 12, reqPerk: 'i_master', label: 'Antecipa o eco', icon: 'chart',
    desc: 'Adivinha a economia e o setup do adversário.', effect: { attr: { anticipation: 1 }, matchFactor: { label: 'Leitura de eco', delta: 7 } } },

  // ── Tiers 4-5 (meio/fim de carreira) — a árvore não acaba na 3ª temporada ──
  // T4 no nível 18 e T5 no nível 30: os pontos de perk continuam tendo destino
  // depois que a trilha básica fecha. Efeitos na mesma régua dos T3 (nada de
  // power creep — é EXTENSÃO da identidade, não uma segunda curva de poder).
  { id: 'u_brand', tree: 'universal', tier: 4, reqLevel: 18, reqPerk: 'u_icon', label: 'Marca própria', icon: 'chart',
    desc: 'Seu nome virou negócio: fama rende ainda mais e você não se abala fácil.', effect: { fameMult: 1.2, tiltResist: 0.1 } },
  { id: 'u_immortal', tree: 'universal', tier: 5, reqLevel: 30, reqPerk: 'u_brand', label: 'Nome eterno', icon: 'trophy',
    desc: 'Você joga pela história. Frieza e disciplina de quem já viu de tudo.', effect: { attr: { composure: 1, discipline: 1 }, matchFactor: { label: 'Legado', delta: 5 } } },

  { id: 'e_tempo', tree: 'Entry', tier: 4, reqLevel: 18, reqPerk: 'e_spear', label: 'Dono do tempo', icon: 'focus',
    desc: 'Você dita QUANDO o round começa — o peek sai na sua hora.', effect: { attr: { anticipation: 1, aimMovement: 1 } } },
  { id: 'e_legend', tree: 'Entry', tier: 5, reqLevel: 30, reqPerk: 'e_tempo', label: 'Quebra-portão', icon: 'fire',
    desc: 'Não existe site fechado pra você.', effect: { attr: { aim: 1 }, matchFactor: { label: 'Quebra-portão', delta: 6 } } },

  { id: 'a_zone', tree: 'AWP', tier: 4, reqLevel: 18, reqPerk: 'a_flick', label: 'Zona de exclusão', icon: 'snow',
    desc: 'Metade do mapa fica proibida enquanto sua AWP olha pra ela.', effect: { attr: { positioning: 1, gameSense: 1 } } },
  { id: 'a_era', tree: 'AWP', tier: 5, reqLevel: 30, reqPerk: 'a_zone', label: 'A Era da AWP', icon: 'trophy',
    desc: 'Seu nome entra na conversa de melhor sniper da geração.', effect: { attr: { awp: 1 }, matchFactor: { label: 'Era da AWP', delta: 6 } } },

  { id: 'r_machine', tree: 'Rifler', tier: 4, reqLevel: 18, reqPerk: 'r_deadeye', label: 'Máquina de rounds', icon: 'gym',
    desc: 'Rating alto virou rotina — o piso do seu jogo é o teto dos outros.', effect: { attr: { consistency: 1, stamina: 1 } } },
  { id: 'r_prime', tree: 'Rifler', tier: 5, reqLevel: 30, reqPerk: 'r_machine', label: 'Prime absoluto', icon: 'spark',
    desc: 'O rifle na sua mão é argumento técnico.', effect: { attr: { headshot: 1 }, matchFactor: { label: 'Prime', delta: 6 } } },

  { id: 's_shotcall', tree: 'Support', tier: 4, reqLevel: 18, reqPerk: 's_self', label: 'Segundo caller', icon: 'brain',
    desc: 'Você enxerga o que o IGL não viu — e corrige no meio do round.', effect: { attr: { decisions: 1, communication: 1 } } },
  { id: 's_backbone', tree: 'Support', tier: 5, reqLevel: 30, reqPerk: 's_shotcall', label: 'Espinha dorsal', icon: 'team',
    desc: 'Time com você de suporte simplesmente não desmorona.', effect: { tiltResist: 0.12, matchFactor: { label: 'Espinha dorsal', delta: 5 } } },

  { id: 'l_ghost', tree: 'Lurker', tier: 4, reqLevel: 18, reqPerk: 'l_dna', label: 'Fantasma do mapa', icon: 'skull',
    desc: 'O adversário joga com medo do flank que talvez nem venha.', effect: { attr: { offAngles: 1, composure: 1 } } },
  { id: 'l_judge', tree: 'Lurker', tier: 5, reqLevel: 30, reqPerk: 'l_ghost', label: 'Juiz do round', icon: 'snow',
    desc: 'Todo round apertado termina na sua decisão.', effect: { attr: { clutch: 1 }, matchFactor: { label: 'Juiz do round', delta: 6 } } },

  { id: 'i_library', tree: 'IGL', tier: 4, reqLevel: 18, reqPerk: 'i_eco', label: 'Biblioteca viva', icon: 'brain',
    desc: 'Você tem resposta pronta pra todo protocolo que já viu — e viu todos.', effect: { attr: { gameSense: 1, anticipation: 1 } } },
  { id: 'i_dynasty', tree: 'IGL', tier: 5, reqLevel: 30, reqPerk: 'i_library', label: 'Arquiteto de dinastia', icon: 'trophy',
    desc: 'Sistemas que você desenha viram meta. Times inteiros jogam sua ideia.', effect: { attr: { leadership: 1 }, matchFactor: { label: 'Arquiteto', delta: 6 } } },

  // ── ESTILOS DE JOGO (RTP v17) — 2 trilhas exclusivas por função, 3 perks cada.
  // Níveis 8/15/24 (entre os T2/T3/T4 da trilha base). Mesma régua de efeito.

  // Entry · Cara do Rush
  { id: 'e_rush_1', tree: 'Entry', style: 'st_e_rush', tier: 2, reqLevel: 8, label: 'Pé na porta', icon: 'fire',
    desc: 'Ninguém segura seu primeiro passo no site.', effect: { attr: { aimMovement: 1, reflexes: 1 } } },
  { id: 'e_rush_2', tree: 'Entry', style: 'st_e_rush', tier: 3, reqLevel: 15, reqPerk: 'e_rush_1', label: 'Onda de choque', icon: 'spark',
    desc: 'Seu rush desorganiza a defesa inteira — atrás de você vem o time.', effect: { attr: { stamina: 1 }, matchFactor: { label: 'Rush', delta: 6 } } },
  { id: 'e_rush_3', tree: 'Entry', style: 'st_e_rush', tier: 4, reqLevel: 24, reqPerk: 'e_rush_2', label: 'Avalanche', icon: 'fire',
    desc: 'Quando você decide entrar, o round já começou 2x1.', effect: { attr: { aim: 1 }, matchFactor: { label: 'Avalanche', delta: 7 } } },

  // Entry · Abridor Cirúrgico
  { id: 'e_cir_1', tree: 'Entry', style: 'st_e_cirurgico', tier: 2, reqLevel: 8, label: 'Peek de raio-X', icon: 'focus',
    desc: 'Você já sabe onde o defensor está antes de aparecer.', effect: { attr: { preAim: 1, anticipation: 1 } } },
  { id: 'e_cir_2', tree: 'Entry', style: 'st_e_cirurgico', tier: 3, reqLevel: 15, reqPerk: 'e_cir_1', label: 'Entrada montada', icon: 'team',
    desc: 'Flash na cara, peek no timing, trade atrás: a entrada vira protocolo.', effect: { attr: { teamwork: 1 }, matchFactor: { label: 'Entrada montada', delta: 6 } } },
  { id: 'e_cir_3', tree: 'Entry', style: 'st_e_cirurgico', tier: 4, reqLevel: 24, reqPerk: 'e_cir_2', label: 'Bisturi', icon: 'crosshair',
    desc: 'Abertura limpa, sem troca: o site abre e você continua vivo.', effect: { attr: { headshot: 1, decisions: 1 } } },

  // AWP · AWP de Ataque
  { id: 'a_atk_1', tree: 'AWP', style: 'st_a_ataque', tier: 2, reqLevel: 8, label: 'Peek de AWP', icon: 'spark',
    desc: 'A AWP peekando é heresia — até acertar. Você acerta.', effect: { attr: { aimMovement: 1, reflexes: 1 } } },
  { id: 'a_atk_2', tree: 'AWP', style: 'st_a_ataque', tier: 3, reqLevel: 15, reqPerk: 'a_atk_1', label: 'Caçada', icon: 'crosshair',
    desc: 'Você não espera o pick: vai buscar.', effect: { attr: { apm: 1 }, matchFactor: { label: 'Caçada', delta: 6 } } },
  { id: 'a_atk_3', tree: 'AWP', style: 'st_a_ataque', tier: 4, reqLevel: 24, reqPerk: 'a_atk_2', label: 'Trovoada', icon: 'fire',
    desc: 'Dois picks em cinco segundos. O round acabou antes de começar.', effect: { attr: { awp: 1 }, matchFactor: { label: 'Trovoada', delta: 7 } } },

  // AWP · Âncora Absoluta
  { id: 'a_anc_1', tree: 'AWP', style: 'st_a_ancora', tier: 2, reqLevel: 8, label: 'Muralha', icon: 'snow',
    desc: 'Seu ângulo não é disputável. É um fato do mapa.', effect: { attr: { positioning: 1, concentration: 1 } } },
  { id: 'a_anc_2', tree: 'AWP', style: 'st_a_ancora', tier: 3, reqLevel: 15, reqPerk: 'a_anc_1', label: 'Pedágio', icon: 'balance',
    desc: 'Atravessar sua mira custa um jogador. Todo round.', effect: { attr: { discipline: 1 }, matchFactor: { label: 'Pedágio', delta: 6 } } },
  { id: 'a_anc_3', tree: 'AWP', style: 'st_a_ancora', tier: 4, reqLevel: 24, reqPerk: 'a_anc_2', label: 'Território interditado', icon: 'snow',
    desc: 'Metade do mapa sai do plano adversário só porque você existe.', effect: { attr: { preAim: 1 }, matchFactor: { label: 'Território', delta: 7 } } },

  // Rifler · Estrela do Rifle
  { id: 'r_est_1', tree: 'Rifler', style: 'st_r_estrela', tier: 2, reqLevel: 8, label: 'Fome de round', icon: 'fame',
    desc: 'Um kill nunca basta. Você joga pro segundo e pro terceiro.', effect: { attr: { aim: 1, apm: 1 } } },
  { id: 'r_est_2', tree: 'Rifler', style: 'st_r_estrela', tier: 3, reqLevel: 15, reqPerk: 'r_est_1', label: 'Modo highlight', icon: 'spark',
    desc: 'O clip da semana costuma ter seu nick nele.', effect: { matchFactor: { label: 'Highlight', delta: 6 } } },
  { id: 'r_est_3', tree: 'Rifler', style: 'st_r_estrela', tier: 4, reqLevel: 24, reqPerk: 'r_est_2', label: 'Hard carry', icon: 'trophy',
    desc: 'Dia ruim do time é dia de 30 bombas seu.', effect: { attr: { consistency: 1 }, matchFactor: { label: 'Carry', delta: 7 } } },

  // Rifler · Motor do Time
  { id: 'r_mot_1', tree: 'Rifler', style: 'st_r_motor', tier: 2, reqLevel: 8, label: 'Troca garantida', icon: 'trade',
    desc: 'Companheiro caiu, o adversário cai junto. Sempre.', effect: { attr: { teamwork: 1, positioning: 1 } } },
  { id: 'r_mot_2', tree: 'Rifler', style: 'st_r_motor', tier: 3, reqLevel: 15, reqPerk: 'r_mot_1', label: 'Sempre no lugar certo', icon: 'brain',
    desc: 'Ninguém nota até faltar: o round funciona porque você estava lá.', effect: { attr: { gameSense: 1 }, matchFactor: { label: 'Motor', delta: 5 } } },
  { id: 'r_mot_3', tree: 'Rifler', style: 'st_r_motor', tier: 4, reqLevel: 24, reqPerk: 'r_mot_2', label: 'Turbina', icon: 'gym',
    desc: 'Mapa 3 da série, overtime, e o seu nível não cai um milímetro.', effect: { attr: { stamina: 1, consistency: 1 }, tiltResist: 0.08 } },

  // Support · Mago do Utilitário
  { id: 's_mag_1', tree: 'Support', style: 'st_s_mago', tier: 2, reqLevel: 8, label: 'Lineup de livro', icon: 'bomb',
    desc: 'Pixel, contagem, arco: sua granada cai onde a teoria manda.', effect: { attr: { coordination: 1, vision: 1 } } },
  { id: 's_mag_2', tree: 'Support', style: 'st_s_mago', tier: 3, reqLevel: 15, reqPerk: 's_mag_1', label: 'Flash de deus', icon: 'spark',
    desc: 'O defensor fecha o olho e o seu Entry agradece.', effect: { matchFactor: { label: 'Flash cega', delta: 6 } } },
  { id: 's_mag_3', tree: 'Support', style: 'st_s_mago', tier: 4, reqLevel: 24, reqPerk: 's_mag_2', label: 'Arquiteto do round', icon: 'brain',
    desc: 'Quatro granadas suas e o site já está aberto antes do primeiro tiro.', effect: { attr: { teamwork: 1 }, matchFactor: { label: 'Arquiteto do round', delta: 7 } } },

  // Support · Guarda-costas
  { id: 's_gua_1', tree: 'Support', style: 'st_s_guarda', tier: 2, reqLevel: 8, label: 'Escudo da estrela', icon: 'team',
    desc: 'Sua posição existe pra estrela do time jogar sem medo.', effect: { attr: { positioning: 1, teamwork: 1 } } },
  { id: 's_gua_2', tree: 'Support', style: 'st_s_guarda', tier: 3, reqLevel: 15, reqPerk: 's_gua_1', label: 'Sombra fiel', icon: 'trade',
    desc: 'Quem abate seu companheiro não vive pra contar.', effect: { matchFactor: { label: 'Trade imediato', delta: 6 } } },
  { id: 's_gua_3', tree: 'Support', style: 'st_s_guarda', tier: 4, reqLevel: 24, reqPerk: 's_gua_2', label: 'Anjo da guarda', icon: 'health',
    desc: 'Com você na retaguarda o time simplesmente não entra em pânico.', effect: { attr: { composure: 1 }, tiltResist: 0.1 } },

  // Lurker · Fantasma de Informação
  { id: 'l_inf_1', tree: 'Lurker', style: 'st_l_info', tier: 2, reqLevel: 8, label: 'Ouvido no chão', icon: 'headset',
    desc: 'Três passos e uma recarga: você já sabe a rotação inteira.', effect: { attr: { vision: 1, anticipation: 1 } } },
  { id: 'l_inf_2', tree: 'Lurker', style: 'st_l_info', tier: 3, reqLevel: 15, reqPerk: 'l_inf_1', label: 'Mapa mental', icon: 'brain',
    desc: 'Sua call de lurk vale mais que um abate: o time joga vendo tudo.', effect: { attr: { communication: 1 }, matchFactor: { label: 'Info limpa', delta: 6 } } },
  { id: 'l_inf_3', tree: 'Lurker', style: 'st_l_info', tier: 4, reqLevel: 24, reqPerk: 'l_inf_2', label: 'Onisciência', icon: 'focus',
    desc: 'O adversário ainda está decidindo e você já contou pro IGL.', effect: { attr: { decisions: 1 }, matchFactor: { label: 'Onisciência', delta: 7 } } },

  // Lurker · Executor Solo
  { id: 'l_sol_1', tree: 'Lurker', style: 'st_l_solo', tier: 2, reqLevel: 8, label: 'Caçador noturno', icon: 'skull',
    desc: 'O flank não é rota de fuga: é o seu terreno de caça.', effect: { attr: { offAngles: 1, composure: 1 } } },
  { id: 'l_sol_2', tree: 'Lurker', style: 'st_l_solo', tier: 3, reqLevel: 15, reqPerk: 'l_sol_1', label: 'Emboscada', icon: 'snow',
    desc: 'A rotação adversária passa por você — e não chega.', effect: { matchFactor: { label: 'Emboscada', delta: 6 } } },
  { id: 'l_sol_3', tree: 'Lurker', style: 'st_l_solo', tier: 4, reqLevel: 24, reqPerk: 'l_sol_2', label: 'Xeque-mate', icon: 'skull',
    desc: 'Fim de round apertado com você vivo não é aperto: é execução.', effect: { attr: { clutch: 1 }, matchFactor: { label: 'Xeque-mate', delta: 7 } } },

  // IGL · Cientista do CS
  { id: 'i_lab_1', tree: 'IGL', style: 'st_i_lab', tier: 2, reqLevel: 8, label: 'Caderno de demos', icon: 'demos',
    desc: 'Cada demo assistida vira arma. Você estuda como ninguém.', effect: { trainingXpMult: 1.08, attr: { gameSense: 1 } } },
  { id: 'i_lab_2', tree: 'IGL', style: 'st_i_lab', tier: 3, reqLevel: 15, reqPerk: 'i_lab_1', label: 'Anti-strat', icon: 'chart',
    desc: 'O protocolo favorito deles morre no seu quadro branco.', effect: { matchFactor: { label: 'Anti-strat', delta: 6 } } },
  { id: 'i_lab_3', tree: 'IGL', style: 'st_i_lab', tier: 4, reqLevel: 24, reqPerk: 'i_lab_2', label: 'Xadrez em 5D', icon: 'brain',
    desc: 'Você chama a jogada que responde a jogada que eles ainda vão fazer.', effect: { attr: { anticipation: 1, decisions: 1 } } },

  // IGL · Comandante de Vestiário
  { id: 'i_voz_1', tree: 'IGL', style: 'st_i_voz', tier: 2, reqLevel: 8, label: 'Voz firme', icon: 'headset',
    desc: 'Rádio limpo, ordem curta: no caos, o time ouve VOCÊ.', effect: { attr: { leadership: 1, communication: 1 } } },
  { id: 'i_voz_2', tree: 'IGL', style: 'st_i_voz', tier: 3, reqLevel: 15, reqPerk: 'i_voz_1', label: 'Time blindado', icon: 'team',
    desc: 'Derrota não vira crise no seu vestiário.', effect: { tiltResist: 0.12 } },
  { id: 'i_voz_3', tree: 'IGL', style: 'st_i_voz', tier: 4, reqLevel: 24, reqPerk: 'i_voz_2', label: 'Discurso de final', icon: 'trophy',
    desc: 'Intervalo, 12x3 contra — e o time volta acreditando. E vira.', effect: { attr: { composure: 1 }, matchFactor: { label: 'Discurso', delta: 6 } } },
];

export function perkById(id: string): PerkDef | undefined {
  return PERKS.find((p) => p.id === id);
}

// Árvore relevante pro jogador: universal + a da sua função.
export function perkTreeFor(role: Role): PerkDef[] {
  return PERKS.filter((p) => p.tree === 'universal' || p.tree === role);
}

// Estilo com que a carreira se COMPROMETEU (primeiro perk de estilo desbloqueado
// define; undefined = ainda não escolheu). Perks de estilo só existem na árvore
// da própria função, então basta olhar os perks possuídos.
export function chosenStyleId(prog: PlayerProgression): string | undefined {
  for (const id of prog.perks) {
    const st = perkById(id)?.style;
    if (st) return st;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAITS — identidade emergente (auto-conquistada pelo estilo de jogo)

export interface TraitDef {
  id: string;
  label: string;
  desc: string;
  icon: RtpIconName;
  // condição de desbloqueio, avaliada sobre os contadores + contexto do jogador.
  earned: (t: ProgressTally, ctx: { matches: number; trophies: number; fame: number; peakOvr: number }) => boolean;
  effect: PerkEffect;
}

export const TRAITS: TraitDef[] = [
  { id: 't_opener', label: 'Abridor nato', icon: 'spark',
    desc: 'Aberturas viraram sua assinatura.', earned: (t) => t.openings >= 25,
    effect: { matchFactor: { label: 'Abridor', delta: 4 } } },
  { id: 't_clutch', label: 'Clutch merchant', icon: 'snow',
    desc: 'O time confia em você no 1vX.', earned: (t) => t.clutches >= 15,
    effect: { matchFactor: { label: 'Clutch', delta: 5 } } },
  { id: 't_head', label: 'Caçador de cabeça', icon: 'crosshair',
    desc: 'Se tem cabeça, você acerta.', earned: (t) => t.hs >= 120,
    effect: { matchFactor: { label: 'HS', delta: 4 } } },
  { id: 't_ice', label: 'Sangue de gelo', icon: 'snow',
    desc: 'Sequências longas sem tremer na mão.', earned: (t) => t.peakStreak >= 6,
    effect: { tiltResist: 0.12 } },
  { id: 't_giant', label: 'Mata-gigante', icon: 'fire',
    desc: 'Cresce contra os favoritos.', earned: (t) => t.bigWins >= 5,
    effect: { matchFactor: { label: 'Grandes jogos', delta: 4 } } },
  { id: 't_vet', label: 'Veterano', icon: 'balance',
    desc: 'Rodagem que só o tempo dá.', earned: (_t, c) => c.matches >= 100,
    effect: { attr: { composure: 1, discipline: 1 } } },
  { id: 't_star', label: 'Estrela', icon: 'fame',
    desc: 'Seu nome enche arena.', earned: (_t, c) => c.fame >= 60,
    effect: { fameMult: 1.2 } },
  { id: 't_champ', label: 'Mentalidade vencedora', icon: 'trophy',
    desc: 'Já sabe o gosto de levantar taça.', earned: (_t, c) => c.trophies >= 1,
    effect: { matchFactor: { label: 'Mentalidade', delta: 3 } } },
];

export function traitById(id: string): TraitDef | undefined {
  return TRAITS.find((t) => t.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Nível / XP

export const MAX_LEVEL = 50;

// XP necessário pra sair do nível L pro L+1 (curva suave e crescente).
export function xpToNext(level: number): number {
  return 60 + level * 30;
}

// XP ganho numa partida do herói.
export function xpForMatch(ctx: { won: boolean; rating: number; mvp: boolean }): number {
  return 25 + Math.round(clamp(ctx.rating, 0, 2) * 20) + (ctx.won ? 15 : 0) + (ctx.mvp ? 15 : 0);
}

export function defaultProgression(): PlayerProgression {
  return {
    level: 1, xp: 0, perkPoints: 0, perks: [], traits: [],
    tally: { wins: 0, openings: 0, clutches: 0, hs: 0, multiKills: 0, bigWins: 0, peakStreak: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Progressão pós-partida (chamada dentro do applyMatchOutcome). PURA.

// Contexto da partida montado pelo matchSim (evita ciclo de import).
export interface MatchProgressCtx {
  won: boolean;
  rating: number;
  mvp: boolean;
  streak: number;          // sequência já atualizada (life.flags.streak pós-partida)
  oppStrength: number;
  ovr: number;
  trophies: number;
  fame: number;
  heroStats: { openings: number; clutches: number; hs: number; multiKills: number };
}

export interface ProgressResult {
  progression: PlayerProgression;
  xpGained: number;
  leveledUp: number;       // quantos níveis subiu (0 se nenhum)
  newLevel: number;
  pointsGained: number;
  newTraits: string[];     // ids de traits conquistados AGORA
}

export function applyMatchProgression(prog: PlayerProgression, ctx: MatchProgressCtx): ProgressResult {
  // 1) contadores vitalícios
  const bigWin = ctx.won && ctx.oppStrength >= ctx.ovr + 4;
  const tally: ProgressTally = {
    wins: prog.tally.wins + (ctx.won ? 1 : 0),
    openings: prog.tally.openings + ctx.heroStats.openings,
    clutches: prog.tally.clutches + ctx.heroStats.clutches,
    hs: prog.tally.hs + ctx.heroStats.hs,
    multiKills: prog.tally.multiKills + ctx.heroStats.multiKills,
    bigWins: prog.tally.bigWins + (bigWin ? 1 : 0),
    peakStreak: Math.max(prog.tally.peakStreak, Math.max(0, ctx.streak)),
  };

  // 2) XP + level up (pode subir mais de um nível numa partida excepcional)
  const xpGained = xpForMatch(ctx);
  let level = prog.level;
  let xp = prog.xp + xpGained;
  let pointsGained = 0;
  while (level < MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    pointsGained += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;

  // 3) traits emergentes (detecta sobre os NOVOS contadores/contexto). t_vet
  //    depende de matchesPlayed (não disponível aqui) → detectado no caller via
  //    detectHistoryTraits; aqui cobrimos os que dependem só de tally/fama/troféus.
  const cCtx = { matches: 0, trophies: ctx.trophies, fame: ctx.fame, peakOvr: ctx.ovr };
  const newTraits: string[] = [];
  const owned = new Set(prog.traits);
  for (const tr of TRAITS) {
    if (owned.has(tr.id) || tr.id === 't_vet') continue;
    if (tr.earned(tally, cCtx)) newTraits.push(tr.id);
  }

  return {
    progression: {
      level, xp,
      perkPoints: prog.perkPoints + pointsGained,
      perks: prog.perks,
      traits: [...prog.traits, ...newTraits],
      tally,
    },
    xpGained,
    leveledUp: level - prog.level,
    newLevel: level,
    pointsGained,
    newTraits,
  };
}

// Detecção de traits que dependem do histórico completo (ex.: t_vet por partidas
// jogadas). Chamada pelo caller com matchesPlayed real. Retorna ids novos.
export function detectHistoryTraits(prog: PlayerProgression, matches: number, trophies: number, fame: number, peakOvr: number): string[] {
  const owned = new Set(prog.traits);
  const cCtx = { matches, trophies, fame, peakOvr };
  const out: string[] = [];
  for (const tr of TRAITS) {
    if (owned.has(tr.id) || !tr.earned(prog.tally, cCtx)) continue;
    out.push(tr.id);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregação de passivos (perks + traits ativos) — consumida pelo match/treino/vida

export interface AggregatePassives {
  attrBonus: Partial<Record<AttrKey, number>>;
  matchFactors: { label: string; delta: number; good: boolean }[];
  tiltResist: number;
  trainingXpMult: number;
  fameMult: number;
}

function foldEffect(agg: AggregatePassives, e: PerkEffect): void {
  if (e.attr) for (const k of Object.keys(e.attr) as AttrKey[]) agg.attrBonus[k] = (agg.attrBonus[k] ?? 0) + (e.attr[k] ?? 0);
  if (e.matchFactor) agg.matchFactors.push({ label: e.matchFactor.label, delta: e.matchFactor.delta, good: e.matchFactor.delta >= 0 });
  if (e.tiltResist) agg.tiltResist += e.tiltResist;
  if (e.trainingXpMult) agg.trainingXpMult *= e.trainingXpMult;
  if (e.fameMult) agg.fameMult *= e.fameMult;
}

export function aggregatePassives(save: RoadToProSave): AggregatePassives {
  const prog = save.player.progression ?? defaultProgression();
  const agg: AggregatePassives = { attrBonus: {}, matchFactors: [], tiltResist: 0, trainingXpMult: 1, fameMult: 1 };
  for (const id of prog.perks) { const p = perkById(id); if (p) foldEffect(agg, p.effect); }
  for (const id of prog.traits) { const t = traitById(id); if (t) foldEffect(agg, t.effect); }
  agg.tiltResist = clamp(agg.tiltResist, 0, 0.6);
  return agg;
}

// Só o bônus de atributo (dobrado no effectiveAttrs — entra no roll real).
export function perkAttrBonus(save: RoadToProSave): Partial<Record<AttrKey, number>> {
  return aggregatePassives(save).attrBonus;
}

// Fatores visíveis das perks/traits pro Round Room (append em prep.factors).
export function perkMatchFactors(save: RoadToProSave): { label: string; delta: number; good: boolean }[] {
  return aggregatePassives(save).matchFactors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desbloqueio de perks (gasta ponto)

export interface UnlockCheck { ok: boolean; reason?: string }

export function canUnlock(save: RoadToProSave, perkId: string): UnlockCheck {
  const prog = save.player.progression ?? defaultProgression();
  const def = perkById(perkId);
  if (!def) return { ok: false, reason: 'Perk inexistente.' };
  if (prog.perks.includes(perkId)) return { ok: false, reason: 'Já desbloqueado.' };
  if (def.tree !== 'universal' && def.tree !== save.player.role) return { ok: false, reason: 'Fora da sua função.' };
  if (prog.perkPoints < 1) return { ok: false, reason: 'Sem pontos de perk.' };
  if (prog.level < def.reqLevel) return { ok: false, reason: `Requer nível ${def.reqLevel}.` };
  // Estilos são exclusivos por função: comprometeu com um, o rival tranca.
  if (def.style) {
    const chosen = chosenStyleId(prog);
    if (chosen && chosen !== def.style) {
      return { ok: false, reason: `Seu estilo é ${styleById(chosen)?.label ?? chosen} — escolha definitiva.` };
    }
  }
  if (def.reqPerk && !prog.perks.includes(def.reqPerk)) {
    const pre = perkById(def.reqPerk);
    return { ok: false, reason: `Requer "${pre?.label ?? def.reqPerk}".` };
  }
  return { ok: true };
}

export function unlockPerk(save: RoadToProSave, perkId: string): RoadToProSave {
  if (!canUnlock(save, perkId).ok) return save;
  const prog = save.player.progression;
  return {
    ...save,
    player: {
      ...save.player,
      progression: { ...prog, perkPoints: prog.perkPoints - 1, perks: [...prog.perks, perkId] },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legado / marcos de carreira (display)

export function legacyScore(save: RoadToProSave): number {
  const prog = save.player.progression ?? defaultProgression();
  const h = save.history;
  // Prêmios individuais pesam no legado: MVP de campeonato vale mais que EVP.
  const acc = h.accolades ?? [];
  const accoladePts = acc.reduce((s, a) => s + (a.kind === 'mvp' ? 30 : 15), 0);
  // Chegar ao topo do mundo é feito de lenda: bônus pelo melhor ranking já atingido.
  const peak = save.world.peakRank;
  const peakPts = typeof peak === 'number' ? (peak <= 1 ? 120 : peak <= 5 ? 80 : peak <= 20 ? 45 : peak <= 50 ? 20 : 0) : 0;
  // Recordes de dinastia (RTP v15): quebrar um marco de lenda, fechar temporada
  // invicta e reinar semanas no #1 são o que separa campeão de LENDA.
  const rec = h.records;
  const recordPts = rec
    ? rec.broken.length * 40 + rec.perfectSeasons * 35 + Math.min(60, rec.totalWeeksAtOne) + rec.bestTitleStreak * 8
    : 0;
  // Vida de pro (RTP v16): o que você CONSTRUIU fora do servidor também conta —
  // tirar a família do aluguel pesa mais que qualquer cobertura.
  const lifePts = (save.lifestyle?.housing ?? 0) * 12 + (save.lifestyle?.familyHome ? 40 : 0);
  return Math.round(
    prog.level * 6 +
    h.trophies.length * 40 +
    h.awards.length * 25 +
    h.mvps * 6 +
    accoladePts +
    peakPts +
    recordPts +
    lifePts +
    save.player.ovr +
    prog.traits.length * 12,
  );
}

export interface LegacyTier { label: string; min: number }
const LEGACY_TIERS: LegacyTier[] = [
  { label: 'Lenda', min: 700 },
  { label: 'Estrela', min: 450 },
  { label: 'Profissional', min: 250 },
  { label: 'Promessa', min: 130 },
  { label: 'Prospecto', min: 0 },
];
export function legacyTier(score: number): string {
  return (LEGACY_TIERS.find((t) => score >= t.min) ?? LEGACY_TIERS[LEGACY_TIERS.length - 1]).label;
}

export interface Milestone { id: string; label: string; icon: RtpIconName; done: (save: RoadToProSave) => boolean; }
export const MILESTONES: Milestone[] = [
  { id: 'm_debut', label: 'Estreia profissional', icon: 'calendar', done: (s) => s.history.matchesPlayed >= 1 },
  { id: 'm_win', label: 'Primeira vitória', icon: 'check', done: (s) => (s.player.progression?.tally.wins ?? 0) >= 1 },
  { id: 'm_10', label: '10 partidas na estrada', icon: 'chart', done: (s) => s.history.matchesPlayed >= 10 },
  { id: 'm_mvp', label: 'Primeiro MVP', icon: 'fame', done: (s) => s.history.mvps >= 1 },
  { id: 'm_lvl10', label: 'Nível 10', icon: 'arrowUp', done: (s) => (s.player.progression?.level ?? 1) >= 10 },
  { id: 'm_title', label: 'Primeiro título', icon: 'trophy', done: (s) => s.history.trophies.length >= 1 },
  { id: 'm_100', label: '100 partidas', icon: 'calendar', done: (s) => s.history.matchesPlayed >= 100 },
  { id: 'm_ovr85', label: 'OVR 85', icon: 'spark', done: (s) => s.history.peakOvr >= 85 },
  { id: 'm_lvl25', label: 'Nível 25', icon: 'arrowUp', done: (s) => (s.player.progression?.level ?? 1) >= 25 },
];

export function milestoneProgress(save: RoadToProSave): { done: number; total: number } {
  const done = MILESTONES.filter((m) => m.done(save)).length;
  return { done, total: MILESTONES.length };
}
