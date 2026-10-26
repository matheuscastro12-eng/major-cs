// Modo MAJOR SINGAPORE 2026 — visual "Broadcast Desk" dentro do GameShell:
// Visão geral (header do evento + cards por Stage + favoritos), Previsões
// (tabela Monte Carlo com barras) e Simular (Major inteiro com campeão em
// destaque). Lista única: src/data/major-singapore-2026.json. Previsões:
// scripts/major-singapore-predict.mts (1.000 simulações, pré-calculadas).
import { useMemo, useState } from 'react';
import { CalendarDays, Dices, LayoutGrid, ListOrdered, MapPin, Trophy } from 'lucide-react';
import { ct } from '../state/career-i18n';
import { randomSeed, makeRng } from '../engine/rng';
import { buildField, simulateMajor, type MajorRun } from '../engine/majorSingapore';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../engine/majorSingapore/data';
import { logoForTeam } from '../data/media';
import prediction from '../data/major-singapore-2026-prediction.json';
import { Alert, Bar, Button, Panel, Segmented, Stat, Table, Tag, type Column } from './ds/index';
import { GameShell } from './ds/shell/GameShell';
import type { ShellNavGroup } from './ds/shell/types';
import { TeamBadge } from './ui';
import type { TeamSeason, Tournament } from '../types';
import '../styles/major-singapore.css';

