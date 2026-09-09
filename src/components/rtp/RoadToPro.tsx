import { useEffect, useState } from 'react';
import { RTPCreate } from './RTPCreate';
import { RTPHub } from './RTPHub';
import { RTPMatch } from './RTPMatch';
import { RTPMajor } from './RTPMajor';
import { RTPTransfer } from './RTPTransfer';
import { confirm as confirmDialog } from '../ConfirmDialog';
import { ct } from '../../state/career-i18n';
import { loadRtp, saveRtp, deleteRtp, syncRtpFromCloud } from '../../state/rtpSaves';
import { useAccount } from '../../state/account';
import { setCloudEnabled } from '../../state/cloud';
import { type ProMatchResult, type MatchConsequence } from '../../engine/rtp/matchSim';
import { RtpSimResult } from './RtpSimResult';
import { autoSimCircuitRound, type EventEnd } from '../../engine/rtp/circuit';
import { autoSimMajorRound, dismissMajor } from '../../engine/rtp/major';
import { TIER_NAME, type SeasonEndResult } from '../../engine/rtp/league';
import { applyLifeChoice } from '../../engine/rtp/lifeEvents';
import { acceptOffer, negotiateOffer, declineOffers } from '../../engine/rtp/transfers';
import { RtpLegacy } from './RtpLegacy';
import { RtpDailySeries } from './RtpDailySeries';
import { RtpDemoGate, DEMO_WEEKS } from './RtpDemoGate';
import { RtpDemoCliffBanner } from './RtpDemoCliff';
import { ensureDemoCliff, deliverDemoCliff } from '../../engine/rtp/demoCliff';
import { trackRtpDemo } from '../../state/track';
import { makeRng } from '../../engine/rng';
import type { RoadToProSave } from '../../engine/rtp/types';

export interface RtpNotice { kind: 'season' | 'autosim'; text: string; }

// RTP v13 — prêmio individual (MVP/EVP) + pulo no ranking mundial, anexado às
// notícias de fim de campeonato/temporada.
function accoladeClause(award?: 'mvp' | 'evp' | null, worldRank?: number, worldRankDelta?: number): string {
  let out = '';
  if (award) out += ` 🏅 ${ct('Você foi')} ${award.toUpperCase()} ${ct('do campeonato!')}`;
  if (typeof worldRank === 'number') {
    const climb = worldRankDelta && worldRankDelta > 0 ? ` (${ct('subiu')} ${worldRankDelta})` : '';
    out += ` ${ct('Ranking mundial')}: #${worldRank}${climb}.`;
  }
  return out;
}

function seasonMessage(ev: SeasonEndResult): string {
  const acc = accoladeClause(ev.award, ev.worldRank, ev.worldRankDelta);
  if (ev.sacked && ev.newTeamName) {
    return `${ct('Temporada encerrada —')} ${ev.placement}º ${ct('lugar')}.${acc} ⚠️ ${ct('A diretoria te DISPENSOU. Você assinou com')} ${ev.newTeamName} ${ct('pra se reerguer.')}`;
  }
  if (ev.champion) return `${ct('CAMPEÃO ELITE! Você é o melhor do mundo.')}${acc}`;
  if (ev.promoted) return `${ct('Promovido para')} ${TIER_NAME[ev.newTier]}! (${ct('terminou em')} ${ev.placement}º)${acc}`;
  if (ev.relegated) return `${ct('Rebaixado para')} ${TIER_NAME[ev.newTier]} (${ct('terminou em')} ${ev.placement}º)${acc}`;
  return `${ct('Temporada encerrada —')} ${ev.placement}º ${ct('lugar')}.${acc}`;
}

