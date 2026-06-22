// Roteador do modo Online (novo design): hub → ranked 1v1 | ranked major | gauntlet.
// Single-player vs IA. Ranking salvo (servidor) só pra conta paga; convidado/grátis
// joga casual e os pontos ficam só no navegador.
import { useCallback, useMemo, useState } from 'react';
import type { TeamSeason } from '../../types';
import type { Account } from '../../state/account';
import { getManager } from '../../state/manager';
import { reportResult } from '../../state/ranking';
import { Button } from '../ds';
import { OnlineHub, type OnlineModeId } from './OnlineHub';
import { Ranked1v1 } from './Ranked1v1';
import { OnlineMajor } from './OnlineMajor';
import { OnlineGauntlet } from './OnlineGauntlet';
import { OnlineScreen } from '../OnlineScreen';
import { buildPool, loadStats, saveStats, type OnlineStats } from './onlineData';

export function OnlineMode({ onBack, account, dataset }: { onBack: () => void; account: Account | null; dataset: TeamSeason[] }) {
  const manager = getManager();
  const pool = useMemo(() => buildPool(dataset), [dataset]);
  const [screen, setScreen] = useState<'hub' | 'casual' | OnlineModeId>('hub');
  const [stats, setStatsRaw] = useState<OnlineStats>(loadStats);

  const setStats = useCallback((fn: (s: OnlineStats) => OnlineStats) => {
    setStatsRaw((prev) => { const next = fn(prev); saveStats(next); return next; });
  }, []);

  // conta paga: o MMR da ranqueada 1v1 também entra no ranking SALVO do servidor.
  const onReport = useCallback((won: boolean) => {
    if (account?.paid) void reportResult(won, account.nick);
  }, [account]);

  if (!manager) {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto 0', textAlign: 'center' }}>
        <p className="muted">Crie seu manager antes de jogar online.</p>
        <Button variant="primary" onClick={onBack} style={{ marginTop: 12 }}>← Voltar</Button>
      </div>
    );
  }

  const toHub = () => setScreen('hub');
  return (
    <div className="rtm-fade-in">
      {screen === 'hub' && <OnlineHub manager={manager} stats={stats} account={account} onPlay={(id) => setScreen(id)} onCasual={() => setScreen('casual')} onExit={onBack} />}
      {screen === '1v1' && <Ranked1v1 manager={manager} pool={pool} stats={stats} setStats={setStats} onReport={onReport} onHub={toHub} onExit={onBack} />}
      {screen === 'major' && <OnlineMajor manager={manager} pool={pool} stats={stats} setStats={setStats} onHub={toHub} onExit={onBack} />}
      {screen === 'gauntlet' && <OnlineGauntlet pool={pool} stats={stats} setStats={setStats} onHub={toHub} onExit={onBack} />}
      {screen === 'casual' && <OnlineScreen casualOnly account={account} onBack={toHub} />}
    </div>
  );
}
