// [fase 3 · frente CONTRATOS] Mercado › Contratos — a folha REAL do elenco.
// Tabela estilo FM com os termos de cada contrato (salário × mercado,
// vencimento, cláusula, status prometido, luvas, bônus de lealdade), resumo da
// folha (elenco + encargos + comissão × patrocínio), linha do tempo dos
// vencimentos e renovação antecipada negociada (até 2 splits antes do fim).
import { useState } from 'react';
import { CalendarClock, FileSignature, Wallet } from 'lucide-react';
import { Panel, Table, Segmented, Stat, Button, Avatar, Ovr, Tag, type Column } from '../../components/ds/index';
import { Flag } from '../../components/ui';
import { ContractNegotiationModal } from '../../components/career/ContractNegotiation';
import {
  contractRows, expiryTimeline, STATUS_LABEL, RENEWAL_WINDOW, type ContractRow, type NegoProfile,
} from '../../engine/clube/contratos';
import type { ClubeState, ContractTerms, Negotiation } from '../../engine/clube/model';
import { staffPayroll } from '../../engine/gestao/staff';
import type { GestaoState } from '../../engine/gestao/model';
import { formatMoney, playerOvr, playerWage } from '../../engine/ratings';
import { ct } from '../../state/career-i18n';
import { DIFFICULTY_ECON, type Difficulty, type Player } from '../../types';
import type { Signing } from '../../components/CareerScreen';
import '../../styles/contratos.css';

interface ContractsTabSave {
  org?: { name?: string } | null;
  squad: Signing[];
  clube?: ClubeState;
  split: number;
  budget: number;
  difficulty?: Difficulty;
  gestao?: GestaoState;
  [key: string]: unknown;
}

interface Props {
  save: ContractsTabSave;
  findSigning: (s: Signing) => { player: Player } | null;
  ageOf: (p: Player) => number;
  sponsorIncome: number;
  /** perfil de renovação (null = jogador não resolvido) */
  renewalProfileFor: (playerId: string) => NegoProfile | null;
  blockedFor: (playerId: string) => Negotiation | null;
  onRecord: (nego: Negotiation) => void;
  /** grava o contrato renovado e desconta as luvas */
  onRenew: (playerId: string, terms: ContractTerms) => void;
  onOpenPlayer?: (p: Player) => void;
}

type View = 'geral' | 'clausulas';
interface Row extends ContractRow { p: Player; age: number }

