// Sub-roles — T3.3 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Cada player tem afinidade 0-5 com cada sub-role. A sub-role DOMINANTE é a
// com maior valor. Sub-roles complementam o `Role` legacy (AWP/IGL/Rifler/
// Entry/Support/Lurker) — são MAIS ESPECÍFICAS e usadas pra:
//   1) Análise de comp (compositionPenalty: 3+ no mesmo subrole dominante = ruim)
//   2) UI: SubRoleStars no profile do player
//   3) Match engine: leve modulador de killStyleMult (futuro)
//
// Cálculo é DETERMINÍSTICO em função do Role + atributos (aim/igl/awp/clutch/
// consistency). Save guarda em `player.subRoles?: Record<SubRole, number>`
// como cache (preenchido sob demanda; migration v5 só estampa o campo).

import type { Player, Role } from '../types';

export type SubRole =
  | 'entryFragger'      // entra primeiro no site, trade-bait, peeker
  | 'lurker'            // flanco isolado, info, late-round
  | 'support'           // util-heavy, joga atrás dos entries, trade
  | 'awper'             // AWPer principal — segura ângulos, abre rounds
  | 'awperSupport'      // segundo AWPer/peek; pode pegar a arma em mapas específicos
  | 'igl'               // IGL puro — tática + clutch ocasional
  | 'rifler'            // rifler genérico/star sem nicho fixo
  | 'anchor';           // segura site sozinho como CT

export const SUBROLE_LABEL: Record<SubRole, string> = {
  entryFragger: 'Entry Fragger',
  lurker: 'Lurker',
  support: 'Support',
  awper: 'AWPer',
  awperSupport: 'AWPer Secundário',
  igl: 'IGL',
  rifler: 'Rifler',
  anchor: 'Anchor',
};

export const SUBROLE_DESC: Record<SubRole, string> = {
  entryFragger: 'Entra primeiro no site, abre o duelo.',
  lurker: 'Flanco isolado, joga atrás das linhas inimigas.',
  support: 'Joga pra trade e arremessa a util pesada.',
  awper: 'AWPer principal: segura ângulos e abre rounds.',
  awperSupport: 'AWPer secundário — pega a arma em mapas/situações específicas.',
  igl: 'Chama a tática, IGL puro.',
  rifler: 'Rifler completo, sem nicho fixo (star player).',
  anchor: 'Segura site sozinho como CT, paciência alta.',
};

// Ordem canônica de exibição (do mais agressivo pro mais passivo)
export const SUBROLE_ORDER: SubRole[] = [
  'entryFragger',
  'awper',
  'rifler',
  'igl',
  'support',
  'awperSupport',
  'lurker',
  'anchor',
];

// ─────────────────────────────────────────────────────────────────────────────
// Derivação 0-5 por sub-role

/**
 * Calcula a afinidade 0-5 de um player com cada sub-role.
 * Determinístico em função do `role`, `role2`, e atributos (aim/igl/awp/etc).
 *
 * Nota: o cálculo é HEURÍSTICO — não é simulação. Serve pra mostrar perfil
 * (UI) e detectar comps quebradas (3+ no mesmo subrole). Match engine não
 * depende DESTE valor; usa stats diretas.
 */
