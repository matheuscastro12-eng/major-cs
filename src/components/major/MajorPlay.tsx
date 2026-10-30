// MODO MAJOR JOGADO — escolhe um time, joga as séries dele na Sala do Road to
// Pro (RtpRoundRoom, a mesma máquina de engine/rtp/room.ts) e vê o Major andar.
// Toda a regra está em engine/majorCampaign.ts; aqui é só tela e storage.
import { useEffect, useMemo, useState } from 'react';
import { Award, Dices, Download, Play, RotateCcw } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import { bySeed, type MajorData, type MajorResult } from '../../engine/majorSingapore';
import {
  campaignSummary, campaignView, majorSeriesSetup, newCampaign, parseCampaign, recordSeries, simulatePending,
  type MajorCampaign, type PendingSeries,
} from '../../engine/majorCampaign';
import { randomSeed } from '../../engine/rng';
import type { Role } from '../../types';
import type { MomentOutcome } from '../../engine/rtp/moments';
import type { MapId } from '../../types';
import { track, trackFirstMatchDone, trackShare } from '../../state/track';
import { RtpRoundRoom } from '../rtp/RtpRoundRoom';
import { Alert, Button, Panel, Tag } from '../ds';
import { downloadDataUrl, drawCampaignCard } from './majorShareCard';
import { MajorResultView } from './MajorResultView';
import type { MajorKey } from './majorStrings';

const D = data as unknown as MajorData;
const STORE = 'rtm-major-sg-campaign-v1';
const ROLES: Role[] = ['Rifler', 'AWP', 'Entry', 'IGL', 'Lurker', 'Support'];
const ROLE_LABEL: Record<Role, string> = { Rifler: 'Rifler', AWP: 'AWPer', Entry: 'Entry', IGL: 'IGL', Lurker: 'Lurker', Support: 'Suporte' };

type T = (k: MajorKey) => string;

function loadCampaign(): MajorCampaign | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? parseCampaign(D, JSON.parse(raw)) : null;
  } catch { return null; }
}

const phaseLabel = (p: PendingSeries['phase']) => (p === 4 ? 'Playoffs' : `Stage ${p}`);
const roundLabel = (label: string, t: T) =>
  label.startsWith('QF') ? t('qf') : label.startsWith('SF') ? t('sf') : label === 'F' ? t('final') : label;

