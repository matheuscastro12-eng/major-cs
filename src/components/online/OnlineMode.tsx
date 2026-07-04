// Roteador do modo Online (novo design): hub → ranked 1v1 | ranked major | gauntlet.
// Single-player vs IA. Ranking salvo (servidor) só pra conta paga; convidado/grátis
// joga casual e os pontos ficam só no navegador.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamSeason } from '../../types';
import type { Account } from '../../state/account';
import { getManager } from '../../state/manager';
import { setCloudEnabled } from '../../state/cloud';
import { syncOnlineStatsFromCloud } from '../../state/onlineStats';
import { Button } from '../ds';
import { OnlineHub, type OnlineModeId } from './OnlineHub';
import { OnlineGauntlet } from './OnlineGauntlet';
import { OnlineScreen } from '../OnlineScreen';
import { buildPool, loadStats, saveStats, DEFAULT_STATS, type OnlineStats } from './onlineData';
import { ct } from '../../state/career-i18n';

export function OnlineMode({ onBack, account, dataset }: { onBack: () => void; account: Account | null; dataset: TeamSeason[] }) {
  const manager = getManager();
  const pool = useMemo(() => buildPool(dataset), [dataset]);
  // F5 numa sala: a URL é /online/<código>. Recupera o código e cai direto numa
  // tela de reconexão (OnlineScreen genérico) que re-entra na sala — sem isso o
  // código era descartado e o jogador "perdia" a sala ao atualizar a página.
  const initialRoom = useMemo(() => {
    try { const m = /^\/online\/([a-z0-9]{4,6})$/i.exec(window.location.pathname); return m ? m[1].toUpperCase() : ''; } catch { return ''; }
  }, []);
  const [screen, setScreen] = useState<'hub' | 'casual' | 'rejoin' | OnlineModeId>(initialRoom ? 'rejoin' : 'hub');
  const [stats, setStatsRaw] = useState<OnlineStats>(loadStats);

  const setStats = useCallback((fn: (s: OnlineStats) => OnlineStats) => {
    setStatsRaw((prev) => { const next = fn(prev); saveStats(next); return next; });
  }, []);

  // cloud: reconcilia o perfil (MMR/pontos/histórico) com a nuvem assim que a
  // conta carrega — restaura de outro aparelho ou re-sobe o local mais novo,
  // igual ao boot do Ultimate/RtP. Grátis/deslogado: no-op, perfil só local.
  useEffect(() => {
    if (!account) return;
    // garante o gate da nuvem ANTES do sync (o setCloudEnabled do App vive num
    // effect do pai, que roda DEPOIS deste — mesma armadilha do Ultimate).
    setCloudEnabled(!!account.paid);
    let on = true;
    void syncOnlineStatsFromCloud().then((r) => {
      if (!on) return;
      if (r === 'restored') setStatsRaw(loadStats());
      if (r === 'deleted') setStatsRaw({ ...DEFAULT_STATS });
    }).catch(() => { /* offline — segue com o local */ });
    return () => { on = false; };
  }, [account]);

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
      {/* reconexão após F5: entra na sala do código da URL (mode lido do servidor) */}
      {screen === 'rejoin' && <OnlineScreen initialCode={initialRoom} account={account} onBack={toHub} />}
      {screen === 'hub' && <OnlineHub manager={manager} stats={stats} account={account} onPlay={(id) => setScreen(id)} onCasual={() => setScreen('casual')} onExit={onBack} />}
      {/* online REAL via lobby (api/lobby.ts): 1v1 = duelo, Major = grupo. Gauntlet é o único vs IA. */}
      {screen === '1v1' && <OnlineScreen preset="duel" forceRanked account={account} onBack={toHub} />}
      {screen === 'major' && <OnlineScreen preset="party" forceRanked account={account} onBack={toHub} />}
      {screen === 'gauntlet' && <OnlineGauntlet pool={pool} stats={stats} setStats={setStats} onHub={toHub} onExit={onBack} />}
      {screen === 'casual' && <OnlineScreen casualOnly account={account} onBack={toHub} />}
    </div>
  );
}
