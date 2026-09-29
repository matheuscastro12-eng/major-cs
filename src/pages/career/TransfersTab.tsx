// [fase 3 · frente MERCADO] Mercado › Transferências.
// Tela estilo FM: status da janela (aberta, janela curta, roster lock do Major),
// propostas recebidas pelos seus jogadores (aceitar, recusar, contrapropor,
// cláusula paga), rumores e o que a última janela movimentou; os rivais com
// caixa, estratégia e necessidades; a lista de alvos com a estratégia do clube
// dono; empréstimos e stand-ins; e a negociação (acordos para a próxima janela).
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Handshake, Inbox, Lock, Megaphone, Radar, Repeat, Search, Shield, UserMinus, UserPlus, Users } from 'lucide-react';
import {
  Panel, Table, Segmented, Button, Stat, Tag, Alert, EmptyState, Ovr, RoleChip, useToast, type Column, type TagTone,
} from '../../components/ds/index';
import { Flag } from '../../components/ui';
import type { Player, Role } from '../../types';
import type { ClubStrategy, IncomingOffer, MarketLoan, MarketState } from '../../engine/clube/model';
import type { ClubNeed } from '../../engine/clube/mercadoIA';
import {
  NEED_LABEL, ROLE_LABEL, STRATEGY_HINT, STRATEGY_LABEL, WILLING_LABEL, type CounterOutcome, type Willingness, type WindowStatus,
} from '../../engine/clube/mercado';
import { formatMoney } from '../../engine/ratings';
import { ct } from '../../state/career-i18n';
import '../../styles/transfers.css';

export interface OfferRow {
  offer: IncomingOffer;
  country: string;
  age: number;
  wage: number;
  value: number;
  willingness: Willingness;
  buyerTier: number;
}
export interface RivalRow {
  id: string; team: string; tag: string; tier: 1 | 2 | 3; country: string;
  strategy: ClubStrategy; budget: number; form: number; squadOvr: number; needs: ClubNeed[];
}
export interface TargetRow {
  player: Player; ovr: number; age: number;
  teamId: string; teamName: string; teamTag: string;
  strategy: ClubStrategy | null;   // null = mercado livre
  asking: number;
  sells: 'easy' | 'normal' | 'hard';
}
export interface SquadLoanRow { id: string; nick: string; role: Role; ovr: number; country: string }
export interface StandInRow { player: Player; ovr: number; age: number; teamId: string; teamName: string; teamTag: string; fee: number; bench: boolean }
export interface LoanRow { loan: MarketLoan; partner: string }

interface Props {
  split: number;
  budget: number;
  window: WindowStatus;
  market: MarketState;
  offers: OfferRow[];
  pendingSales: { playerId: string; nick: string; fee: number; toTag: string }[];
  rivals: RivalRow[];
  targets: TargetRow[];
  squad: SquadLoanRow[];
  squadSize: number;
  standIns: StandInRow[];
  loans: LoanRow[];
  loanClubsFor: (role: Role) => RivalRow[];
  loanFeeFor: (playerId: string) => number;
  standInOpen: boolean;              // stand-in só na janela curta (etapa 1)
  squadMax: number;                  // teto do elenco (frente G: 7)
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
  onCounter: (offerId: string, ask: number) => CounterOutcome;
  onCancelSale: (playerId: string) => void;
  onLoanOut: (playerId: string, toTeamId: string, splits: number) => void;
  onStandIn: (row: StandInRow) => void;
  onCancelLoan: (playerId: string) => void;
  onNegotiate: (nick: string) => void;
  negotiate: ReactNode;
  view: View;
  onView: (v: View) => void;
}

export type View = 'geral' | 'propostas' | 'rivais' | 'alvos' | 'emprestimos' | 'negociar';

