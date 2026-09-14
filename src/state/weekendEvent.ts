// [URG-2] EVENTO DE FIM DE SEMANA no cliente — uma leitura só pro Hub e pra Landing.
// Fonte preferida: o item de live-ops que o servidor mesclou (id `wknd-…`), que
// traz a carta exclusiva sorteada no snapshot do servidor (autoritativo). Sem
// rede/cache, cai no cálculo local (mesmo engine, catálogo vivo) — serve pra
// exibir; o resgate é sempre do servidor. Fora da janela devolve o PRÓXIMO
// evento com `open: false` pro contador "começa em".
import type { EventRule, EventWinTier } from '../engine/ultimate/events';
import { isWeekendEventId, nextWeekendEvent, weekendEventFor } from '../engine/ultimate/weekendEvent';
import type { UltCard } from '../engine/ultimate/cards';
import { liveopsSnapshot, scheduledEvents, type LiveopsItem } from './liveops';
import { ultimateCatalog, ultimateIndex } from './ultimate';

export interface WeekendEventView {
  id: string;
  name: string;
  desc: string;
  rule: EventRule;
  winTiers: EventWinTier[];
  maxMatches: number;
  cardAtWins: number;
  exclusiveCardKey: string | null;
  startsAtMs: number;
  endsAtMs: number;
  open: boolean;              // janela sex–dom aberta agora
  source: 'server' | 'local';
}

export function weekendEventView(now: number = Date.now(), items: LiveopsItem[] = liveopsSnapshot()): WeekendEventView {
  const fromServer = scheduledEvents(items).find((ev) => isWeekendEventId(ev.id));
  if (fromServer) {
    const p = fromServer.payload;
    const topWins = p.winTiers.reduce((m, t) => Math.max(m, t.wins), 0);
    return {
      id: fromServer.id, name: p.name, desc: p.desc, rule: p.rule, winTiers: p.winTiers, maxMatches: p.maxMatches,
      cardAtWins: p.cardAtWins ?? topWins, exclusiveCardKey: p.exclusiveCardKey ?? null,
      startsAtMs: Date.parse(fromServer.startsAt), endsAtMs: Date.parse(fromServer.endsAt), open: true, source: 'server',
    };
  }
  const cands = ultimateCatalog();
  const cur = weekendEventFor(now, cands);
  const ev = cur ?? nextWeekendEvent(now, cands);
  return {
    id: ev.id, name: ev.name, desc: ev.desc, rule: ev.rule, winTiers: ev.winTiers, maxMatches: ev.maxMatches,
    cardAtWins: ev.cardAtWins, exclusiveCardKey: ev.exclusiveCardKey,
    startsAtMs: ev.startsAt, endsAtMs: ev.endsAt, open: cur !== null, source: 'local',
  };
}

// a carta exclusiva resolvida no catálogo (null se a key não existe neste build)
export function weekendExclusiveCard(view: Pick<WeekendEventView, 'exclusiveCardKey'>): UltCard | null {
  return view.exclusiveCardKey ? ultimateIndex().get(view.exclusiveCardKey) ?? null : null;
}
