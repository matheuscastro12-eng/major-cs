// Inferência de função (role) a partir da distribuição de papéis por round que o
// bo3.gg publica em /players/<slug>/player_roles (contagem de rounds em que o
// jogador foi classificado como awper, entry_fragger, lurker, trader, anchor,
// rotator, play_maker, por lado). O bo3.gg NÃO publica IGL: IGL só vem da base
// curada (ou de outra fonte explícita), nunca daqui.

export type Role = 'AWP' | 'IGL' | 'Rifler' | 'Entry' | 'Support' | 'Lurker';

export interface RoleRow { team_side: 'CT' | 'T' | null; role: string | null; count: number }

export interface RoleShares {
  total: number;      // rounds classificados
  awp: number;        // awper / total (os dois lados)
  tEntry: number;     // entry_fragger / rounds de T
  tLurk: number;      // lurker / rounds de T
  tTrade: number;     // trader / rounds de T
  tPlay: number;      // play_maker / rounds de T
  ctAnchor: number;   // anchor / rounds de CT
  ctRotate: number;   // rotator / rounds de CT
  entropy: number;    // 0..1, diversidade de papéis (versatilidade)
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function roleShares(rows: RoleRow[] | null | undefined): RoleShares | null {
  if (!rows || !rows.length) return null;
  const valid = rows.filter((r) => r.role && r.count > 0);
  const total = valid.reduce((s, r) => s + r.count, 0);
  if (total < 50) return null;
  const side = (s: 'CT' | 'T') => valid.filter((r) => r.team_side === s).reduce((a, r) => a + r.count, 0) || 1;
  const cnt = (role: string, s?: 'CT' | 'T') => valid.filter((r) => r.role === role && (!s || r.team_side === s)).reduce((a, r) => a + r.count, 0);
  const t = side('T');
  const ct = side('CT');
  // entropia normalizada sobre os papéis (sem lado)
  const byRole = new Map<string, number>();
  for (const r of valid) byRole.set(r.role!, (byRole.get(r.role!) ?? 0) + r.count);
  let h = 0;
  for (const c of byRole.values()) { const p = c / total; h -= p * Math.log(p); }
  const entropy = byRole.size > 1 ? h / Math.log(7) : 0; // 7 papéis possíveis
  return {
    total,
    awp: r4(cnt('awper') / total),
    tEntry: r4(cnt('entry_fragger', 'T') / t),
    tLurk: r4(cnt('lurker', 'T') / t),
    tTrade: r4(cnt('trader', 'T') / t),
    tPlay: r4(cnt('play_maker', 'T') / t),
    ctAnchor: r4(cnt('anchor', 'CT') / ct),
    ctRotate: r4(cnt('rotator', 'CT') / ct),
    entropy: r4(Math.min(1, entropy)),
  };
}

// Regras (documentadas em docs/realismo-fm-dados.md):
//   AWP     awper ≥ 40% dos rounds
//   Entry   entry_fragger ≥ 35% dos rounds de T
//   Lurker  lurker ≥ 35% dos rounds de T
//   Support anchor ≥ 45% dos rounds de CT e trader ≥ 35% dos rounds de T
//   Rifler  o resto
export function inferRole(s: RoleShares | null): { role: Role; why: string } | null {
  if (!s) return null;
  if (s.awp >= 0.4) return { role: 'AWP', why: `awper ${(s.awp * 100).toFixed(0)}% dos rounds` };
  if (s.tEntry >= 0.35) return { role: 'Entry', why: `entry ${(s.tEntry * 100).toFixed(0)}% dos rounds de T` };
  if (s.tLurk >= 0.35) return { role: 'Lurker', why: `lurker ${(s.tLurk * 100).toFixed(0)}% dos rounds de T` };
  if (s.ctAnchor >= 0.45 && s.tTrade >= 0.35) return { role: 'Support', why: `âncora ${(s.ctAnchor * 100).toFixed(0)}% CT e trader ${(s.tTrade * 100).toFixed(0)}% T` };
  return { role: 'Rifler', why: 'sem papel dominante' };
}

// Sem papéis por round (o bo3.gg não classifica jogos de divisões menores):
// infere pela estatística agregada. A API não separa abates por arma, então o
// sinal de AWP é a % de abates com headshot (AWPers ~36%, riflers ~55%, na
// população com papel conhecido): < 42% → AWP. Entry: ≥ 0,22 duelos de
// abertura por round (entries ~0,216, demais ~0,188).
export function inferRoleFromStats(s: { hsk: number; fkpr: number; fdpr: number; rounds: number } | null | undefined): { role: Role; why: string } | null {
  if (!s || s.rounds < 100) return null;
  if (s.hsk < 0.42) return { role: 'AWP', why: `sem papéis no bo3; ${(s.hsk * 100).toFixed(0)}% dos abates de HS (perfil de AWP)` };
  const open = s.fkpr + s.fdpr;
  if (open >= 0.22) return { role: 'Entry', why: `sem papéis no bo3; ${open.toFixed(3)} duelos de abertura por round` };
  return { role: 'Rifler', why: 'sem papéis no bo3; sem sinal de AWP/entry na estatística' };
}