const STRATEGY_TONE: Record<ClubStrategy, TagTone> = {
  starBuyer: 'achievement', youth: 'ct', national: 't', balanced: 'neutral', moneyball: 'epic', survival: 'loss',
};
const WILL_TONE: Record<Willingness, TagTone> = { eager: 'loss', open: 'warn', reluctant: 'win' };
const SELLS_LABEL: Record<TargetRow['sells'], string> = { easy: 'Vende fácil', normal: 'Negociável', hard: 'Difícil' };
const SELLS_TONE: Record<TargetRow['sells'], TagTone> = { easy: 'win', normal: 'neutral', hard: 'loss' };
const STATUS_LABEL: Record<IncomingOffer['status'], string> = {
  open: 'Aberta', accepted: 'Aceita', rejected: 'Recusada', countered: 'Contraproposta', expired: 'Expirou',
};
const ROLES: Role[] = ['AWP', 'IGL', 'Entry', 'Rifler', 'Support', 'Lurker'];

function StrategyTag({ s }: { s: ClubStrategy }) {
  return <Tag tone={STRATEGY_TONE[s]} title={ct(STRATEGY_HINT[s])}>{ct(STRATEGY_LABEL[s])}</Tag>;
}
function NeedChips({ needs }: { needs: ClubNeed[] }) {
  if (!needs.length) return <span className="mk-dim">{ct('Elenco fechado')}</span>;
  return (
    <span className="mk-needs">
      {needs.slice(0, 2).map((n) => (
        <span key={`${n.role}:${n.reason}`} className="mk-need" title={ct(NEED_LABEL[n.reason])}>
          <RoleChip role={n.role}>{n.role}</RoleChip>
          <small>{ct(NEED_LABEL[n.reason])}</small>
        </span>
      ))}
    </span>
  );
}
const pct = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.abs(Math.round((a / Math.max(1, b) - 1) * 100))}%`;

export function TransfersTab(p: Props) {
  const toast = useToast();
  const [ask, setAsk] = useState<Record<string, string>>({});
  const [rivalTier, setRivalTier] = useState<'1' | '2' | '3' | 'all'>('1');
  const [targetRole, setTargetRole] = useState<Role | 'all'>('all');
  const [targetQ, setTargetQ] = useState('');
  const [targetLimit, setTargetLimit] = useState(40);
  const [loanPick, setLoanPick] = useState<{ id: string; club: string; splits: number } | null>(null);
  const [standRole, setStandRole] = useState<Role | 'all'>('all');

  const locked = p.window.rosterLocked;
  const open = p.offers.filter((o) => o.offer.status === 'open' || o.offer.status === 'countered');
  const history = p.offers.filter((o) => !(o.offer.status === 'open' || o.offer.status === 'countered'));
  const lastWindow = p.market.windows?.[0];

  const doCounter = (o: OfferRow, raw: number) => {
    const out = p.onCounter(o.offer.id, raw);
    if (out === 'accepted') toast.success(`${o.offer.fromName} ${ct('aceitou')} ${formatMoney(raw)} ${ct('por')} ${o.offer.nick}`);
    else if (out === 'countered') toast.info(`${o.offer.fromName} ${ct('respondeu com a oferta final')}`);
    else toast.error(`${o.offer.fromName} ${ct('desistiu do negócio')}`);
    setAsk((a) => ({ ...a, [o.offer.id]: '' }));
  };

  const offerActions = (o: OfferRow) => {
    const st = o.offer.status;
    if (o.offer.viaReleaseClause) return <Tag tone="loss" icon={<Lock size={11} aria-hidden />}>{ct('Cláusula paga')}</Tag>;
    if (st !== 'open' && st !== 'countered') return <Tag tone={st === 'accepted' ? 'win' : 'neutral'}>{ct(STATUS_LABEL[st])}</Tag>;
    const v = ask[o.offer.id] ?? '';
    const presets = [1.15, 1.3].map((m) => Math.round((o.offer.fee * m) / 10_000) * 10_000);
    return (
      <div className="mk-actions" onClick={(e) => e.stopPropagation()}>
        <span className="mk-actions__main">
          {st === 'countered' && <small className="mk-dim">{ct('Oferta final do clube')}</small>}
          <Button size="sm" variant="primary" onClick={() => p.onAccept(o.offer.id)}>{ct('Aceitar')}</Button>
          <Button size="sm" variant="ghost" onClick={() => p.onReject(o.offer.id)}>{ct('Recusar')}</Button>
        </span>
        {st === 'open' && (
          <span className="mk-counter">
            <small className="mk-dim">{ct('Pedir')}</small>
            {presets.map((x) => (
              <button key={x} type="button" className="mk-preset" onClick={() => doCounter(o, x)} title={ct('Contraproposta')}>{formatMoney(x)}</button>
            ))}
            <input
              className="mk-ask" inputMode="numeric" aria-label={ct('Contraproposta em milhares')} placeholder={ct('outro (k)')}
              value={v} onChange={(e) => setAsk((a) => ({ ...a, [o.offer.id]: e.target.value.replace(/[^0-9]/g, '') }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && v) doCounter(o, Number(v) * 1000); }}
            />
            <Button size="sm" disabled={!v} onClick={() => doCounter(o, Number(v) * 1000)}>{ct('Contrapropor')}</Button>
          </span>
        )}
      </div>
    );
  };

  const offerCols: Column<OfferRow>[] = [
    {
      key: 'who', header: ct('Jogador'), sort: (o) => o.offer.nick ?? '',
      cell: (o) => (
        <span className="mk-who">
          <Ovr value={o.offer.ovr ?? 0} size="sm" />
          <span className="mk-who__txt"><b><Flag cc={o.country} /> {o.offer.nick}</b><small>{o.offer.role} · {o.age} {ct('anos')}</small></span>
        </span>
      ),
    },
    {
      key: 'club', header: ct('Clube'), sort: (o) => o.offer.fromName ?? '',
      cell: (o) => (
        <span className="mk-club"><b>{o.offer.fromName}</b><small>T{o.buyerTier} · {o.offer.strategy ? ct(STRATEGY_LABEL[o.offer.strategy]) : ''}{o.offer.reason ? ` · ${ct(NEED_LABEL[o.offer.reason])}` : ''}</small></span>
      ),
    },
    {
      key: 'fee', header: ct('Taxa'), num: true, sort: (o) => o.offer.fee,
      cell: (o) => (
        <span className="mk-fee"><b>{formatMoney(o.offer.fee)}</b><small>{ct('valor')} {formatMoney(o.value)} · {pct(o.offer.fee, o.value)}</small></span>
      ),
    },
    {
      key: 'wage', header: ct('Salário oferecido'), num: true, sort: (o) => o.offer.wageOffered ?? 0,
      cell: (o) => <span className="mk-fee"><b>{formatMoney(o.offer.wageOffered ?? o.wage)}</b><small>{ct('hoje')} {formatMoney(o.wage)} · {pct(o.offer.wageOffered ?? o.wage, o.wage)}</small></span>,
    },
    { key: 'will', header: ct('Vontade'), cell: (o) => <Tag tone={WILL_TONE[o.willingness]}>{ct(WILLING_LABEL[o.willingness])}</Tag> },
    { key: 'act', header: <span className="ds-sr-only">{ct('Ações')}</span>, cell: offerActions },
  ];

  const offerList = (rows: OfferRow[], empty: string) => (
    <>
      <Table<OfferRow> tall columns={offerCols} rows={rows} rowKey={(o) => o.offer.id} caption={ct('Propostas pelos seus jogadores')} empty={empty} className="mk-table mk-offers" />
      <div className="mk-cards">
        {rows.length === 0 && <p className="mk-dim mk-pad">{empty}</p>}
        {rows.map((o) => (
          <div key={o.offer.id} className="mk-card">
            <div className="mk-card__top">
              <span className="mk-who"><Ovr value={o.offer.ovr ?? 0} size="sm" /><span className="mk-who__txt"><b><Flag cc={o.country} /> {o.offer.nick}</b><small>{o.offer.role} · {o.age} {ct('anos')}</small></span></span>
              <Tag tone={WILL_TONE[o.willingness]}>{ct(WILLING_LABEL[o.willingness])}</Tag>
            </div>
            <div className="mk-card__row"><span>{o.offer.fromName} · T{o.buyerTier}</span>{o.offer.strategy && <StrategyTag s={o.offer.strategy} />}</div>
            <div className="mk-card__row"><span>{ct('Taxa')}</span><b>{formatMoney(o.offer.fee)} <small>({pct(o.offer.fee, o.value)})</small></b></div>
            <div className="mk-card__row"><span>{ct('Salário oferecido')}</span><b>{formatMoney(o.offer.wageOffered ?? o.wage)} <small>({pct(o.offer.wageOffered ?? o.wage, o.wage)})</small></b></div>
            {offerActions(o)}
          </div>
        ))}
      </div>
    </>
  );

  // ── rivais ──
  const rivals = useMemo(
    () => p.rivals.filter((r) => rivalTier === 'all' || String(r.tier) === rivalTier).sort((a, b) => b.budget - a.budget),
    [p.rivals, rivalTier],
  );
  const rivalCols: Column<RivalRow>[] = [
    { key: 'team', header: ct('Clube'), sort: (r) => r.team, cell: (r) => <span className="mk-club"><b><Flag cc={r.country} /> {r.team}</b><small>{r.tag} · T{r.tier}</small></span> },
    { key: 'str', header: ct('Estratégia'), sort: (r) => r.strategy, cell: (r) => <StrategyTag s={r.strategy} /> },
    { key: 'bud', header: ct('Caixa'), num: true, sort: (r) => r.budget, cell: (r) => formatMoney(r.budget) },
    { key: 'ovr', header: ct('Elenco'), num: true, sort: (r) => r.squadOvr, cell: (r) => r.squadOvr.toFixed(1) },
    { key: 'form', header: ct('Forma'), num: true, sort: (r) => r.form, cell: (r) => <span className={r.form >= 55 ? 'mk-up' : r.form < 40 ? 'mk-down' : undefined}>{r.form}</span> },
    { key: 'need', header: ct('Procura'), cell: (r) => <NeedChips needs={r.needs} /> },
  ];

  // ── alvos ──
  const targets = useMemo(() => {
    const q = targetQ.trim().toLowerCase();
    return p.targets.filter((t) => (targetRole === 'all' || t.player.role === targetRole || t.player.role2 === targetRole)
      && (!q || t.player.nick.toLowerCase().includes(q) || t.teamName.toLowerCase().includes(q)));
  }, [p.targets, targetRole, targetQ]);
  const targetCols: Column<TargetRow>[] = [
    {
      key: 'who', header: ct('Jogador'), sort: (t) => t.player.nick.toLowerCase(),
      cell: (t) => <span className="mk-who"><Ovr value={t.ovr} size="sm" /><span className="mk-who__txt"><b><Flag cc={t.player.country} /> {t.player.nick}</b><small>{t.player.role} · {t.age} {ct('anos')}</small></span></span>,
    },
    { key: 'ovr', header: 'OVR', num: true, sort: (t) => t.ovr, cell: (t) => t.ovr },
    { key: 'club', header: ct('Clube dono'), sort: (t) => t.teamName, cell: (t) => <span className="mk-club"><b>{t.teamName}</b><small>{t.teamTag}</small></span> },
    { key: 'str', header: ct('Estratégia do dono'), cell: (t) => (t.strategy ? <StrategyTag s={t.strategy} /> : <Tag tone="win">{ct('Livre')}</Tag>) },
    { key: 'sell', header: ct('Venda'), sort: (t) => ({ easy: 0, normal: 1, hard: 2 })[t.sells], cell: (t) => <Tag tone={SELLS_TONE[t.sells]}>{ct(SELLS_LABEL[t.sells])}</Tag> },
    { key: 'ask', header: ct('Pedida'), num: true, sort: (t) => t.asking, cell: (t) => (t.asking > 0 ? formatMoney(t.asking) : ct('Só salário')) },
    { key: 'go', header: <span className="ds-sr-only">{ct('Ações')}</span>, cell: (t) => <Button size="sm" onClick={(e) => { e.stopPropagation(); p.onNegotiate(t.player.nick); }}>{ct('Negociar')}</Button> },
  ];

  // ── empréstimos ──
  const standIns = p.standIns.filter((s) => standRole === 'all' || s.player.role === standRole).slice(0, 12);
  const loanClubs = loanPick ? p.loanClubsFor(p.squad.find((x) => x.id === loanPick.id)?.role ?? 'Rifler') : [];
  const loanCols: Column<LoanRow>[] = [
    { key: 'who', header: ct('Jogador'), cell: (l) => <b>{l.loan.nick}</b> },
    { key: 'kind', header: ct('Tipo'), cell: (l) => <Tag tone={l.loan.kind === 'out' ? 'ct' : 't'}>{l.loan.kind === 'out' ? ct('Emprestado por você') : ct('Stand-in')}</Tag> },
    { key: 'with', header: ct('Clube'), cell: (l) => l.partner },
    { key: 'st', header: ct('Situação'), cell: (l) => (l.loan.state === 'agreed' ? <Tag tone="warn">{ct('Entra na próxima janela')}</Tag> : <span>{ct('Até o fim do Split')} {l.loan.untilSplit}</span>) },
    { key: 'fee', header: ct('Taxa'), num: true, cell: (l) => formatMoney(l.loan.fee ?? 0) },
    { key: 'x', header: <span className="ds-sr-only">{ct('Ações')}</span>, cell: (l) => (l.loan.state === 'agreed' ? <Button size="sm" variant="ghost" onClick={() => p.onCancelLoan(l.loan.playerId)}>{ct('Cancelar')}</Button> : null) },
  ];

  const statusTone = locked ? 'loss' : p.window.kind === 'mid' ? 'win' : 'warn';
  const header = (
    <Panel icon={<ArrowLeftRight size={16} />} title={ct('Transferências')} tone="accent" className="mk-summary"
      actions={<Tag tone={statusTone} icon={locked ? <Lock size={11} aria-hidden /> : undefined}>{p.window.label}</Tag>}>
      <p className="mk-note">{p.window.detail}</p>
      <div className="mk-stats">
        <Stat label={ct('Caixa')} value={formatMoney(p.budget)} />
        <Stat label={ct('Propostas abertas')} value={open.length} hint={open.length ? ct('responda antes da janela') : ct('nenhuma agora')} />
        <Stat label={ct('Saídas acertadas')} value={p.pendingSales.length} hint={p.pendingSales.length ? formatMoney(p.pendingSales.reduce((a, s) => a + s.fee, 0)) : ct('ninguém saindo')} />
        <Stat label={ct('Última janela')} value={lastWindow ? `${lastWindow.moves}` : '—'} hint={lastWindow ? `${lastWindow.chains} ${ct('em cadeia')} · ${lastWindow.standIns} ${ct('stand-in(s)')}` : ct('o mercado ainda não abriu')} />
      </div>
    </Panel>
  );

  return (
    <div className="em-tab mk-tab">
      {header}
      <Segmented<View>
        className="mk-views"
        label={ct('Seção do mercado')}
        value={p.view}
        onChange={p.onView}
        items={[
          { value: 'geral', label: ct('Visão geral') },
          { value: 'propostas', label: ct('Propostas'), count: open.length || undefined },
          { value: 'rivais', label: ct('Rivais') },
          { value: 'alvos', label: ct('Alvos') },
          { value: 'emprestimos', label: ct('Empréstimos') },
          { value: 'negociar', label: ct('Negociar') },
        ]}
      />

      {p.view === 'geral' && (
        <div className="mk-grid">
          <Panel icon={<Inbox size={16} />} title={ct('Propostas pelos seus jogadores')} flush className="mk-span2"
            actions={history.length ? <Button size="sm" variant="ghost" onClick={() => p.onView('propostas')}>{ct('Histórico')}</Button> : undefined}>
            {locked && <Alert tone="warn" title={ct('Roster lock')}>{ct('Durante o lock nenhum clube faz proposta. Você ainda pode responder as abertas: a saída acontece depois do Major.')}</Alert>}
            {offerList(open, ct('Nenhuma proposta aberta. Elas chegam nas janelas, quando um clube precisa da função do seu jogador e tem caixa.'))}
            {p.pendingSales.length > 0 && (
              <ul className="mk-sales">
                {p.pendingSales.map((s) => (
                  <li key={s.playerId}>
                    <span><b>{s.nick}</b> → {s.toTag}</span>
                    <b className="mk-up">{formatMoney(s.fee)}</b>
                    <Button size="sm" variant="ghost" onClick={() => p.onCancelSale(s.playerId)}>{ct('Desfazer')}</Button>
                  </li>
                ))}
                <li className="mk-dim">{ct('Vendas acertadas: o jogador joga até a próxima janela e aí sai (a taxa entra no caixa).')}</li>
              </ul>
            )}
          </Panel>
          <Panel icon={<Megaphone size={16} />} title={ct('Rumores')} flush>
            {p.market.rumors.length === 0
              ? <EmptyState icon={<Radar size={20} />} title={ct('Mercado calmo')}>{ct('Os rumores aparecem a cada janela.')}</EmptyState>
              : (
                <ul className="mk-rumors">
                  {p.market.rumors.slice(0, 10).map((r, i) => (
                    <li key={`${r.split}:${i}`}><small>Split {r.split}</small><span>{r.text}</span></li>
                  ))}
                </ul>
              )}
          </Panel>
          <Panel icon={<Repeat size={16} />} title={lastWindow ? `${ct('Última janela')} · Split ${lastWindow.split} · ${lastWindow.kind === 'mid' ? ct('curta') : lastWindow.kind === 'boot' ? ct('abertura') : ct('pré-temporada')}` : ct('Última janela')} flush>
            {!lastWindow?.items?.length
              ? <EmptyState icon={<Repeat size={20} />} title={ct('Sem movimentos ainda')}>{ct('A primeira janela abre depois da etapa 1.')}</EmptyState>
              : (
                <ul className="mk-moves">
                  {lastWindow.items.slice(0, 12).map((m, i) => (
                    <li key={`${m.nick}:${i}`}>
                      <Flag cc={m.cc} /> <b>{m.nick}</b>
                      <span className="mk-dim">{m.from} → <b>{m.to}</b></span>
                      {m.chain && <Tag tone="epic">{ct('cadeia')}</Tag>}
                      <small>{m.reason ? ct(m.reason) : ''}</small>
                      <span className="mk-fee-inline">{m.fee > 0 ? formatMoney(m.fee) : ct('livre')}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Panel>
        </div>
      )}

      {p.view === 'propostas' && (
        <Panel icon={<Inbox size={16} />} title={ct('Propostas pelos seus jogadores')} flush>
          <p className="mk-note mk-pad">{ct('Aceitar vende na próxima janela. Recusar quem quer ir custa moral. Contrapropor: o clube aceita até o teto dele, responde uma vez com a oferta final se você pedir um pouco mais, e desiste se você exagerar. Proposta que paga a cláusula de rescisão não pode ser recusada — quem decide é o jogador.')}</p>
          {offerList([...open, ...history], ct('Nenhuma proposta ainda.'))}
        </Panel>
      )}

      {p.view === 'rivais' && (
        <Panel icon={<Shield size={16} />} title={ct('Orçamento e estratégia dos rivais')} flush
          actions={(
            <Segmented<'1' | '2' | '3' | 'all'> label={ct('Filtrar por tier')} value={rivalTier} onChange={setRivalTier}
              items={[{ value: '1', label: 'Tier 1' }, { value: '2', label: 'Tier 2' }, { value: '3', label: 'Tier 3' }, { value: 'all', label: ct('Todos') }]} />
          )}>
          <p className="mk-note mk-pad">{ct('Caixa de transferência recalculado a cada split (tier, ranking VRS, premiação do elenco e patrocínio). A estratégia diz como o clube compra e vende; "Procura" são as necessidades por função que ele leva à próxima janela.')}</p>
          <Table<RivalRow> tall columns={rivalCols} rows={rivals.slice(0, 60)} rowKey={(r) => r.id} caption={ct('Rivais')} defaultSort={{ key: 'bud', dir: 'desc' }} className="mk-table" empty={ct('Nenhum clube neste tier.')} />
        </Panel>
      )}

      {p.view === 'alvos' && (
        <Panel icon={<Search size={16} />} title={ct('Alvos no mercado')} flush
          actions={(
            <div className="mk-filters">
              <input className="mk-search" aria-label={ct('Buscar jogador ou time')} placeholder={ct('Buscar jogador ou time…')} value={targetQ} onChange={(e) => { setTargetQ(e.target.value); setTargetLimit(40); }} />
              <select className="mk-select" aria-label={ct('Filtrar por função')} value={targetRole} onChange={(e) => { setTargetRole(e.target.value as Role | 'all'); setTargetLimit(40); }}>
                <option value="all">{ct('Todas as funções')}</option>
                {ROLES.map((r) => <option key={r} value={r}>{ct(ROLE_LABEL[r])}</option>)}
              </select>
            </div>
          )}>
          <p className="mk-note mk-pad">{ct('A estratégia do clube dono diz quanto custa tirar o jogador: clube em sobrevivência vende fácil, quem compra estrelas segura o núcleo, e contrato longo tem multa.')}</p>
          <Table<TargetRow> tall columns={targetCols} rows={targets.slice(0, targetLimit)} rowKey={(t) => t.player.id} caption={ct('Alvos')} defaultSort={{ key: 'ovr', dir: 'desc' }} className="mk-table" empty={ct('Nenhum jogador com esse filtro.')} />
          {targets.length > targetLimit && (
            <div className="mk-more"><Button size="sm" onClick={() => setTargetLimit((n) => n + 40)}>{ct('Carregar mais')} (+40)</Button></div>
          )}
        </Panel>
      )}

      {p.view === 'emprestimos' && (
        <div className="mk-grid">
          <Panel icon={<UserMinus size={16} />} title={ct('Emprestar um jogador')} className="mk-loan">
            <p className="mk-note">{ct('O jogador joga pelo outro clube e volta no fim do empréstimo. O clube paga 10% do valor e o salário dele sai da sua folha. Só com mais de 5 no elenco.')}</p>
            {locked ? <Alert tone="warn">{ct('Roster lock: empréstimos só depois do Major.')}</Alert>
              : p.squadSize <= 5 ? <Alert tone="info">{ct('Seu elenco tem 5: traga um stand-in ou contrate antes de emprestar.')}</Alert>
                : (
                  <div className="mk-form">
                    <label>
                      <span>{ct('Jogador')}</span>
                      <select className="mk-select" value={loanPick?.id ?? ''} onChange={(e) => setLoanPick(e.target.value ? { id: e.target.value, club: '', splits: 1 } : null)}>
                        <option value="">{ct('Escolha…')}</option>
                        {p.squad.map((s) => <option key={s.id} value={s.id}>{s.nick} · {s.role} · {s.ovr}</option>)}
                      </select>
                    </label>
                    {loanPick && (
                      <>
                        <label>
                          <span>{ct('Clube (quem precisa da função)')}</span>
                          <select className="mk-select" value={loanPick.club} onChange={(e) => setLoanPick({ ...loanPick, club: e.target.value })}>
                            <option value="">{ct('Escolha…')}</option>
                            {loanClubs.map((c) => <option key={c.id} value={c.id}>{c.team} · T{c.tier} · {ct(STRATEGY_LABEL[c.strategy])}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>{ct('Duração')}</span>
                          <select className="mk-select" value={loanPick.splits} onChange={(e) => setLoanPick({ ...loanPick, splits: Number(e.target.value) })}>
                            <option value={1}>{ct('1 split')}</option>
                            <option value={2}>{ct('2 splits')}</option>
                          </select>
                        </label>
                        <div className="mk-form__foot">
                          <span>{ct('Taxa a receber')}: <b className="mk-up">{formatMoney(p.loanFeeFor(loanPick.id))}</b></span>
                          <Button variant="primary" size="sm" disabled={!loanPick.club} onClick={() => { p.onLoanOut(loanPick.id, loanPick.club, loanPick.splits); setLoanPick(null); toast.success(ct('Empréstimo acertado: vale na próxima janela')); }}>{ct('Acertar empréstimo')}</Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
          </Panel>
          <Panel icon={<UserPlus size={16} />} title={ct('Trazer um stand-in')} flush className="mk-standin"
            actions={(
              <select className="mk-select" aria-label={ct('Filtrar por função')} value={standRole} onChange={(e) => setStandRole(e.target.value as Role | 'all')}>
                <option value="all">{ct('Todas as funções')}</option>
                {ROLES.map((r) => <option key={r} value={r}>{ct(ROLE_LABEL[r])}</option>)}
              </select>
            )}>
            <p className="mk-note mk-pad">{ct('Stand-in emprestado: entra na janela curta (depois da etapa 1), cobre lesão ou vira titular, e volta ao clube dono no fim do split. Você paga 15% do valor e o salário no período.')}</p>
            {locked ? <div className="mk-pad"><Alert tone="warn">{ct('Roster lock: sem stand-in até o fim do Major.')}</Alert></div>
              : p.squadSize >= p.squadMax ? <div className="mk-pad"><Alert tone="info">{ct('Elenco cheio (7): libere uma vaga antes de trazer um stand-in.')}</Alert></div>
                : !p.standInOpen ? <div className="mk-pad"><Alert tone="info">{ct('A janela curta deste split já passou. Stand-in acertado agora entra na janela curta do próximo split.')}</Alert></div> : null}
            <ul className="mk-standins">
              {standIns.map((s) => (
                <li key={s.player.id}>
                  <span className="mk-who"><Ovr value={s.ovr} size="sm" /><span className="mk-who__txt"><b><Flag cc={s.player.country} /> {s.player.nick}</b><small>{s.player.role} · {s.age} {ct('anos')} · {s.teamName}{s.bench ? ` · ${ct('reserva')}` : ''}</small></span></span>
                  <span className="mk-fee-inline">{formatMoney(s.fee)}</span>
                  <Button size="sm" disabled={locked || p.squadSize >= p.squadMax || p.loans.some((l) => l.loan.playerId === s.player.id)} onClick={() => { p.onStandIn(s); toast.success(`${ct('Stand-in acertado:')} ${s.player.nick}`); }}>{ct('Acertar')}</Button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel icon={<Handshake size={16} />} title={ct('Seus empréstimos')} flush className="mk-span2">
            <Table<LoanRow> columns={loanCols} rows={p.loans} rowKey={(l) => l.loan.playerId} caption={ct('Empréstimos')} empty={ct('Nenhum empréstimo.')} className="mk-table" />
          </Panel>
        </div>
      )}

      {p.view === 'negociar' && (
        <div className="mk-nego">
          {locked && <Alert tone="warn" title={ct('Roster lock')}>{ct('Você pode fechar acordos, mas eles só entram na janela de pré-temporada, depois do Major.')}</Alert>}
          {p.negotiate}
        </div>
      )}
      <p className="mk-foot"><Users size={12} aria-hidden /> {ct('Janelas: pré-temporada no fim do split e janela curta depois da etapa 1. No split de Major, roster lock a partir da etapa 3.')}</p>
    </div>
  );
}
