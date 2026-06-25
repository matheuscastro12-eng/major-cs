import { ct } from './career-i18n';
import { formatMoney } from '../engine/ratings';
import type { Player } from '../types';
import { playerOrgId } from './career-player-route';

export type DashTask = {
  id: string;
  title: string;
  body: string;
  urgent?: boolean;
  time?: string;
};

type NewsItem = {
  id: string;
  split: number;
  tone: 'good' | 'bad' | 'info';
  title: string;
  body: string;
  cat?: string;
  handle?: string;
};

type PoachOffer = { orgName: string; nick: string; fee: number; ovr: number };

/** Mesma fonte da aba Tarefas (inbox): manchetes + alertas acionáveis. */
export function buildDashboardTasks(
  save: {
    news?: NewsItem[];
    fatigue?: Record<string, number>;
    pendingOffer?: PoachOffer | null;
  },
  squadPlayers: Player[],
  expiringCount: number,
): DashTask[] {
  const tasks: DashTask[] = [];
  const seen = new Set<string>();
  const add = (t: DashTask) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    tasks.push(t);
  };

  if (expiringCount > 0) {
    add({
      id: 'contracts',
      title: ct('Contratos vencendo'),
      body: `${expiringCount} ${ct('jogador(es) precisam renovar')}`,
      urgent: true,
    });
  }

  if (save.pendingOffer) {
    const off = save.pendingOffer;
    add({
      id: 'pending-offer',
      title: `${off.orgName} ${ct('sonda')} ${off.nick}`,
      body: `${ct('Proposta de')} ${formatMoney(off.fee)} ${ct('pelo seu')} ${off.nick} (OVR ${off.ovr})`,
      urgent: true,
    });
  }

  for (const p of squadPlayers) {
    const oid = playerOrgId(p.id);
    const fat = save.fatigue?.[oid] ?? save.fatigue?.[p.id] ?? 0;
    if (fat >= 75) {
      add({
        id: `fat-${oid}`,
        title: `${p.nick} ${ct('exausto')}`,
        body: ct('Reduza a carga ou invista em psicologia.'),
        urgent: true,
      });
    }
  }

  for (const n of save.news ?? []) {
    add({
      id: n.id,
      title: n.cat === 'social' ? (n.handle ? `${n.handle}` : n.title) : n.title,
      body: n.body,
      urgent: n.tone === 'bad',
      time: `Split ${n.split}`,
    });
  }

  return tasks.slice(0, 5);
}
