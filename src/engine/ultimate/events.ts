// [U12] EVENTOS COM ELENCOS VARIADOS — regras puras de elegibilidade.
// A configuração do evento é um item de live-ops (kind 'event', versionado por
// `version` no payload) com janela em UTC. A regra é validada NO SERVIDOR ao
// enviar o squad (pick) e localmente para orientar o jogador antes de entrar.
// Cosmético/economia não entram aqui: só "esse squad pode jogar este evento?".
export type EventRule =
  | { kind: 'ovrcap'; max: number }                  // todas as cartas com OVR ≤ max
  | { kind: 'region'; region: string }               // todas da mesma região (ex.: 'samerica')
  | { kind: 'country'; country: string }             // todas do mesmo país (ex.: 'br')
  | { kind: 'roles'; roles: string[] }               // squad precisa conter TODAS estas funções
  | { kind: 'rarity-max'; maxTier: number };         // nenhuma carta acima do tier (1..10)
export const EVENT_RULE_KINDS = ['ovrcap', 'region', 'country', 'roles', 'rarity-max'] as const;

export interface EventCardLike { pid: string; ovr: number; region?: string; country?: string; role?: string; tier?: number }
export interface EventEligibility { ok: boolean; reason: string | null }

export function eventEligibility(cards: EventCardLike[], rule: EventRule): EventEligibility {
  if (cards.length !== 5) return { ok: false, reason: 'Squad precisa ter 5 cartas.' };
  switch (rule.kind) {
    case 'ovrcap': {
      const bad = cards.filter((c) => c.ovr > rule.max);
      return bad.length ? { ok: false, reason: `${bad.length} carta(s) acima de ${rule.max} OVR.` } : { ok: true, reason: null };
    }
    case 'region': {
      const bad = cards.filter((c) => (c.region ?? '') !== rule.region);
      return bad.length ? { ok: false, reason: `${bad.length} carta(s) fora da região ${rule.region}.` } : { ok: true, reason: null };
    }
    case 'country': {
      const bad = cards.filter((c) => (c.country ?? '') !== rule.country);
      return bad.length ? { ok: false, reason: `${bad.length} carta(s) fora do país ${rule.country.toUpperCase()}.` } : { ok: true, reason: null };
    }
    case 'roles': {
      const have = new Set(cards.map((c) => c.role ?? ''));
      const missing = rule.roles.filter((r) => !have.has(r));
      return missing.length ? { ok: false, reason: `Faltam as funções: ${missing.join(', ')}.` } : { ok: true, reason: null };
    }
    case 'rarity-max': {
      const bad = cards.filter((c) => (c.tier ?? 0) > rule.maxTier);
      return bad.length ? { ok: false, reason: `${bad.length} carta(s) com raridade acima do permitido.` } : { ok: true, reason: null };
    }
  }
}

export function describeRule(rule: EventRule): string {
  switch (rule.kind) {
    case 'ovrcap': return `Teto de ${rule.max} OVR por carta`;
    case 'region': return `Só cartas da região ${rule.region}`;
    case 'country': return `Só cartas de ${rule.country.toUpperCase()}`;
    case 'roles': return `Precisa ter: ${rule.roles.join(', ')}`;
    case 'rarity-max': return `Raridade até o tier ${rule.maxTier}`;
  }
}

// Prêmio por vitórias no evento — faixas crescentes, a MAIOR alcançada paga (padrão do
// Major da Semana). Valores vêm do payload (orçamento definido no live-ops), nunca daqui.
export interface EventWinTier { wins: number; credits: number }
export function eventRewardFor(wins: number, tiers: EventWinTier[]): number {
  let best = 0;
  for (const t of tiers) if (wins >= t.wins && t.credits > best) best = t.credits;
  return best;
}