type Row = (typeof prediction.teams)[number];
type View = 'geral' | 'previsoes' | 'simular';
type StageFilter = 'all' | '1' | '2' | '3';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(1)}%`);

export function MajorSingaporeScreen({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<View>('geral');
  const [stage, setStage] = useState<StageFilter>('all');
  const [run, setRun] = useState<MajorRun | null>(null);
  const field = useMemo(() => buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET), []);
  const src = useMemo(() => new Map<string, TeamSeason>(MAJOR_SG_DATASET.map((t) => [t.id, t])), []);
  const odds = useMemo(() => new Map<string, Row>(prediction.teams.map((t) => [t.id, t])), []);
  const provisional = MAJOR_SG_CONFIG.listStatus !== 'oficial';
  const nProv = MAJOR_SG_CONFIG.teams.filter((t) => t.provisional).length;

  const badge = (id: string, size = 24) => {
    const t = src.get(id);
    if (!t) return null;
    return <TeamBadge tag={t.tag} colors={t.colors as [string, string]} size={size} logoUrl={t.logoUrl ?? logoForTeam(t)} />;
  };
  const nameOf = (id: string) => src.get(id)?.team ?? id;
  const isProv = (id: string) => field.provisional.has(id);
  const teamCell = (id: string, size = 24) => (
    <span className="msg-team">
      {badge(id, size)}
      <span className="msg-team__name">{nameOf(id)}</span>
      {isProv(id) && <Tag tone="warn">{ct('provisório')}</Tag>}
    </span>
  );

  const simulate = () => { setRun(simulateMajor(field, makeRng(randomSeed()))); setView('simular'); };

  const nav: ShellNavGroup[] = [
    { id: 'evento', label: 'PGL Major Singapore', items: [
      { id: 'geral', label: ct('Visão geral'), icon: LayoutGrid },
      { id: 'previsoes', label: ct('Previsões'), icon: ListOrdered },
      { id: 'simular', label: ct('Simular o Major'), icon: Dices },
    ] },
  ];

  const favorites = prediction.teams.slice(0, 5);
  const maxTitle = Math.max(...favorites.map((t) => t.title), 1);

  // ---------- Previsões ----------
  const rows = prediction.teams.filter((t) => stage === 'all' || String(t.entryStage) === stage);
  const barCol = (key: 'passStage1' | 'passStage2' | 'playoffs' | 'final' | 'title', header: string, gold = false): Column<Row> => ({
    key, header, num: true, sort: (r) => r[key] ?? -1,
    cell: (r) => (r[key] == null ? <span className="msg-dim">—</span> : (
      <span className="msg-pct"><Bar value={r[key]!} tone={gold ? 'gold' : undefined} label={`${header} ${pct(r[key])}`} /><b>{pct(r[key])}</b></span>
    )),
  });
  const columns: Column<Row>[] = [
    { key: 'rank', header: '#', num: true, width: 40, cell: (_r, i) => i + 1 },
    { key: 'team', header: ct('Time'), sort: (r) => r.team, cell: (r) => teamCell(r.id) },
    { key: 'stage', header: ct('Entra'), sort: (r) => r.entryStage, cell: (r) => <Tag tone="neutral">Stage {r.entryStage}</Tag> },
    barCol('passStage1', ct('Passa S1')),
    barCol('passStage2', ct('Passa S2')),
    barCol('playoffs', ct('Playoffs')),
    barCol('final', ct('Final')),
    barCol('title', ct('Título'), true),
  ];

  // ---------- Simulação ----------
  const stageTable = (t: Tournament) => [...t.teams].sort((a, b) => (a.status === 'advanced' ? 0 : 1) - (b.status === 'advanced' ? 0 : 1) || b.wins - a.wins || a.losses - b.losses);
  const playoffs = run?.stages[3];
  const series = (label: string) => playoffs?.history.filter((h) => h.pairing.label.startsWith(label)) ?? [];

  return (
    <GameShell
      mode="major"
      identity={{ title: 'Major Singapore', subtitle: 'PGL · 24/11 – 13/12', badge: <Trophy size={18} aria-hidden /> }}
      nav={nav}
      active={view}
      onNav={(id) => setView(id as View)}
      title={view === 'geral' ? ct('Visão geral') : view === 'previsoes' ? ct('Previsões') : ct('Simular o Major')}
      crumbs={[{ label: 'PGL Major Singapore 2026' }]}
      meta={provisional ? <Tag tone="warn">{ct('Lista provisória')}</Tag> : <Tag tone="win">{ct('Lista oficial')}</Tag>}
      next={{ label: ct('Simular'), detail: ct('Major inteiro · 32 times'), icon: Dices, onGo: simulate }}
      mobileNav={['geral', 'previsoes', 'simular']}
      history={{ back: onExit, canBack: true }}
    >
      <div className="msg">
        {/* header do evento (completo na visão geral, compacto nas outras) */}
        <header className={`msg-hero${view === 'geral' ? '' : ' msg-hero--compact'}`}>
          <div className="msg-hero__txt">
            <span className="msg-kicker">CS2 · Major</span>
            <h1 className="msg-hero__title">PGL Major Singapore 2026</h1>
            <p className="msg-hero__meta">
              <span><CalendarDays size={14} aria-hidden /> 24/11 – 13/12</span>
              <span><MapPin size={14} aria-hidden /> Singapura</span>
              <span>Stage 1 → Stage 2 → Stage 3 → Champions Stage</span>
            </p>
          </div>
          <div className="msg-hero__stats">
            <Stat label={ct('Times')} value="32" />
            <Stat label={ct('Stages suíços')} value="3" />
            <Stat label={ct('Simulações')} value={prediction.sims.toLocaleString('pt-BR')} />
          </div>
        </header>

        {provisional && (
          <Alert tone="warn" title={ct('Lista provisória')}>
            {nProv} {ct('vagas são placeholders pelo ranking (marcadas como provisório) até a lista oficial de 02/11. As previsões mudam quando ela sair.')}
          </Alert>
        )}

        {view === 'geral' && (
          <>
            <div className="msg-stages">
              {([3, 2, 1] as const).map((s) => {
                const ids = (s === 1 ? field.s1 : s === 2 ? field.s2 : field.s3).map((t) => t.id);
                const sub = s === 1 ? ct('16 times · 8 avançam') : `8 ${ct('convidados + 8 do')} Stage ${s - 1}`;
                return (
                  <Panel key={s} title={`Stage ${s}`} icon={<span className="msg-stage-n">{s}</span>} actions={<span className="msg-dim">{sub}</span>} flush>
                    <ul className="msg-list">
                      {ids.map((id) => (
                        <li key={id}>
                          {teamCell(id, 22)}
                          <span className="msg-list__num" title={ct('chance de título')}>{pct(odds.get(id)?.title)}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                );
              })}
            </div>
            <Panel title={ct('Favoritos ao título')} icon={<Trophy size={16} aria-hidden />} actions={<Button size="sm" variant="secondary" onClick={() => setView('previsoes')}>{ct('Ver tabela completa')}</Button>}>
              <ol className="msg-favs">
                {favorites.map((t, i) => (
                  <li key={t.id}>
                    <span className="msg-favs__pos">{i + 1}</span>
                    {badge(t.id, 32)}
                    <span className="msg-favs__name">{t.team}</span>
                    <span className="msg-favs__bar"><Bar value={(t.title / maxTitle) * 100} tone="gold" lg label={`${t.team} ${pct(t.title)}`} /></span>
                    <b className="msg-favs__pct">{pct(t.title)}</b>
                  </li>
                ))}
              </ol>
            </Panel>
          </>
        )}

        {view === 'previsoes' && (
          <Panel
            title={ct('Chances por time')}
            icon={<ListOrdered size={16} aria-hidden />}
            actions={(
              <Segmented<StageFilter>
                label={ct('Filtrar por Stage de entrada')}
                value={stage}
                onChange={setStage}
                items={[{ value: 'all', label: ct('Todos') }, { value: '3', label: 'S3' }, { value: '2', label: 'S2' }, { value: '1', label: 'S1' }]}
              />
            )}
            flush
          >
            {/* celular: lista compacta (playoffs + título) no lugar da tabela larga */}
            <ol className="msg-mlist">
              {[...rows].sort((a, b) => b.title - a.title || b.playoffs - a.playoffs).map((r, i) => (
                <li key={r.id}>
                  <span className="msg-favs__pos">{i + 1}</span>
                  <span className="msg-mlist__team">{teamCell(r.id, 24)}<span className="msg-dim">Stage {r.entryStage}{r.passStage1 != null ? ` · S1 ${pct(r.passStage1)}` : ''}{r.passStage2 != null ? ` · S2 ${pct(r.passStage2)}` : ''}</span></span>
                  <span className="msg-mlist__bars">
                    <span className="msg-mlist__lab">{ct('Playoffs')} <b>{pct(r.playoffs)}</b></span><Bar value={r.playoffs} label={`${ct('Playoffs')} ${pct(r.playoffs)}`} />
                    <span className="msg-mlist__lab">{ct('Título')} <b className="msg-gold">{pct(r.title)}</b></span><Bar value={r.title} tone="gold" label={`${ct('Título')} ${pct(r.title)}`} />
                  </span>
                </li>
              ))}
            </ol>
            <div className="msg-table-wrap">
              <Table<Row> columns={columns} rows={rows} rowKey={(r) => r.id} caption={ct('Previsões do Major por Monte Carlo')} defaultSort={{ key: 'title', dir: 'desc' }} zebra />
            </div>
            <p className="msg-foot">{prediction.sims.toLocaleString('pt-BR')} {ct('simulações')} · seed {prediction.seed} · {prediction.generatedFrom}</p>
          </Panel>
        )}

        {view === 'simular' && !run && (
          <Panel title={ct('Simular o Major')} icon={<Dices size={16} aria-hidden />}>
            <div className="msg-empty">
              <p>{ct('Roda o Major inteiro (Stage 1 ao Champions Stage) com os elencos atuais. Cada simulação é diferente.')}</p>
              <Button variant="primary" size="lg" onClick={simulate}>{ct('Simular o Major inteiro')}</Button>
            </div>
          </Panel>
        )}

        {view === 'simular' && run && playoffs && (
          <>
            <Panel tone="achievement" className="msg-champ">
              <div className="msg-champ__body">
                {badge(run.championId, 88)}
                <div>
                  <span className="msg-kicker msg-kicker--gold"><Trophy size={14} aria-hidden /> {ct('Campeão')}</span>
                  <h2 className="msg-champ__name">{nameOf(run.championId)}</h2>
                  <p className="msg-dim">
                    {ct('Final')}: {run.finalists.map(nameOf).join(' × ')}
                    {series('FINAL')[0]?.pairing.result && ` · ${series('FINAL')[0].pairing.result!.mapScore.join('–')}`}
                  </p>
                </div>
                <Button variant="primary" onClick={simulate}>{ct('Simular de novo')}</Button>
              </div>
            </Panel>

            <Panel title="Champions Stage" icon={<Trophy size={16} aria-hidden />}>
              <div className="msg-bracket">
                {[['QF', ct('Quartas')], ['SF', ct('Semifinal')], ['FINAL', ct('Final')]].map(([lab, title]) => (
                  <div key={lab} className="msg-bracket__col">
                    <h3 className="msg-bracket__h">{title}</h3>
                    {series(lab).map(({ pairing: p }) => {
                      const r = p.result!;
                      return (
                        <div key={p.label} className="msg-series">
                          {[0, 1].map((side) => {
                            const id = side === 0 ? p.a : p.b;
                            return (
                              <div key={id} className={`msg-series__row${r.winner === side ? ' is-win' : ''}`}>
                                {badge(id, 20)}<span className="msg-team__name">{nameOf(id)}</span><b>{r.mapScore[side]}</b>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Panel>

            <div className="msg-stages">
              {run.stages.slice(0, 3).reverse().map((t, i) => (
                <Panel key={t.name} title={`Stage ${3 - i}`} flush>
                  <ul className="msg-list">
                    {stageTable(t).map((x) => (
                      <li key={x.id} className={x.status === 'advanced' ? 'is-adv' : 'is-out'}>
                        {teamCell(x.id, 20)}
                        <span className="msg-list__num">{x.wins}–{x.losses}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ))}
            </div>
          </>
        )}
      </div>
    </GameShell>
  );
}
