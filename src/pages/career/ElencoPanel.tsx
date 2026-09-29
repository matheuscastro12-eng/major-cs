// Elenco estilo FM (a "nova interface"): tabela densa dos titulares com visões
// de colunas (Geral · Atributos · Contratos · Desempenho), ordenação por
// coluna, avatar com anel da função, OVR em selo dourado e atributos 1–20
// coloridos por faixa. Nome do jogador tem peek (hover card) e abre o perfil.
// Marcar 2 linhas e "Comparar" abre o comparador lado a lado.
import { useState } from 'react';
import { ArrowLeftRight, Bandage, Users } from 'lucide-react';
import { Panel, Table, Segmented, AttrValue, Ovr, RoleChip, Avatar, Tag, type Column } from '../../components/ds/index';
import type { PlayerCondition } from '../../engine/gestao/model';
import { ConditionBar } from './TrainingTab';
import { openCompare } from '../../components/CompareHost';
import type { AttrKey } from '../../engine/attributes';
import { attrsOf } from '../../engine/attrs/model';
import { playerOvr, playerValue, playerWage, formatMoney } from '../../engine/ratings';
import { formStatus } from '../../engine/career/form';
import { ct } from '../../state/career-i18n';
import type { Player } from '../../types';

export interface ElencoRow {
  p: Player;
  oid: string;
  age: number;
  morale: number;
  moraleLabel: string;
  fatigue: number;
  /** [fase 2 · treino] condição (fitness, ritmo, lesão) */
  cond?: PlayerCondition | null;
  contractLeft: number | null;
  /** [fase 3] salário do contrato (sem: o de mercado) */
  wage?: number;
  rating?: number;
  maps?: number;
  kd?: number;
  adr?: number;
  recent?: number[];
}

type View = 'geral' | 'attrs' | 'contracts' | 'perf';

