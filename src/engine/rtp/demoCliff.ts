// [W1] CLIFFHANGER DA DEMO — o gancho de conversão do Road to Pro.
//
// A demo grátis joga a peneira + DEMO_WEEKS semanas. Na ÚLTIMA semana jogável
// chega, SEMPRE, uma proposta de um clube de tier acima (o melhor clube
// plausível da região) — determinística pelo SEED do save, nunca pelo relógio.
// Na demo a proposta é só VISÍVEL (clube, salário, função); aceitar/negociar e
// a virada da semana ficam atrás da vitalícia. Quem compra vê a MESMA proposta
// na mesa (pendingOffers) na virada pra semana DEMO_WEEKS + 1.
//
// O prazo (48h) é de relógio de parede e é gravado pela UI na hora em que a
// trava abre (openedAt/expiresAt no save) — este módulo recebe `now` como
// parâmetro pra continuar puro (sem Date.now()).
//
// NADA aqui roda pro jogador pago: ensureDemoCliff só é chamado com demo=true;
// deliver/expire só agem em saves que já têm `demoCliff` (criado na demo).

import { makeRng } from '../rng';
import { tierUp } from './league';
import { divisionPool } from './world';
import { buildOffer } from './transfers';
import type { RoadToProSave, DemoCliff, TransferOffer } from './types';

export const DEMO_WEEKS = 3;                       // semanas jogáveis na demo (a trava fecha na 4ª)
export const CLIFF_TTL_MS = 48 * 60 * 60 * 1000;   // a proposta expira 48h depois da trava abrir

// Sal fixo: o cliffhanger é uma função do seed do save (o mesmo save gera a
// mesma proposta em qualquer aparelho/rebuild), independente do tick de ações.
const CLIFF_SALT = 0xc11ff;

// A proposta forçada: clube de tier acima da região, entre os 3 mais fortes
// com elenco completo (o "melhor clube plausível"), escolhido pelo seed.
// null só quando não existe pool (dataset sem times acima — não acontece
// com o mundo real, mas o chamador trata).
export function buildDemoCliffOffer(save: RoadToProSave): TransferOffer | null {
  const cur = save.team.tier;
  const up = tierUp(cur);
  const tier = up === cur ? cur : up;
  const rng = makeRng((save.rng.seed ^ CLIFF_SALT) >>> 0);
  const pool = divisionPool(save.world.region, tier, save.world.season, 14)
    .filter((t) => t.id !== save.team.realTeamId && (t.players?.length ?? 0) >= 5)
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  if (pool.length === 0) return null;
  const top = pool.slice(0, 3);
  const team = top[Math.floor(rng() * top.length)];
  const note = cur === 'academy'
    ? 'Viram a peneira e as primeiras semanas. Querem te levar pro profissional AGORA.'
    : 'Acompanham desde a estreia e querem te dar o salto pra um time maior.';
  // id SEM o tick de ações (o buildOffer usa o tick no sufixo): o mesmo save
  // gera o mesmo id em qualquer momento — é o que deixa a entrega idempotente.
  return { ...buildOffer(save, team, tier, rng, { note }), id: `offer-cliff-${team.id}-${save.world.season}` };
}

// Materializa o cliffhanger no save (idempotente). Só a DEMO chama; o save já
// na semana DEMO_WEEKS (ou além, pra save que chegou lá antes desta versão).
export function ensureDemoCliff(save: RoadToProSave): RoadToProSave {
  if (save.demoCliff) return save;
  if (save.world.week < DEMO_WEEKS) return save;
  const offer = buildDemoCliffOffer(save);
  if (!offer) return save;
  const cliff: DemoCliff = { offer, week: DEMO_WEEKS, status: 'teaser' };
  return { ...save, demoCliff: cliff };
}

// A trava abriu com a proposta na tela: começa o relógio de 48h (1x). Idempotente.
export function openDemoCliff(save: RoadToProSave, now: number): RoadToProSave {
  const c = save.demoCliff;
  if (!c || c.status === 'expired' || c.openedAt) return save;
  return { ...save, demoCliff: { ...c, openedAt: now, expiresAt: now + CLIFF_TTL_MS } };
}

export function isDemoCliffExpired(cliff: DemoCliff | undefined, now: number): boolean {
  if (!cliff) return false;
  if (cliff.status === 'expired') return true;
  return typeof cliff.expiresAt === 'number' && now >= cliff.expiresAt;
}

// Virada pra depois da demo: a proposta vai pra MESA (pendingOffers) — é o que
// o jogador que comprou vê. Não entrega se expirou, se já entregou, ou se a
// semana ainda é a da demo. No-op total pra save sem cliffhanger (jogo pago).
export function deliverDemoCliff(save: RoadToProSave, now: number): RoadToProSave {
  const c = save.demoCliff;
  if (!c || c.status !== 'teaser') return save;
  if (save.world.week <= c.week) return save;
  if (isDemoCliffExpired(c, now)) return expireDemoCliff(save);
  const pending = save.world.pendingOffers ?? [];
  const already = pending.some((o) => o.id === c.offer.id);
  return {
    ...save,
    world: { ...save.world, pendingOffers: already ? pending : [c.offer, ...pending] },
    demoCliff: { ...c, status: 'delivered' },
  };
}

// Prazo vencido: a proposta some da mesa e a trava volta ao texto normal.
export function expireDemoCliff(save: RoadToProSave): RoadToProSave {
  const c = save.demoCliff;
  if (!c || c.status === 'expired') return save;
  const pending = (save.world.pendingOffers ?? []).filter((o) => o.id !== c.offer.id);
  return { ...save, world: { ...save.world, pendingOffers: pending }, demoCliff: { ...c, status: 'expired' } };
}

// Cliffhanger "vivo" (visível na demo / válido pra quem comprou)?
export function activeDemoCliff(save: RoadToProSave, now: number): DemoCliff | null {
  const c = save.demoCliff;
  if (!c || isDemoCliffExpired(c, now)) return null;
  return c;
}

// Tempo restante legível ("47h 12min", "38min", "expirou").
export function cliffCountdown(cliff: DemoCliff, now: number): string {
  if (typeof cliff.expiresAt !== 'number') return '48h';
  const left = cliff.expiresAt - now;
  if (left <= 0) return 'expirou';
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${Math.max(1, m)}min`;
}
