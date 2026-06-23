// Roteador do modo Online (novo design): hub → ranked 1v1 | ranked major | gauntlet.
// Single-player vs IA. Ranking salvo (servidor) só pra conta paga; convidado/grátis
// joga casual e os pontos ficam só no navegador.
import { useCallback, useMemo, useState } from 'react';
import type { TeamSeason } from '../../types';
import type { Account } from '../../state/account';
import { getManager } from '../../state/manager';
import { Button } from '../ds';
import { OnlineHub, type OnlineModeId } from './OnlineHub';
import { OnlineGauntlet } from './OnlineGauntlet';
import { OnlineScreen } from '../OnlineScreen';
import { buildPool, loadStats, saveStats, type OnlineStats } from './onlineData';
import { ct } from '../../state/career-i18n';

export function OnlineMode({ onBack, account, dataset }: { onBack: () => void; account: Account | null; dataset: TeamSeason[] }) {
  const manager = getManager();
  const pool = useMemo(() => buildPool(dataset), [dataset]);
  const [screen, setScreen] = useState<'hub' | 'casual' | OnlineModeId>('hub');
  const [stats, setStatsRaw] = useState<OnlineStats>(loadStats);

  const setStats = useCallback((fn: (s: OnlineStats) => OnlineStats) => {
    setStatsRaw((prev) => { const next = fn(prev); saveStats(next); return next; });
  }, []);

  if (!manager) {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto 0', textAlign: 'center' }}>
        <p className="muted">{ct('Crie seu manager antes de jogar online.')}</p>
        <Button variant="primary" onClick={onBack} style={{ marginTop: 12 }}>← {ct('Voltar')}</Button>
      </div>
    );
  }

  const toHub = () => setScreen('hub');
  return (
    <div className="rtm-fade-in">
      {screen === 'hub' && <OnlineHub manager={manager} stats={stats} account={account} onPlay={(id) => setScreen(id)} onCasual={() => setScreen('casual')} onExit={onBack} />}
      {/* online REAL via lobby (api/lobby.ts): 1v1 = duelo, Major = grupo. Gauntlet é o único vs IA. */}
      {screen === '1v1' && <OnlineScreen preset="duel" forceRanked account={account} onBack={toHub} />}
      {screen === 'major' && <OnlineScreen preset="party" forceRanked account={account} onBack={toHub} />}
      {screen === 'gauntlet' && <OnlineGauntlet pool={pool} stats={stats} setStats={setStats} onHub={toHub} onExit={onBack} />}
      {screen === 'casual' && <OnlineScreen casualOnly account={account} onBack={toHub} />}
    </div>
  );
}
