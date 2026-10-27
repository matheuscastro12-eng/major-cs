// Resultado de um Major (simulado, jogado ou da liga): a chave dos playoffs em
// colunas (quartas → semis → final → campeão, mesmo desenho do Pick'em), a
// tabela de cada stage suíço e as estatísticas por time.
import { useMemo, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import type { MajorData, MajorMatch, MajorPicks, MajorResult } from '../../engine/majorSingapore';
import { teamStats, type TeamStats } from '../../engine/majorCampaign';
import { Panel, Segmented, Table, type Column } from '../ds';
import type { MajorKey } from './majorStrings';

const D = data as unknown as MajorData;
type T = (k: MajorKey) => string;
type View = 'bracket' | 'stages' | 'teams';

const FINISH_ORDER: Record<string, number> = { 'Campeão': 0, Final: 1, SF: 2, QF: 3, 'Stage 3': 4, 'Stage 2': 5, 'Stage 1': 6 };

export function MajorResultView({ t, result, picks, highlight }: { t: T; result: MajorResult; picks?: MajorPicks; highlight?: string }) {
  const teams = useMemo(() => new Map(D.teams.map((x) => [x.id, x])), []);
  const name = (id: string) => teams.get(id)?.name ?? id;
  const [view, setView] = useState<View>('bracket');
  const po = result.playoffs;
  const stats = useMemo(() => teamStats(D, result), [result]);

  const game = (m: MajorMatch) => (
    <div key={m.label} className="msg-game">
      {([[m.a, m.score[0]], [m.b, m.score[1]]] as [string, number][]).map(([id, sc]) => (
        <div key={id} className={`msg-slot is-static${m.winner === id ? ' is-won' : ''}${highlight === id ? ' is-me' : ''}`}>
          <span className="msg-seed">{teams.get(id)?.seed}</span>
          <span className="msg-slot__name">{name(id)}</span>
          <span className="msg-slot__score">{sc}</span>
        </div>
      ))}
    </div>
  );

  const cols: Column<TeamStats>[] = [
    { key: 'team', header: 'Time', cell: (r) => name(r.id), sort: (r) => name(r.id) },
    { key: 'finish', header: t('finish'), cell: (r) => (r.finish === 'Campeão' ? t('champion') : r.finish), sort: (r) => FINISH_ORDER[r.finish] ?? 9 },
    { key: 'series', header: t('record'), num: true, cell: (r) => `${r.series[0]}–${r.series[1]}`, sort: (r) => r.series[0] - r.series[1] },
    { key: 'maps', header: t('mapsWL'), num: true, cell: (r) => `${r.maps[0]}–${r.maps[1]}`, sort: (r) => r.maps[0] - r.maps[1] },
  ];

  return (
    <Panel
      title={`${t('champion')}: ${name(po.champion)}`}
      accent="gold"
    >
      {/* no corpo, não no cabeçalho: no celular o título do campeão não é cortado */}
      <Segmented<View>
        className="msg-views"
        label="Visão"
        value={view}
        onChange={setView}
        items={[{ value: 'bracket', label: 'Playoffs' }, { value: 'stages', label: 'Stages' }, { value: 'teams', label: t('teamStats') }]}
      />
      {view === 'bracket' && (
        <div className="msg-bracket">
          <div className="msg-bcol is-qf"><h3 className="msg-bcol__title">{t('qf')}</h3>{po.qf.map(game)}</div>
          <div className="msg-bcol is-sf"><h3 className="msg-bcol__title">{t('sf')}</h3>{po.sf.map(game)}</div>
          <div className="msg-bcol is-f"><h3 className="msg-bcol__title">{t('final')} · {t('bo')}5</h3>{game(po.final)}</div>
          <div className="msg-bcol is-champ">
            <h3 className="msg-bcol__title">{t('champion')}</h3>
            <div className="msg-champ is-set"><Trophy size={22} aria-hidden /><span>{name(po.champion)}</span></div>
          </div>
        </div>
      )}
      {view === 'stages' && result.stages.map((st) => (
        <section key={st.stage} className="msg-seedgroup">
          <h3 className="msg-seedgroup__title">Stage {st.stage}</h3>
          <div className="msg-standings">
            {[...st.records].sort((a, b) => b.w - a.w || a.l - b.l).map((r) => (
              <p key={r.id} className={`msg-standing${r.w === 3 ? ' is-adv' : ''}${highlight === r.id ? ' is-me' : ''}`}>
                <span className="msg-standing__rec">{r.w}–{r.l}</span>
                <span className="msg-standing__name">{name(r.id)}</span>
                {picks?.[`s${st.stage}` as 's1'].includes(r.id) && <Check size={14} aria-label="palpite" />}
              </p>
            ))}
          </div>
        </section>
      ))}
      {view === 'teams' && (
        <Table
          columns={cols}
          rows={stats}
          rowKey={(r) => r.id}
          caption={t('teamStats')}
          isMe={(r) => r.id === highlight}
          defaultSort={{ key: 'finish', dir: 'asc' }}
          zebra
        />
      )}
    </Panel>
  );
}