export function ElencoPanel({ rows, onOpen }: { rows: ElencoRow[]; onOpen: (p: Player) => void }) {
  const [view, setView] = useState<View>('geral');
  const [picked, setPicked] = useState<string[]>([]);
  // [realismo FM] atributos da fonte da verdade (base + evolução do elenco)
  const attrs = new Map(rows.map((r) => [r.oid, attrsOf({ ...r.p, id: r.oid }).a]));
  const a = (r: ElencoRow, k: AttrKey) => attrs.get(r.oid)?.[k] ?? 10;
  const attrCol = (k: AttrKey, label: string, views: View[]): Column<ElencoRow> => ({
    key: k, header: label, num: true, views, sort: (r) => a(r, k), cell: (r) => <AttrValue value={a(r, k)} />,
  });
  const togglePick = (oid: string) => setPicked((cur) => (cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur.slice(-1), oid]));

  const columns: Column<ElencoRow>[] = [
    {
      key: 'pick', header: <span className="ds-sr-only">{ct('Comparar')}</span>, width: 36,
      cell: (r) => (
        <input
          type="checkbox"
          className="elenco-pick"
          checked={picked.includes(r.oid)}
          onChange={() => togglePick(r.oid)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${ct('Marcar para comparar')}: ${r.p.nick}`}
        />
      ),
    },
    {
      key: 'nick', header: ct('Jogador'), sort: (r) => r.p.nick.toLowerCase(),
      cell: (r) => (
        <button type="button" className="elenco-who" data-peek={`career:${r.p.id}`} onClick={() => onOpen(r.p)}>
          <Avatar name={r.p.nick} role={r.p.role} size={40} />
          <span className="elenco-who__txt"><b>{r.p.nick}</b><small>{r.p.name}</small></span>
        </button>
      ),
    },
    { key: 'role', header: ct('Função'), sort: (r) => r.p.role, cell: (r) => <RoleChip role={r.p.role} /> },
    { key: 'age', header: ct('Idade'), num: true, sort: (r) => r.age, cell: (r) => r.age },
    { key: 'ovr', header: 'OVR', num: true, sort: (r) => playerOvr(r.p), cell: (r) => <Ovr value={playerOvr(r.p)} /> },
    attrCol('aim', ct('Mira'), ['geral', 'attrs']),
    attrCol('awp', 'AWP', ['geral', 'attrs']),
    attrCol('clutch', 'Clutch', ['geral', 'attrs']),
    attrCol('gameSense', ct('Leitura'), ['geral', 'attrs']),
    attrCol('leadership', ct('Liderança'), ['geral', 'attrs']),
    attrCol('consistency', ct('Consist.'), ['geral', 'attrs']),
    attrCol('spray', 'Spray', ['attrs']),
    attrCol('reflexes', ct('Reflexos'), ['attrs']),
    attrCol('composure', ct('Frieza'), ['attrs']),
    attrCol('communication', ct('Comunic.'), ['attrs']),
    {
      key: 'form', header: ct('Forma'), num: true, views: ['geral', 'perf'],
      sort: (r) => formStatus(r.recent).avg ?? 0,
      cell: (r) => { const f = formStatus(r.recent); return <span style={{ color: f.color }}>{f.avg != null ? f.avg.toFixed(2).replace('.', ',') : '—'}</span>; },
    },
    { key: 'value', header: ct('Valor'), num: true, views: ['geral', 'contracts'], sort: (r) => playerValue(r.p), cell: (r) => <b>{formatMoney(playerValue(r.p))}</b> },
    { key: 'wage', header: ct('Salário/split'), num: true, views: ['contracts'], sort: (r) => r.wage ?? playerWage(r.p), cell: (r) => formatMoney(r.wage ?? playerWage(r.p)) },
    {
      key: 'contract', header: ct('Contrato'), num: true, views: ['contracts'], sort: (r) => r.contractLeft ?? 99,
      cell: (r) => r.contractLeft == null ? '—' : <span className={r.contractLeft <= 1 ? 'elenco-warn' : undefined}>{r.contractLeft <= 0 ? ct('vencido') : `${r.contractLeft} split${r.contractLeft > 1 ? 's' : ''}`}</span>,
    },
    { key: 'morale', header: ct('Moral'), num: true, views: ['contracts', 'perf'], sort: (r) => r.morale, cell: (r) => <span title={r.moraleLabel}>{r.morale}</span> },
    {
      key: 'cond', header: ct('Condição'), views: ['geral', 'perf'], sort: (r) => (r.cond?.injury ? -1 : r.cond?.fitness ?? 100 - r.fatigue),
      cell: (r) => r.cond?.injury && r.cond.injury.weeksLeft > 0
        ? <Tag tone="loss" icon={<Bandage size={12} aria-hidden />}>{Math.ceil(r.cond.injury.weeksLeft)} {ct('sem.')}</Tag>
        : <ConditionBar compact fitness={r.cond?.fitness ?? 100 - r.fatigue} />,
    },
    { key: 'sharp', header: ct('Ritmo'), num: true, views: ['perf'], sort: (r) => r.cond?.sharpness ?? 70, cell: (r) => Math.round(r.cond?.sharpness ?? 70) },
    { key: 'rating', header: 'Rating', num: true, views: ['perf'], sort: (r) => r.rating ?? 0, cell: (r) => r.rating != null ? r.rating.toFixed(2) : '—' },
    { key: 'maps', header: ct('Mapas'), num: true, views: ['perf'], sort: (r) => r.maps ?? 0, cell: (r) => r.maps ?? 0 },
    { key: 'kd', header: 'K/D', num: true, views: ['perf'], sort: (r) => r.kd ?? 0, cell: (r) => r.kd != null ? r.kd.toFixed(2) : '—' },
    { key: 'adr', header: 'ADR', num: true, views: ['perf'], sort: (r) => r.adr ?? 0, cell: (r) => r.adr != null ? Math.round(r.adr) : '—' },
  ];

  const pickedRows = rows.filter((r) => picked.includes(r.oid));
  return (
    <Panel
      icon={<Users size={16} />}
      title={ct('Titulares')}
      flush
      className="elenco-panel"
      actions={(
        <>
          {picked.length === 2 && (
            <button type="button" className="ds-seg__btn" aria-pressed="true" onClick={() => openCompare(pickedRows.map((r) => r.p))}>
              <ArrowLeftRight size={14} aria-hidden /> {ct('Comparar')} {pickedRows.map((r) => r.p.nick).join(' × ')}
            </button>
          )}
          <Segmented<View>
            label={ct('Visão de colunas')}
            value={view}
            onChange={setView}
            items={[
              { value: 'geral', label: ct('Geral') },
              { value: 'attrs', label: ct('Atributos') },
              { value: 'contracts', label: ct('Contratos') },
              { value: 'perf', label: ct('Desempenho') },
            ]}
          />
        </>
      )}
    >
      <Table<ElencoRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.oid}
        view={view}
        tall
        defaultSort={{ key: 'ovr', dir: 'desc' }}
        caption={ct('Elenco titular')}
        selected={(r) => picked.includes(r.oid)}
        empty={ct('Sem jogadores no elenco.')}
      />
      {rows.length >= 2 && picked.length < 2 && (
        <p className="elenco-hint">{ct('Marque 2 jogadores para comparar lado a lado. Passe o mouse no nome para o resumo rápido.')}</p>
      )}
    </Panel>
  );
}
