// Promos MENSAIS rotativas — a cada mês-calendário, 11 jogadores ganham versão
// special 'promo' (+2 OVR) num tema determinístico (seed = ano*12 + mês, mesmo
// padrão seeded das missões diárias). O tema cicla por região/país/role; o
// sorteio dentro do tema é seeded pelo mês → todo cliente instancia as MESMAS
// cartas. Puro: recebe o catálogo BASE e devolve SpecialSpec[] pro buildCatalog.
import { makeRng } from '../rng';
import type { SpecialSpec, UltCard } from './cards';

export const PROMO_BOOST = 2;   // +OVR da versão promo
export const PROMO_SIZE = 11;   // jogadores promovidos por mês
// mês de estreia das promos (julho/2026, 0-based) — antes disso não existe promo.
export const PROMO_EPOCH = 2026 * 12 + 6;

// índice absoluto do mês-calendário (ano*12 + mês 0-based) — a "seed" da promo.
export function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

// fim do mês (00:00 local do dia 1 do mês seguinte) — alimenta o countdown da Loja.
export function monthEndMs(mi: number): number {
  return new Date(Math.floor(mi / 12), (mi % 12) + 1, 1).getTime();
}

export interface PromoTheme {
  id: string;
  name: string;   // título curto do card na Loja ("Craques BR")
  desc: string;
  color: string;  // accent (hex) pro card da Loja
  filter: (c: UltCard) => boolean;
}

// temas em rotação (mês % length). Filtros por região/país/role — variados o
// bastante pra promo nunca repetir dois meses seguidos.
export const PROMO_THEMES: PromoTheme[] = [
  { id: 'br', name: 'Craques BR', desc: 'Os destaques do Brasil em versão promo', color: '#4ade80', filter: (c) => c.country === 'br' },
  { id: 'eu', name: 'Estrelas EU', desc: 'A elite europeia em versão promo', color: '#7aa2f7', filter: (c) => c.region === 'europe' },
  { id: 'awp', name: 'Snipers de Elite', desc: 'Os melhores AWPers do circuito', color: '#f0d878', filter: (c) => c.role === 'AWP' },
  { id: 'cis', name: 'Feras da CIS', desc: 'O poderio da CIS em versão promo', color: '#e58a8a', filter: (c) => c.region === 'cis' },
  { id: 'entry', name: 'Linha de Frente', desc: 'Os entry fraggers mais agressivos', color: '#fb923c', filter: (c) => c.role === 'Entry' },
  { id: 'americas', name: 'Força das Américas', desc: 'Os craques das Américas em versão promo', color: '#5ed88a', filter: (c) => c.region === 'samerica' || c.region === 'namerica' },
  { id: 'igl', name: 'Mentes Brilhantes', desc: 'Os cérebros táticos (IGLs) do circuito', color: '#c792ea', filter: (c) => c.role === 'IGL' },
];

export interface MonthlyPromo {
  monthIndex: number;
  theme: PromoTheme;
  playerIds: string[];   // os 11 promovidos do mês
  specs: SpecialSpec[];  // prontos pro buildCatalog (rarity 'promo', +PROMO_BOOST)
  endsAt: number;        // ms — quando o tema rotaciona
}

export function themeForMonth(mi: number): PromoTheme {
  return PROMO_THEMES[((mi % PROMO_THEMES.length) + PROMO_THEMES.length) % PROMO_THEMES.length];
}

// a promo de UM mês: filtra o catálogo BASE pelo tema, pega os ~2x melhores por
// OVR (desempate por playerId — estável) e sorteia 11 seeded pelo mês. Assim o
// mesmo tema, meses depois, promove um recorte DIFERENTE do topo.
export function promoForMonth(baseCatalog: UltCard[], mi: number): MonthlyPromo {
  const theme = themeForMonth(mi);
  const pool = baseCatalog
    .filter(theme.filter)
    .sort((a, b) => b.ovr - a.ovr || a.playerId.localeCompare(b.playerId))
    .slice(0, PROMO_SIZE * 2);
  const rng = makeRng(((mi * 2654435761) >>> 0) || 1);
  const chosen: UltCard[] = [];
  while (chosen.length < PROMO_SIZE && pool.length) {
    chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return {
    monthIndex: mi,
    theme,
    playerIds: chosen.map((c) => c.playerId),
    specs: chosen.map((c) => ({ playerId: c.playerId, rarity: 'promo' as const, ovrBoost: PROMO_BOOST })),
    endsAt: monthEndMs(mi),
  };
}

// specs de TODAS as promos da época até `mi` (inclusive), dedup por jogador —
// a chave `${playerId}:promo` é a mesma em qualquer mês (mesmo boost), então
// cartas promo tiradas em meses passados continuam resolvendo no catálogo.
export function promoSpecsThrough(baseCatalog: UltCard[], mi: number): SpecialSpec[] {
  const out: SpecialSpec[] = [];
  const seen = new Set<string>();
  for (let m = PROMO_EPOCH; m <= mi; m++) {
    for (const s of promoForMonth(baseCatalog, m).specs) {
      if (seen.has(s.playerId)) continue;
      seen.add(s.playerId);
      out.push(s);
    }
  }
  return out;
}
