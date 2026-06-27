// Patrocinadores — T3.5 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Mantém compatibilidade com o sistema legacy que vivia inline no CareerScreen
// (interface `Sponsor` com `perSplit`/`minVrs`/`term`). Saves antigos com ids
// como 'logitech', 'hyperx' etc. continuam funcionando idênticos.
//
// O QUE É NOVO neste arquivo (vs CareerScreen.tsx inline):
//   - Catálogo movido pra cá (separa data de UI)
//   - `sponsorById` exportado pro engine novo (src/engine/sponsors.ts)
//   - Helpers de leitura (label de tier, listagem por elegibilidade)
//
// A engine NOVA (sponsors.ts) traz sistema de OFERTAS DINÂMICAS, cooldown e
// bônus por placement — features que NÃO existiam no legacy. Income por
// split continua sendo calculado pelo `sponsorIncome` legacy + multiplicador
// de prestígio (`effSponsorIncome` no CareerScreen).

export interface Sponsor {
  id: string;
  name: string;
  /** Receita paga UMA VEZ por split. Aplicada no fim de cada split no budget. */
  perSplit: number;
  /** VRS mínimo do clube pra liberar o contrato. 0 = qualquer um aceita. */
  minVrs: number;
  /** Cor accent (chip / UI) */
  color: string;
  /** Duração mínima do contrato em splits. */
  term: number;
}

// Catálogo legacy — IDÊNTICO ao que estava em CareerScreen.tsx:330. Preserva
// os ids ('logitech', 'hyperx', etc.) que estão em saves existentes.
export const SPONSORS: Sponsor[] = [
  { id: 'logitech',  name: 'Logitech G',     perSplit: 200_000, minVrs: 0,    color: '#00b8fc', term: 2 },
  { id: 'hyperx',    name: 'HyperX',         perSplit: 280_000, minVrs: 0,    color: '#e21b22', term: 2 },
  { id: 'razer',     name: 'Razer',          perSplit: 320_000, minVrs: 220,  color: '#44d62c', term: 2 },
  { id: 'secretlab', name: 'Secretlab',      perSplit: 360_000, minVrs: 320,  color: '#d9a441', term: 3 },
  { id: 'monster',   name: 'Monster Energy', perSplit: 400_000, minVrs: 460,  color: '#7ed957', term: 3 },
  { id: 'intel',     name: 'Intel',          perSplit: 520_000, minVrs: 700,  color: '#0071c5', term: 3 },
  { id: 'redbull',   name: 'Red Bull',       perSplit: 650_000, minVrs: 1000, color: '#cc0033', term: 4 },
  { id: 'samsung',   name: 'Samsung',        perSplit: 800_000, minVrs: 1400, color: '#1428a0', term: 4 },
];

/** Máximo de sponsors ativos simultaneamente. Espelha SPONSOR_SLOTS legacy. */
export const SPONSOR_SLOTS = 3;

// Lookup
const BY_ID = new Map(SPONSORS.map((s) => [s.id, s]));

export function sponsorById(id: string): Sponsor | undefined {
  return BY_ID.get(id);
}

/** Receita por split somando todos os sponsors ativos. Espelha sponsorIncome legacy. */
export function sponsorIncome(ids: string[]): number {
  return ids.reduce((acc, id) => acc + (BY_ID.get(id)?.perSplit ?? 0), 0);
}

/** Sponsors elegíveis pra um clube dado o VRS atual.
 *  Critério: vrs >= minVrs. Não considera slots cheios — quem checa é o engine. */
export function eligibleSponsors(vrs: number): Sponsor[] {
  return SPONSORS.filter((s) => vrs >= s.minVrs);
}

/** Bônus de placement por sponsor — usado pelo engine novo (T3.5).
 *  Derivado do perSplit pra não exigir mudar o catálogo. Calibrado pra que
 *  ganhar um Major com 3 sponsors top ~ +$3-5M extras (relevante mas não
 *  zerando a balanceamento do prize). */
export type PlacementKind = 'major' | 'title' | 'top4' | 'top8';
export function sponsorPlacementBonus(sponsor: Sponsor, placement: PlacementKind): number {
  const base = sponsor.perSplit;
  switch (placement) {
    case 'major': return Math.round(base * 2.0);   // ganhar Major dobra a fatura do split
    case 'title': return Math.round(base * 0.6);   // outros títulos
    case 'top4':  return Math.round(base * 0.25);
    case 'top8':  return Math.round(base * 0.08);
  }
}
