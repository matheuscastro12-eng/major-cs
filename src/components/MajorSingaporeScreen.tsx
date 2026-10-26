// Modo MAJOR SINGAPORE 2026 — previsões (Monte Carlo pré-calculado pelo script
// scripts/major-singapore-predict.mts) + "simular o Major" ao vivo no navegador.
// Lista de times: src/data/major-singapore-2026.json (única fonte).
import { useMemo, useState } from 'react';
import { ct } from '../state/career-i18n';
import { randomSeed, makeRng } from '../engine/rng';
import { buildField, simulateMajor, type MajorRun } from '../engine/majorSingapore';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../engine/majorSingapore/data';
import prediction from '../data/major-singapore-2026-prediction.json';
import '../styles/major-singapore.css';

type Row = (typeof prediction.teams)[number];
type SortKey = 'title' | 'final' | 'playoffs' | 'passStage2' | 'passStage1';

const fmt = (x: number | null) => (x == null ? '—' : `${x.toFixed(1)}%`);

export function MajorSingaporeScreen({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<'prev' | 'sim'>('prev');
  const [sort, setSort] = useState<SortKey>('title');
  const [run, setRun] = useState<MajorRun | null>(null);
  const field = useMemo(() => buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET), []);
  const name = useMemo(() => new Map(field.all.map((t) => [t.id, t.name])), [field]);
  const rows = useMemo(() => [...prediction.teams].sort((a: Row, b: Row) => (b[sort] ?? -1) - (a[sort] ?? -1)), [sort]);
  const provisional = MAJOR_SG_CONFIG.listStatus !== 'oficial';

  const cols: { k: SortKey; label: string }[] = [
    { k: 'passStage1', label: ct('Passa S1') },
    { k: 'passStage2', label: ct('Passa S2') },
    { k: 'playoffs', label: ct('Playoffs') },
    { k: 'final', label: ct('Final') },
    { k: 'title', label: ct('Título') },
  ];

  return (
    <div className="msg-screen" data-mode="major">
      <header className="msg-head">
        <button type="button" className="msg-back" onClick={onExit}>← {ct('Voltar')}</button>
        <div>
          <h1>PGL Major Singapore 2026</h1>
          <p className="msg-sub">24/11 – 13/12 · Stage 1 → Stage 2 → Stage 3 → Champions Stage</p>
        </div>
      </header>
      {provisional && (
        <p className="msg-warn">{ct('Lista provisória: vagas marcadas com * são placeholders até a lista oficial (02/11).')}</p>
      )}
      <nav className="msg-tabs">
        <button type="button" aria-pressed={tab === 'prev'} onClick={() => setTab('prev')}>{ct('Previsões')}</button>
        <button type="button" aria-pressed={tab === 'sim'} onClick={() => setTab('sim')}>{ct('Simular o Major')}</button>
      </nav>

      {tab === 'prev' && (
        <section>
          <p className="msg-sub">{prediction.sims} {ct('simulações')} · seed {prediction.seed} · {prediction.generatedFrom}</p>
          <div className="msg-table-wrap">
            <table className="msg-table">
              <thead>
                <tr>
                  <th>#</th><th>{ct('Time')}</th><th>{ct('Entra')}</th>
                  {cols.map((c) => (
                    <th key={c.k}><button type="button" className={sort === c.k ? 'on' : ''} onClick={() => setSort(c.k)}>{c.label}</button></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{t.team}{t.provisional ? '*' : ''}</td>
                    <td>S{t.entryStage}</td>
                    {cols.map((c) => <td key={c.k} className={c.k === sort ? 'on' : ''}>{fmt(t[c.k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'sim' && (
        <section>
          <button type="button" className="msg-cta" onClick={() => setRun(simulateMajor(field, makeRng(randomSeed())))}>
            {run ? ct('Simular de novo') : ct('Simular o Major inteiro')}
          </button>
          {run && (
            <div className="msg-run">
              <h2>🏆 {name.get(run.championId)}</h2>
              <p>{ct('Final')}: {run.finalists.map((id) => name.get(id)).join(' × ')}</p>
              <p>{ct('Semifinal')}: {run.semis.map((id) => name.get(id)).join(', ')}</p>
              <p>{ct('Playoffs')}: {run.playoffs.map((id) => name.get(id)).join(', ')}</p>
              <p>{ct('Passaram do Stage 2')}: {run.passedS2.map((id) => name.get(id)).join(', ')}</p>
              <p>{ct('Passaram do Stage 1')}: {run.passedS1.map((id) => name.get(id)).join(', ')}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
