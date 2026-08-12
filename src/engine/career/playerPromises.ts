// PROMESSAS A JOGADORES (#10 do gap Brasval — a metade que faltava). Puro.
//
// As promessas à DIRETORIA já existem (promises.ts). Esta é a outra ponta: o
// que VOCÊ promete ao JOGADOR nas conversas 1-a-1 — e a cobrança quando o
// prazo estoura. Prometer é grátis na hora (moral sobe, esperança); cumprir
// paga bond+moral; quebrar cobra MAIS caro do que nunca ter prometido
// (+10/+12 vs −15/−18, padrão Brasval).
//
// Tipos de promessa (mapeados aos NOSSOS sistemas):
//   extension — "vou renovar seu contrato" → cumpre se o contrato foi estendido
//   signing   — "vou trazer reforço"       → cumpre se entrou jogador novo no elenco
//   workload  — "vou aliviar sua carga"    → cumpre se a fadiga caiu pra <40

export type PlayerPromiseKind = 'extension' | 'signing' | 'workload';

export interface PlayerPromise {
  kind: PlayerPromiseKind;
  madeAtSplit: number;
  deadlineSplit: number;          // inclusive: julgada no fechamento deste split
  // snapshots pra detectar cumprimento de verdade
  contractUntilAt?: number | null; // extension: fim de contrato no momento da promessa
  squadIdsAt?: string[];           // signing: elenco no momento da promessa
  status: 'open' | 'kept' | 'broken';
}

export const PROMISE_DEADLINE_SPLITS = 2;   // prazo padrão: até 2 splits

export const PLAYER_PROMISE_LABEL: Record<PlayerPromiseKind, string> = {
  extension: 'Prometo renovar seu contrato',
  signing: 'Prometo trazer reforço pro time',
  workload: 'Prometo aliviar sua carga de jogo',
};

// efeitos (moral, vínculo)
export const PROMISE_KEPT = { morale: 10, bond: 12 };
export const PROMISE_BROKEN = { morale: -15, bond: -18 };
export const PROMISE_MADE = { morale: 6, bond: 3 };   // a esperança conta na hora

export interface PromiseJudgeCtx {
  split: number;                         // split que está FECHANDO
  contractUntil: (pid: string) => number | null;
  squadIds: string[];
  fatigue: (pid: string) => number;
}

export interface PromiseOutcomeHit { playerId: string; kind: PlayerPromiseKind; kept: boolean }

function isFulfilled(pid: string, p: PlayerPromise, ctx: PromiseJudgeCtx): boolean {
  switch (p.kind) {
    case 'extension': {
      const now = ctx.contractUntil(pid);
      // contrato termina DEPOIS do que terminava quando você prometeu = renovou
      return now != null && (p.contractUntilAt == null || now > p.contractUntilAt);
    }
    case 'signing': {
      const before = new Set(p.squadIdsAt ?? []);
      return ctx.squadIds.some((id) => !before.has(id));
    }
    case 'workload':
      return ctx.fatigue(pid) < 40;
  }
}

// Julga as promessas no fechamento do split. Cumprimento ANTECIPADO conta
// (avaliado todo fechamento, não só no prazo); quebra só no prazo estourado.
export function judgePlayerPromises(
  promises: Record<string, PlayerPromise[]> | undefined,
  ctx: PromiseJudgeCtx,
): { promises: Record<string, PlayerPromise[]>; outcomes: PromiseOutcomeHit[] } {
  const out: Record<string, PlayerPromise[]> = {};
  const outcomes: PromiseOutcomeHit[] = [];
  for (const [pid, list] of Object.entries(promises ?? {})) {
    const next: PlayerPromise[] = [];
    for (const p of list) {
      if (p.status !== 'open') { next.push(p); continue; }
      if (isFulfilled(pid, p, ctx)) {
        next.push({ ...p, status: 'kept' });
        outcomes.push({ playerId: pid, kind: p.kind, kept: true });
      } else if (ctx.split >= p.deadlineSplit) {
        next.push({ ...p, status: 'broken' });
        outcomes.push({ playerId: pid, kind: p.kind, kept: false });
      } else {
        next.push(p);   // ainda no prazo
      }
    }
    if (next.length) out[pid] = next;
  }
  return { promises: out, outcomes };
}

// promessa aberta de um tipo já existe? (não deixa empilhar a mesma promessa)
export function hasOpenPromise(promises: Record<string, PlayerPromise[]> | undefined, pid: string, kind: PlayerPromiseKind): boolean {
  return (promises?.[pid] ?? []).some((p) => p.status === 'open' && p.kind === kind);
}
