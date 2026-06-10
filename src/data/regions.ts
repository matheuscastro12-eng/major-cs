// Detecção do "core" de nacionalidade de um elenco:
// 1) 3+ jogadores do mesmo país → bandeira do país
// 2) senão, 4+ jogadores da mesma região → bandeira da região
// 3) senão → internacional (sem bandeira específica)

export type RegionKey = 'europe' | 'cis' | 'samerica' | 'namerica' | 'asia' | 'oceania' | 'africa';

export const REGION_LABELS: Record<RegionKey, string> = {
  europe: 'Europa',
  cis: 'CIS',
  samerica: 'América do Sul',
  namerica: 'América do Norte',
  asia: 'Ásia',
  oceania: 'Oceania',
  africa: 'África',
};

const COUNTRY_REGION: Record<string, RegionKey> = {
  // Europa (inclui Ucrânia e Turquia/Israel pelo contexto competitivo de CS)
  se: 'europe', dk: 'europe', no: 'europe', fi: 'europe', pl: 'europe', fr: 'europe',
  be: 'europe', nl: 'europe', de: 'europe', gb: 'europe', es: 'europe', pt: 'europe',
  it: 'europe', ch: 'europe', at: 'europe', cz: 'europe', sk: 'europe', hu: 'europe',
  ro: 'europe', bg: 'europe', rs: 'europe', ba: 'europe', hr: 'europe', si: 'europe',
  mk: 'europe', me: 'europe', lt: 'europe', lv: 'europe', ee: 'europe', ie: 'europe',
  is: 'europe', xk: 'europe', ua: 'europe', tr: 'europe', il: 'europe', gr: 'europe',
  // CIS
  ru: 'cis', kz: 'cis', by: 'cis', am: 'cis', az: 'cis', ge: 'cis', uz: 'cis',
  kg: 'cis', tj: 'cis', tm: 'cis', md: 'cis',
  // América do Sul
  br: 'samerica', ar: 'samerica', cl: 'samerica', pe: 'samerica', co: 'samerica',
  uy: 'samerica', bo: 'samerica', py: 'samerica', ve: 'samerica', ec: 'samerica',
  // América do Norte
  us: 'namerica', ca: 'namerica', mx: 'namerica',
  // Ásia (inclui Oriente Médio)
  cn: 'asia', mn: 'asia', kr: 'asia', jp: 'asia', id: 'asia', th: 'asia', vn: 'asia',
  in: 'asia', ph: 'asia', my: 'asia', sg: 'asia', sa: 'asia', jo: 'asia', ae: 'asia',
  // Oceania
  au: 'oceania', nz: 'oceania',
  // África
  za: 'africa', ng: 'africa', eg: 'africa', ma: 'africa', tn: 'africa',
};

export function regionOf(cc: string): RegionKey | undefined {
  return COUNTRY_REGION[(cc || '').toLowerCase()];
}

export type CoreId =
  | { kind: 'country'; cc: string; count: number }
  | { kind: 'region'; region: RegionKey; count: number }
  | { kind: 'intl' };

export function coreIdentity(countries: string[]): CoreId {
  const byCountry = new Map<string, number>();
  for (const c of countries) {
    const cc = (c || '').toLowerCase();
    byCountry.set(cc, (byCountry.get(cc) ?? 0) + 1);
  }
  let topC = '';
  let topCn = 0;
  for (const [c, n] of byCountry) {
    if (n > topCn) {
      topCn = n;
      topC = c;
    }
  }
  if (topCn >= 3) return { kind: 'country', cc: topC, count: topCn };

  const byRegion = new Map<RegionKey, number>();
  for (const c of countries) {
    const r = regionOf(c);
    if (r) byRegion.set(r, (byRegion.get(r) ?? 0) + 1);
  }
  let topR: RegionKey | undefined;
  let topRn = 0;
  for (const [r, n] of byRegion) {
    if (n > topRn) {
      topRn = n;
      topR = r;
    }
  }
  if (topR && topRn >= 4) return { kind: 'region', region: topR, count: topRn };

  return { kind: 'intl' };
}