export function MajorPlay({ t }: { t: T }) {
  const teams = useMemo(() => new Map(D.teams.map((x) => [x.id, x])), []);
  const [camp, setCamp] = useState<MajorCampaign | null>(loadCampaign);
  const [teamId, setTeamId] = useState(camp?.teamId ?? 'furia');
  const [role, setRole] = useState<Role>(camp?.role ?? 'Rifler');
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    try {
      if (camp) localStorage.setItem(STORE, JSON.stringify(camp));
      else localStorage.removeItem(STORE);
    } catch { /* sem storage */ }
  }, [camp]);

  const view = useMemo(() => (camp ? campaignView(D, camp) : null), [camp]);
  const setup = useMemo(() => (camp && view?.next && inRoom ? majorSeriesSetup(D, camp, view.next) : null), [camp, view, inRoom]);
  const name = (id: string) => teams.get(id)?.name ?? id;

  // ── a Sala (mesmo root .rtp da Série do Dia: sem ele, as vars --rtp-* somem)
  if (camp && view?.next && setup) {
    const next = view.next;
    const onComplete = (outcomes: MomentOutcome[], liveMaps?: { map: MapId; score: [number, number]; won: boolean }[]) => {
      const c = recordSeries(D, camp, next, outcomes, liveMaps);
      const last = c.played[c.played.length - 1];
      track('major_sg_series', { phase: next.phase, won: last.winner === camp.teamId ? 1 : 0, rating: last.heroRating });
      trackFirstMatchDone('major'); // ativação: 1ª série concluída (1x por navegador)
      trackCampaignDone(c);
      setCamp(c);
      setInRoom(false);
    };
    return (
      <div className="msg-room">
        <div className="msg-room__bar">
          <Tag tone="accent">{phaseLabel(next.phase)} · {roundLabel(next.label, t)} · {t('bo')}{next.bestOf}</Tag>
          <span className="msg-room__vs"><strong>{name(camp.teamId)}</strong> × {name(next.opp)}</span>
        </div>
        <div className="rtp rtp-screen" data-fx="on">
          <RtpRoundRoom key={`${next.phase}-${next.label}`} save={setup.save} prep={setup.prep} onComplete={onComplete} major />
        </div>
      </div>
    );
  }

  // ── escolher o time
  if (!camp) {
    return (
      <Panel title={t('playTitle')}>
        <p className="msg-muted">{t('playIntro')}</p>
        <div className="msg-form">
          <label className="msg-field">
            <span>{t('pickTeam')}</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {bySeed(D).map((x) => <option key={x.id} value={x.id}>{x.seed}. {x.name}</option>)}
            </select>
          </label>
          <label className="msg-field">
            <span>{t('pickRole')}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <Button variant="primary" icon={<Play size={16} aria-hidden />} onClick={() => { setCamp(newCampaign(randomSeed(), teamId, role)); track('major_sg_campaign', { team: teamId }); }}>
            {t('startCampaign')}
          </Button>
        </div>
      </Panel>
    );
  }

  const summary = campaignSummary(camp, view?.result?.playoffs.champion ?? null);
  const restart = () => { if (window.confirm(t('abandonConfirm'))) { setCamp(null); setInRoom(false); } };
  const mine = teams.get(camp.teamId)!;

  return (
    <div className="msg-stack">
      <Panel
        title={`${t('yourRun')} · ${mine.name}`}
        actions={<Button size="sm" variant="ghost" icon={<RotateCcw size={16} aria-hidden />} onClick={restart}>{t('abandon')}</Button>}
      >
        <div className="msg-kpis">
          <div><span className="msg-kpi__label">{t('record')}</span><span className="msg-kpi__val">{summary.record[0]}–{summary.record[1]}</span></div>
          <div><span className="msg-kpi__label">{t('mapsWL')}</span><span className="msg-kpi__val">{summary.maps[0]}–{summary.maps[1]}</span></div>
          <div><span className="msg-kpi__label">{t('avgRating')}</span><span className="msg-kpi__val">{summary.avgRating?.toFixed(2) ?? '—'}</span></div>
          <div><span className="msg-kpi__label">{t('pickRole')}</span><span className="msg-kpi__val">{ROLE_LABEL[camp.role]}</span></div>
        </div>
        {camp.played.length === 0 ? <p className="msg-muted">{t('noRunYet')}</p> : (
          <ol className="msg-runlog">
            {camp.played.map((p) => {
              const won = p.winner === camp.teamId;
              const ia = p.a === camp.teamId;
              return (
                <li key={`${p.phase}-${p.label}`} className={won ? 'is-w' : 'is-l'}>
                  <span className="msg-runlog__when">{phaseLabel(p.phase)} · {roundLabel(p.label, t)}</span>
                  <span className="msg-runlog__opp">{name(ia ? p.b : p.a)}</span>
                  <span className="msg-runlog__score">{ia ? p.score[0] : p.score[1]}–{ia ? p.score[1] : p.score[0]}</span>
                  <span className="msg-runlog__rt">{p.heroRating > 0 ? p.heroRating.toFixed(2) : t('simulated')}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      {view?.next && (
        <Panel title={t('nextSeries')} accent="blue">
          <p className="msg-next">
            <Tag tone="accent">{phaseLabel(view.next.phase)} · {roundLabel(view.next.label, t)} · {t('bo')}{view.next.bestOf}</Tag>
            <span><strong>{mine.name}</strong> × {name(view.next.opp)}</span>
          </p>
          <div className="msg-toolbar">
            <Button variant="primary" icon={<Play size={16} aria-hidden />} onClick={() => setInRoom(true)}>{t('playRoom')}</Button>
            <Button icon={<Dices size={16} aria-hidden />} onClick={() => { const c = simulatePending(camp, D, view.next!); trackCampaignDone(c); setCamp(c); }}>{t('simThis')}</Button>
          </div>
        </Panel>
      )}

      {view?.result && <CampaignEnd t={t} camp={camp} result={view.result} summary={summary} />}
    </div>
  );
}

// a campanha acabou (campeão ou eliminado e o resto simulado): 1 marco por sessão (track.ts)
function trackCampaignDone(c: MajorCampaign): void {
  const v = campaignView(D, c);
  if (!v.next && v.result) track('major_sg_campaign_done', { champion: v.result.playoffs.champion === c.teamId ? 1 : 0 });
}

function CampaignEnd({ t, camp, result, summary }: { t: T; camp: MajorCampaign; result: MajorResult; summary: ReturnType<typeof campaignSummary> }) {
  const champ = result.playoffs.champion === camp.teamId;
  const saveCard = () => {
    downloadDataUrl(drawCampaignCard(D, camp, result, summary, {
      champion: t('champion'), record: t('record'), maps: t('mapsWL'), rating: t('avgRating'), mvp: t('mvp'), foot: t('cardFoot'),
    }), 'campanha-major-singapore.png');
    trackShare('major-campaign-img', 'copy'); // download do card conta como compartilhamento (share_card)
  };
  return (
    <>
      <Alert tone={champ ? 'success' : 'info'}>{champ ? t('championMsg') : t('eliminatedMsg')}</Alert>
      <Panel title={t('mvp')} accent="gold">
        <div className="msg-mvp">
          <Award size={28} aria-hidden className={summary.mvp ? 'is-on' : ''} />
          <div>
            <p className="msg-mvp__line">{summary.mvp ? `${camp.nick} · ${summary.avgRating?.toFixed(2)}` : t('mvpNo')}</p>
            {summary.best && <p className="msg-muted">{t('bestSeries')}: {summary.best.heroRating.toFixed(2)}</p>}
            <p className="msg-muted">{t('mvpRule')}</p>
          </div>
        </div>
        <div className="msg-toolbar">
          <Button icon={<Download size={16} aria-hidden />} onClick={saveCard}>{t('shareRun')}</Button>
        </div>
      </Panel>
      <MajorResultView t={t} result={result} highlight={camp.teamId} />
    </>
  );
}