function eventMessage(ev: EventEnd): string {
  const head = ev.won ? `🏆 ${ct('CAMPEÃO do')} ${ev.name}!` : `${ct('Fim do')} ${ev.name} — ${ev.place}º ${ct('lugar')}.`;
  const board = ev.objLabel != null
    ? ` ${ct('Meta da diretoria')} (${ev.objLabel}): ${ev.objMet ? ct('cumprida ✓') : ct('não cumprida ✕')}${typeof ev.conf === 'number' ? ` · ${ct('confiança')} ${ev.conf}` : ''}.`
    : '';
  const acc = accoladeClause(ev.award, ev.worldRank, ev.worldRankDelta);
  // Você foi CORTADO: a diretoria perdeu a paciência e um clube menor te recolheu.
  if (ev.sacked && ev.newTeamName) {
    return `${head}${board}${acc} ⚠️ ${ct('A diretoria te DISPENSOU. Você assinou com')} ${ev.newTeamName} ${ct('pra se reerguer.')}`;
  }
  return `${head}${board}${acc} ${ct('Próximo campeonato:')} ${ev.nextName}.`;
}

// Entrada única do modo Road to Pro. Decide entre criação e hub conforme exista
// (ou não) um save. App.tsx só precisa montar este componente numa screen.
// `demo`: modo DEGUSTAÇÃO (conta grátis/deslogado) — peneira + DEMO_WEEKS
// semanas jogáveis; depois a RtpDemoGate trava com o CTA da vitalícia. O save
// é o mesmo formato do completo: comprou → continua daqui (e sobe pra nuvem).
export function RoadToPro({ onExit, demo = false, onUpgrade }: { onExit: () => void; demo?: boolean; onUpgrade?: () => void }) {
  // [W1] save da demo carregado já na última semana grátis (ou além) sem o
  // cliffhanger — chegou lá antes desta versão ou recarregou a página:
  // materializa (e entrega, se a semana já virou) na hora de carregar.
  const bootDemo = (s: RoadToProSave | null): RoadToProSave | null => {
    if (!demo || !s || s.retired || s.demoCliff || s.world.week < DEMO_WEEKS) return s;
    const next = deliverDemoCliff(ensureDemoCliff(s), Date.now());
    if (next !== s) saveRtp(next);
    return next;
  };
  const [save, setSave] = useState<RoadToProSave | null>(() => bootDemo(loadRtp()));
  const [booted, setBooted] = useState(false);
  const [playing, setPlaying] = useState(false);   // hub vs partida (liga)
  const [playingMajor, setPlayingMajor] = useState(false);   // partida do Major
  const [dailyOpen, setDailyOpen] = useState(false);         // SÉRIE DO DIA (desafio global)
  const [notice, setNotice] = useState<RtpNotice | null>(null);
  // Resultado do SIMULAR (modal com placar + stats — não só uma notificação).
  const [simResult, setSimResult] = useState<{ result: ProMatchResult; consequence: MatchConsequence } | null>(null);
  // localStorage recusou a última gravação (quota cheia): avisa em vez de perder
  // a sessão em silêncio.
  const [saveError, setSaveError] = useState(false);

  // Boot: reconcilia com a nuvem (restaura de outro aparelho, re-sobe o local
  // mais novo ou aplica tombstone de exclusão) — não só quando o local está vazio.
  //
  // CRÍTICO (mesmo fix do Ultimate): liga o gate da nuvem AQUI, antes do sync.
  // O setCloudEnabled do App vive num effect do PAI, que roda DEPOIS do effect
  // deste filho — sem isto o sync rodava com cloudEnabled()=false, devolvia
  // 'none' e o RtP começava DO ZERO em outro aparelho (e o save fresco ainda
  // podia sobrescrever a nuvem no próximo push). Espera a conta carregar
  // (deps [account]) em vez de rodar uma única vez às cegas.
  const { account } = useAccount();
  useEffect(() => {
    if (!account) { setBooted(true); return; } // deslogado: local puro (a rota já é gated)
    setCloudEnabled(!!account.paid);
    let alive = true;
    (async () => {
      const r = await syncRtpFromCloud().catch(() => 'none' as const);
      if (alive && r === 'restored') {
        setSave(bootDemo(loadRtp()));
        setNotice({ kind: 'autosim', text: `☁ ${ct('Save do Road to Pro restaurado da nuvem.')}` });
      }
      if (alive && r === 'deleted') setSave(null);
      if (alive) setBooted(true);
    })();
    return () => { alive = false; };
  }, [account]);

  // FUNIL DA DEMO — 'open' é o DENOMINADOR que faltava: quantos de fato entraram
  // na degustação. Até aqui só a trava emitia evento, então dava pra contar quem
  // BATIA nela sem saber de quantos. Roda 1x por sessão (dedupe no track).
  useEffect(() => { if (demo) trackRtpDemo('open'); }, [demo]);

  const handleCreated = (next: RoadToProSave) => {
    setSaveError(!saveRtp(next));
    setSave(loadRtp()); // recarrega já estampado (createdAt/_v)
    if (demo) trackRtpDemo('created'); // passou a peneira — o gargalo mais provável
  };

  // Atualização in-game (treino, ações, virada de semana): persiste e re-renderiza.
  const handleUpdate = (next: RoadToProSave) => {
    const weekTurned = next.world.week !== save?.world.week;
    // [W1] CLIFFHANGER: na virada pra última semana grátis a proposta do clube
    // maior nasce (só na demo); na virada seguinte ela vai pra mesa — é o que o
    // save promovido (comprou) vê. No-op pra save sem cliffhanger (jogo pago).
    if (weekTurned) {
      if (demo && next.world.week === DEMO_WEEKS) next = ensureDemoCliff(next);
      next = deliverDemoCliff(next, Date.now());
    }
    setSaveError(!saveRtp(next));
    // FUNIL DA DEMO: só quando a semana REALMENTE vira — handleUpdate roda em
    // treino, ação, transferência etc. É esta série que desenha a curva de
    // desistência dentro da degustação (semana 2, 3 e a virada que trava).
    if (demo && weekTurned) trackRtpDemo('week', next.world.week);
    setSave(next);
  };

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: ct('Recomeçar carreira'),
      message: ct('Isso apaga seu jogador atual do Road to Pro. Não dá pra desfazer. Continuar?'),
      confirmLabel: ct('Apagar e recomeçar'),
      cancelLabel: ct('Manter'),
    });
    if (!ok) return;
    deleteRtp();
    setSave(null);
  };

  const handleRetire = async () => {
    if (!save) return;
    const ok = await confirmDialog({
      title: ct('Anunciar aposentadoria'),
      message: ct('Encerra sua carreira agora e mostra o seu legado. Você continua com este save (só a carreira acaba). Confirmar?'),
      confirmLabel: ct('Me aposentar'),
      cancelLabel: ct('Continuar jogando'),
    });
    if (!ok) return;
    handleUpdate({ ...save, retired: true });
  };

  // Evita um flash da tela de criação enquanto o cloud-sync do boot resolve.
  if (!save && !booted) return null;

  if (!save) {
    return <RTPCreate onExit={onExit} onCreated={handleCreated} />;
  }
  // Carreira encerrada (aposentadoria): tela de legado. Tem prioridade sobre tudo.
  if (save.retired) {
    return <RtpLegacy save={save} onExit={onExit} onReset={() => { deleteRtp(); setSave(null); }} />;
  }
  // DEMO: a trava fecha quando a degustação acaba (ou quando o convidado
  // tenta abrir a Série do Dia — exclusiva da vitalícia).
  if (demo && (save.world.week > DEMO_WEEKS || dailyOpen)) {
    return <RtpDemoGate save={save} onUpdate={handleUpdate} onUpgrade={() => { setDailyOpen(false); onUpgrade?.(); }} onExit={() => { setDailyOpen(false); onExit(); }} />;
  }
  // SÉRIE DO DIA: desafio global diário — fixture próprio, não toca no seu save.
  if (dailyOpen) {
    return <RtpDailySeries onExit={() => setDailyOpen(false)} save={save} onUpdate={handleUpdate} />;
  }
  if (playing) {
    return (
      <RTPMatch
        save={save}
        onExit={() => setPlaying(false)}
        onDone={(next, seasonEnd, eventEnd) => {
          handleUpdate(next);
          setPlaying(false);
          setNotice(
            seasonEnd ? { kind: 'season', text: seasonMessage(seasonEnd) }
              : eventEnd ? { kind: 'season', text: eventMessage(eventEnd) }
                : null,
          );
        }}
      />
    );
  }

  // Major em andamento? Tem prioridade sobre transferências e hub (as ofertas
  // ficam diferidas até o Major resolver).
  const major = save.world.major;
  if (major) {
    if (playingMajor && !major.resolved) {
      return (
        <RTPMatch
          save={save}
          mode="major"
          onExit={() => setPlayingMajor(false)}
          onDone={(next) => { handleUpdate(next); setPlayingMajor(false); }}
        />
      );
    }
    return (
      <RTPMajor
        save={save}
        onPlay={() => setPlayingMajor(true)}
        onSimulate={() => {
          const c = autoSimMajorRound(save);
          if (!c) return;
          handleUpdate(c.save);
          // feedback no skip do Major: abre o mesmo modal de resultado do circuito
          if (c.result && c.consequence) setSimResult({ result: c.result, consequence: c.consequence });
        }}
        onDismiss={() => { if (major.resolved) handleUpdate(dismissMajor(save)); else onExit(); }}
      />
    );
  }

  // Janela de transferências aberta? Tem prioridade sobre o hub.
  const hasOffers = (save.world.pendingOffers ?? []).length > 0;
  if (hasOffers) {
    return (
      <RTPTransfer
        save={save}
        onAccept={(offerId) => { handleUpdate(acceptOffer(save, offerId)); setNotice({ kind: 'season', text: ct('Bem-vindo ao novo time!') }); }}
        onNegotiate={(offerId) => {
          const rng = makeRng((save.rng.seed ^ save.rng.tick ^ 0x71f) >>> 0);
          const { offers, result } = negotiateOffer(save, offerId, rng);
          handleUpdate({ ...save, world: { ...save.world, pendingOffers: offers }, rng: { seed: save.rng.seed, tick: save.rng.tick + 1 } });
          return result;
        }}
        onDecline={() => handleUpdate(declineOffers(save))}
      />
    );
  }

  // Skip: auto-sim da série do circuito + conclui (avança o bracket). O resultado
  // abre em MODAL (placar/mapas/sua linha/consequências) — imersão até no skip.
  const handleAutoSim = () => {
    const res = autoSimCircuitRound(save);
    if (!res) return;
    handleUpdate(res.conclusion.save);
    setSimResult({ result: res.result, consequence: res.consequence });
    setNotice(
      res.conclusion.seasonEnd
        ? { kind: 'season', text: seasonMessage(res.conclusion.seasonEnd) }
        : res.conclusion.eventEnd
          ? { kind: 'season', text: eventMessage(res.conclusion.eventEnd) }
          : null,
    );
  };

  return (
    <>
      <RTPHub
        save={save}
        onExit={onExit}
        onReset={handleReset}
        onRetire={handleRetire}
        onUpdate={handleUpdate}
        onPlayMatch={() => { setNotice(null); setPlaying(true); }}
        onDaily={() => setDailyOpen(true)}
        onAutoSim={handleAutoSim}
        onResolveEvent={(eventId, optionId) => handleUpdate(applyLifeChoice(save, eventId, optionId))}
        notice={saveError
          ? { kind: 'season', text: `⚠️ ${ct('Não consegui gravar seu progresso (armazenamento do navegador cheio ou indisponível). Libere espaço — sem isso, o que você jogar agora se perde ao fechar a página.')}` }
          : notice}
        onDismissNotice={() => { setSaveError(false); setNotice(null); }}
      />
      {simResult && (
        <RtpSimResult result={simResult.result} consequence={simResult.consequence} onClose={() => setSimResult(null)} />
      )}
      {/* [W1] última semana grátis: a proposta do clube maior, com resposta trancada */}
      {demo && save.demoCliff?.status === 'teaser' && <RtpDemoCliffBanner save={save} onUpgrade={() => onUpgrade?.()} />}
    </>
  );
}