export function subRoleStars(player: Player): Record<SubRole, number> {
  const r = player.role;
  const r2 = player.role2;
  const hasRole = (role: Role) => r === role || r2 === role;

  const aim = player.aim ?? 70;
  const clutch = player.clutch ?? 70;
  const consistency = player.consistency ?? 70;
  const awp = player.awp ?? 60;
  const igl = player.igl ?? 60;

  // Helpers — converte stat 50-99 em estrelas 0-5 com curva suave.
  // 99 ≈ 5 estrelas, 90 ≈ 4.5, 80 ≈ 3.5, 70 ≈ 2.5, 60 ≈ 1.5
  const stars = (v: number) => clamp05((v - 55) / 9);

  // Bônus por role específico (cravar com a função explícita)
  const roleBonus = (matches: boolean) => (matches ? 1.2 : 0);
  // Penalidade leve se a função LEGADA não bate (ex.: Entry de baixa aim
  // ainda ganha estrelas em "entry" pelo role, mas não fica 5 estrelas)
  const inRoleScale = (matches: boolean) => (matches ? 1 : 0.7);

  return {
    entryFragger: clamp05(
      stars(aim * 0.7 + (100 - consistency) * 0.2 + clutch * 0.1) * inRoleScale(hasRole('Entry')) + roleBonus(hasRole('Entry')),
    ),
    awper: clamp05(stars(awp) * inRoleScale(hasRole('AWP')) + roleBonus(hasRole('AWP'))),
    awperSupport: clamp05(
      // segundo AWPer = stat awp decente mas não primary; topa Rifler/Support com awp >= 70
      stars(Math.min(awp + 8, 99)) * (hasRole('AWP') ? 0.3 : awp >= 65 ? 0.85 : 0.4),
    ),
    igl: clamp05(stars(igl) * inRoleScale(hasRole('IGL')) + roleBonus(hasRole('IGL'))),
    rifler: clamp05(
      // rifler genérico = média de aim + consistency, bom em quase tudo
      stars((aim + consistency) / 2) * (hasRole('Rifler') ? 1.05 : 0.8),
    ),
    support: clamp05(
      // support = consistency alta + igl moderado, aim médio
      stars(consistency * 0.6 + igl * 0.25 + aim * 0.15) * inRoleScale(hasRole('Support')) + roleBonus(hasRole('Support')),
    ),
    lurker: clamp05(
      // lurker = clutch alto + aim independente, consistency moderada
      stars(clutch * 0.55 + aim * 0.3 + consistency * 0.15) * inRoleScale(hasRole('Lurker')) + roleBonus(hasRole('Lurker')),
    ),
    anchor: clamp05(
      // anchor (CT-defensor solo) = consistency + clutch
      stars(consistency * 0.55 + clutch * 0.45) * (hasRole('Support') || hasRole('Lurker') ? 1 : 0.7),
    ),
  };
}

/**
 * Sub-role DOMINANTE do player (maior valor). Default: 'rifler' se empate.
 */
export function dominantSubRole(player: Player): SubRole {
  const stars = subRoleStars(player);
  let best: SubRole = 'rifler';
  let bestVal = -1;
  for (const sr of SUBROLE_ORDER) {
    if (stars[sr] > bestVal) {
      bestVal = stars[sr];
      best = sr;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition penalty

/**
 * Penaliza comps com 3+ jogadores no MESMO sub-role dominante.
 * 3+ entries é overkill (sem util de open), 3+ awpers brigam pela arma, etc.
 * IGL e Rifler são neutros (rifler é "qualquer um", IGL só dá 1 obviamente).
 *
 * Retorna valor a SUBTRAIR do teamStrength (0 = comp balanceada, +N = penalty).
 */
export function compositionPenalty(starters: Player[]): number {
  if (starters.length === 0) return 0;
  const counts: Partial<Record<SubRole, number>> = {};
  for (const p of starters) {
    const sr = dominantSubRole(p);
    counts[sr] = (counts[sr] ?? 0) + 1;
  }
  let penalty = 0;
  for (const sr of SUBROLE_ORDER) {
    const c = counts[sr] ?? 0;
    // Rifler é "qualquer um": 3+ rifler é OK (não penaliza)
    if (sr === 'rifler') continue;
    // IGL: 1 OK, 2+ é estranho (2 IGLs brigam pela call) — penalty leve
    if (sr === 'igl' && c >= 2) {
      penalty += (c - 1) * 1.5;
      continue;
    }
    // AWPer: 1 ótimo, 2 OK, 3+ ruim
    if (sr === 'awper' && c >= 3) {
      penalty += (c - 2) * 3;
      continue;
    }
    // Entry/Support/Lurker/Anchor: 3+ é problema (-2 cada extra), 4+ é desastre
    if (c >= 3) {
      penalty += (c - 2) * 2 + (c >= 4 ? 2 : 0);
    }
  }
  return penalty;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function clamp05(v: number): number {
  if (v < 0) return 0;
  if (v > 5) return 5;
  return Math.round(v * 2) / 2; // arredonda pra 0.5
}