export function ContractsTab({ save, findSigning, ageOf, sponsorIncome, renewalProfileFor, blockedFor, onRecord, onRenew, onOpenPlayer }: Props) {
  const [view, setView] = useState<View>('geral');
  const [talk, setTalk] = useState<Row | null>(null);
  const split = save.split;
  const resolved = save.squad.map((sig) => ({ sig, f: findSigning(sig) })).filter((x) => x.f) as { sig: Signing; f: { player: Player } }[];
  const base = contractRows(save, split, resolved.map((x) => ({ id: x.sig.playerId, marketWage: playerWage(x.f.player) })));
  const rows: Row[] = base.map((r, i) => ({ ...r, p: resolved[i].f.player, age: ageOf(resolved[i].f.player) }));
  const diff: Difficulty = save.difficulty === 'hard' || save.difficulty === 'legend' ? save.difficulty : 'normal';
  const folha = rows.reduce((a, r) => a + r.wage, 0);
  const encargos = Math.round(folha * (DIFFICULTY_ECON[diff].salaryMul - 1));
  const staff = staffPayroll(save.gestao?.staff);
  const total = folha + encargos + staff;
  const market = rows.reduce((a, r) => a + r.marketWage, 0);
  const expiring = rows.filter((r) => r.expiring);
  const clauses = rows.filter((r) => r.terms?.releaseClause);
  const timeline = expiryTimeline(rows);
  const nickOf = (id: string) => rows.find((r) => r.playerId === id)?.p.nick ?? id;

  const leftCell = (r: Row) => {
    if (r.left == null) return <span className="ctr-dim">{ct('sem contrato')}</span>;
    const txt = r.left <= 0 ? ct('vencido') : r.left === 1 ? ct('último split') : `${r.left} splits`;
    return <span className={r.left <= 1 ? 'ctr-warn' : undefined}>{txt} <small className="ctr-dim">· S{r.terms!.until}</small></span>;
  };
  const vs = (r: Row) => {
    const pct = Math.round(r.vsMarket * 100);
    if (Math.abs(pct) < 3) return null;
    return <span className={`ctr-vs ${pct > 0 ? 'ctr-vs--up' : 'ctr-vs--down'}`}>{pct > 0 ? '+' : '−'}{Math.abs(pct)}% {ct('vs mercado')}</span>;
  };

  const cols: Column<Row>[] = [
    {
      key: 'who', header: ct('Jogador'), sort: (r) => r.p.nick.toLowerCase(),
      cell: (r) => (
        <button type="button" className="ctr-who elenco-who" onClick={() => onOpenPlayer?.(r.p)}>
          <Avatar name={r.p.nick} role={r.p.role} size={36} />
          <span className="ctr-who__txt"><b>{r.p.nick}</b><small><Flag cc={r.p.country} /> {r.p.role}</small></span>
        </button>
      ),
    },
    { key: 'age', header: ct('Idade'), num: true, sort: (r) => r.age, cell: (r) => r.age },
    { key: 'ovr', header: 'OVR', num: true, sort: (r) => playerOvr(r.p), cell: (r) => <Ovr value={playerOvr(r.p)} size="sm" /> },
    { key: 'status', header: ct('Status'), sort: (r) => r.terms?.statusPromise ?? '', cell: (r) => r.terms?.statusPromise ? <Tag tone="accent">{ct(STATUS_LABEL[r.terms.statusPromise])}</Tag> : <span className="ctr-dim">—</span> },
    {
      key: 'wage', header: ct('Salário/split'), num: true, sort: (r) => r.wage,
      cell: (r) => <span className="ctr-wage"><b>{formatMoney(r.wage)}</b> {vs(r)}</span>,
    },
    { key: 'market', header: ct('Mercado'), num: true, views: ['clausulas'], sort: (r) => r.marketWage, cell: (r) => formatMoney(r.marketWage) },
    { key: 'left', header: ct('Vence'), num: true, sort: (r) => r.left ?? 99, cell: leftCell },
    { key: 'clause', header: ct('Cláusula'), num: true, sort: (r) => r.terms?.releaseClause ?? Infinity, cell: (r) => r.terms?.releaseClause ? <span className="ctr-bad">{formatMoney(r.terms.releaseClause)}</span> : <span className="ctr-dim">{ct('sem')}</span> },
    { key: 'bonus', header: ct('Luvas'), num: true, views: ['clausulas'], sort: (r) => r.terms?.signingBonus ?? 0, cell: (r) => (r.terms?.signingBonus ? formatMoney(r.terms.signingBonus) : <span className="ctr-dim">—</span>) },
    { key: 'loyal', header: ct('Lealdade'), num: true, views: ['clausulas'], sort: (r) => r.terms?.loyaltyBonus ?? 0, cell: (r) => (r.terms?.loyaltyBonus ? formatMoney(r.terms.loyaltyBonus) : <span className="ctr-dim">—</span>) },
    {
      key: 'act', header: <span className="ds-sr-only">{ct('Ações')}</span>,
      cell: (r) => r.canRenew
        ? <Button size="sm" variant={r.expiring ? 'primary' : 'secondary'} icon={<FileSignature size={14} aria-hidden />} onClick={() => setTalk(r)}>{ct('Renovar')}</Button>
        : null,
    },
  ];

  const talkProfile = talk ? renewalProfileFor(talk.playerId) : null;

  return (
    <div className="em-tab ctr-tab">
      <div className="ctr-grid">
        <Panel icon={<Wallet size={16} />} title={`${ct('Contratos do elenco')} · ${save.org?.name ?? ''}`} tone="accent">
          <div className="ctr-stats">
            <Stat label={ct('Folha do elenco / split')} value={formatMoney(folha)} hint={`${ct('mercado')} ${formatMoney(market)}`} />
            <Stat label={ct('Encargos (dificuldade)')} value={formatMoney(encargos)} hint={diff === 'normal' ? ct('sem encargos') : ct('sobre a folha')} />
            <Stat label={ct('Comissão técnica')} value={formatMoney(staff)} />
            <Stat label={ct('Folha total / split')} value={formatMoney(total)} hint={sponsorIncome > 0 ? `${Math.round((total / sponsorIncome) * 100)}% ${ct('do patrocínio')}` : ct('sem patrocínio')} />
            <Stat label={ct('Vencem neste split')} value={expiring.length} hint={clauses.length ? `${clauses.length} ${ct('com cláusula ativa')}` : ct('nenhuma cláusula ativa')} />
          </div>
          <p className="ctr-note">
            {ct('O salário é o do contrato: fica fixo até você renovar. Renovação é negociada com o jogador (luvas, duração, cláusula, status). Proposta de outro clube que bate a cláusula não pode ser recusada.')}
          </p>
        </Panel>

        <Panel icon={<CalendarClock size={16} />} title={ct('Vencimentos')}>
          {timeline.length === 0 ? <p className="ctr-note">{ct('Nenhum contrato registrado.')}</p> : (
            <ul className="ctr-timeline">
              {timeline.map((g) => (
                <li key={g.until} className={`ctr-tl${g.until <= split ? ' ctr-tl--now' : ''}`}>
                  <span>{ct('Split')} {g.until}</span>
                  <span className="ctr-tl__who">{g.ids.map(nickOf).join(', ')}</span>
                  <b>{formatMoney(g.wage)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        icon={<FileSignature size={16} />}
        title={ct('Contratos')}
        flush
        actions={(
          <Segmented<View>
            label={ct('Visão de colunas')}
            value={view}
            onChange={setView}
            items={[{ value: 'geral', label: ct('Geral') }, { value: 'clausulas', label: ct('Cláusulas e bônus') }]}
          />
        )}
      >
        <Table<Row>
          columns={cols}
          rows={[...rows].sort((a, b) => (a.left ?? 99) - (b.left ?? 99) || b.wage - a.wage)}
          rowKey={(r) => r.playerId}
          view={view}
          caption={ct('Contratos do elenco')}
          empty={ct('Sem jogadores contratados.')}
        />
        <p className="ctr-note ctr-note--pad">{ct('Renovação antecipada: o jogador aceita conversar a partir de')} {RENEWAL_WINDOW} {ct('splits do fim do contrato.')}</p>
      </Panel>

      {talk && talkProfile && (
        <ContractNegotiationModal
          subject={{ id: talk.playerId, nick: talk.p.nick, name: talk.p.name, country: talk.p.country, role: talk.p.role, ovr: playerOvr(talk.p), age: talk.age, fromLabel: ct('Seu elenco') }}
          profile={talkProfile}
          budget={save.budget}
          payrollNow={folha - talk.wage}
          blocked={blockedFor(talk.playerId)}
          minTerm={Math.max(1, talk.left ?? 1)}
          onRecord={onRecord}
          onClose={() => setTalk(null)}
          onSigned={(terms) => { onRenew(talk.playerId, terms); setTalk(null); }}
        />
      )}
    </div>
  );
}
