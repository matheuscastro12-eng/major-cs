// [fase 3 · frente CONTRATOS] Negociação de contrato estilo FM, com o jogador
// (ou o agente dele): termos lado a lado com a exigência, paciência, rodada,
// resposta com o porquê. Serve contratação (depois do acordo com o clube
// dono, ou direto com free agent) e renovação. A regra mora em
// engine/clube/contratos.ts; esta tela só mostra e manda a proposta.
import { useMemo, useState, type ReactNode } from 'react';
import { Check, FileSignature, Handshake, X } from 'lucide-react';
import { Modal, Button, ProgressBar, Segmented, Avatar, Ovr, RoleChip, Alert, Tag } from '../ds/index';
import { Flag } from '../ui';
import {
  openPlayerNegotiation, playerNegotiationStep, currentDemand, offerIssues, rivalWage, termsFromOffer, offerFromDemand,
  statusPlayTimeExpectation, issueText, SQUAD_STATUSES, STATUS_LABEL, CONTRACT_TERM_MIN, CONTRACT_TERM_MAX,
  type NegoProfile, type Offer, type PlayerReply, type Issue,
} from '../../engine/clube/contratos';
import type { ContractTerms, Negotiation, SquadStatus } from '../../engine/clube/model';
import { formatMoney } from '../../engine/ratings';
import { ct } from '../../state/career-i18n';
import type { Role } from '../../types';
import '../../styles/contratos.css';

export interface ContractNegoSubject {
  id: string;
  nick: string;
  name?: string;
  country: string;
  role: Role;
  ovr: number;
  age: number;
  /** "Free agent", "NAVI", "Seu elenco"… */
  fromLabel?: string;
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r5k = (v: number) => Math.round(v / 5000) * 5000;

export function ContractNegotiationModal({
  subject, profile, budget, payrollNow, blocked, stepLabel, minTerm = CONTRACT_TERM_MIN, onClose, onSigned, onRecord,
}: {
  subject: ContractNegoSubject;
  profile: NegoProfile;
  /** caixa disponível para as luvas */
  budget: number;
  /** folha base atual SEM este jogador (para mostrar a folha depois) */
  payrollNow: number;
  /** conversa rompida neste split: a tela só explica */
  blocked?: Negotiation | null;
  /** ex.: "Etapa 2 de 2 · contrato com o jogador" */
  stepLabel?: string;
  /** duração mínima (renovação antecipada não encurta o contrato atual) */
  minTerm?: number;
  onClose: () => void;
  onSigned: (terms: ContractTerms, nego: Negotiation) => void;
  /** grava conversa rompida/expirada (bloqueia até o próximo split) */
  onRecord?: (nego: Negotiation) => void;
}) {
  const opened = useMemo(() => openPlayerNegotiation(profile), [profile]);
  const [nego, setNego] = useState<Negotiation>(opened.nego);
  const [reply, setReply] = useState<PlayerReply | null>(null);
  const demand = currentDemand(profile, nego);
  const isRenewal = profile.kind === 'renewal';
  // proposta inicial: abaixo do pedido (renovação: o salário atual), duração pedida
  const [offer, setOffer] = useState<Offer>(() => ({
    wage: Math.max(20_000, r5k(isRenewal && profile.current?.wage ? profile.current.wage : Math.min(profile.marketWage, opened.demand.terms.wage) * 0.95)),
    term: Math.max(minTerm, opened.demand.term),
    // renovação: começa com 1 salário de luvas (o custo normal de renovar)
    signingBonus: isRenewal ? r5k(profile.current?.wage || profile.marketWage) : 0,
    releaseClause: null,
    statusPromise: opened.demand.wantedStatus,
    loyaltyBonus: 0,
  }));
  const set = (patch: Partial<Offer>) => { setOffer((o) => ({ ...o, ...patch })); };
  const issues = new Set<Issue>(offerIssues(demand, offer));
  const agent = demand.agent;
  const closed = nego.status !== 'open';
  const refused = blocked
    ? (blocked.status === 'expired' ? ct('As rodadas acabaram neste split. Ele volta a conversar no próximo.') : ct('Ele rompeu as negociações neste split. Tente de novo no próximo.'))
    : opened.refused;
  const overBudget = offer.signingBonus > budget;

  const propose = (o: Offer) => {
    if (closed || o.signingBonus > budget) return;
    const r = playerNegotiationStep(profile, nego, o);
    setNego(r.nego);
    setReply(r.reply);
    if (r.nego.status === 'rejected' || r.nego.status === 'expired') onRecord?.(r.nego);
  };
  const matchDemand = () => {
    const d = offerFromDemand(demand, profile.split);
    const o = { ...d, term: Math.max(minTerm, d.term) };
    setOffer(o);
    propose(o);
  };

  const wageMax = Math.max(r5k(demand.terms.wage * 2), 100_000);
  const bonusMax = Math.max(r5k(Math.max(demand.terms.signingBonus ?? 0, offer.wage) * 2.5), 50_000);
  const clauseMin = r5k(profile.marketValue * 0.5), clauseMax = r5k(profile.marketValue * 4);
  const totalNow = offer.signingBonus;
  const totalContract = offer.wage * offer.term + offer.signingBonus + offer.loyaltyBonus;
  const payrollAfter = payrollNow + offer.wage;
  const tone = nego.patience > 55 ? 'win' : nego.patience > 25 ? 'warn' : 'loss';
  const mood = nego.patience > 70 ? ct('Tranquilo') : nego.patience > 45 ? ct('Atento') : nego.patience > 20 ? ct('Impaciente') : ct('No limite');

  const ok = (i: Issue) => !issues.has(i);
  const mark = (good: boolean) => good
    ? <span className="cn-mark cn-mark--ok" aria-label={ct('atende')}><Check size={14} aria-hidden /></span>
    : <span className="cn-mark cn-mark--no" aria-label={ct('abaixo do pedido')}><X size={14} aria-hidden /></span>;

  const statusItems = SQUAD_STATUSES.filter((s) => s !== 'prospect' || profile.age <= 21);

  const row = (label: string, hint: string | null, control: ReactNode, want: ReactNode, good: boolean | null) => (
    <div className="cn-row">
      <div className="cn-row__label"><b>{label}</b>{hint && <small>{hint}</small>}</div>
      <div className="cn-row__ctl">{control}</div>
      <div className="cn-row__want">
        <span className="cn-row__wantlbl">{ct('Pede')}</span>
        <b>{want}</b>
        {good != null && !closed && mark(good)}
      </div>
    </div>
  );

  const footer = refused ? (
    <Button variant="primary" onClick={onClose}>{ct('Fechar')}</Button>
  ) : nego.status === 'accepted' ? (
    <>
      <Button variant="ghost" onClick={onClose}>{ct('Desistir')}</Button>
      <Button
        variant="primary"
        icon={<FileSignature size={16} aria-hidden />}
        disabled={(nego.offer.signingBonus ?? 0) > budget}
        onClick={() => onSigned(termsFromOffer(offer, profile.split), nego)}
      >
        {ct('Assinar contrato')}{totalNow > 0 ? ` · ${formatMoney(totalNow)} ${ct('de luvas')}` : ''}
      </Button>
    </>
  ) : closed ? (
    <Button variant="primary" onClick={onClose}>{ct('Fechar')}</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>{ct('Abandonar')}</Button>
      <Button onClick={matchDemand} disabled={(demand.terms.signingBonus ?? 0) > budget}>{ct('Aceitar exigência')}</Button>
      <Button variant="primary" icon={<Handshake size={16} aria-hidden />} disabled={overBudget} onClick={() => propose(offer)}>
        {ct('Propor')}
      </Button>
    </>
  );

  return (
    <Modal open onClose={onClose} size="lg" title={isRenewal ? ct('Renovação de contrato') : ct('Negociação de contrato')} footer={<div className="cn-foot">{footer}</div>}>
      <div className="cn">
        {stepLabel && <div className="cn-step">{stepLabel}</div>}
        <header className="cn-head">
          <Avatar name={subject.nick} role={subject.role} size={52} />
          <div className="cn-head__who">
            <div className="cn-head__name">
              <Flag cc={subject.country} /> <b>{subject.nick}</b> <RoleChip role={subject.role} /> <Ovr value={subject.ovr} />
            </div>
            <small>
              {subject.age} {ct('anos')}{subject.fromLabel ? ` · ${subject.fromLabel}` : ''} · {agent.has
                ? <>{ct('Agente')}: <b>{agent.style === 'hard' ? ct('linha-dura') : ct('negociador')}</b></>
                : ct('Sem agente: negocia direto')}
            </small>
          </div>
          {!refused && (
            <div className="cn-head__round">
              <span className="ds-eyebrow">{ct('Rodada')}</span>
              <b>{Math.min(nego.round, nego.maxRounds)}/{nego.maxRounds}</b>
            </div>
          )}
        </header>

        {refused ? (
          <Alert tone="danger" title={ct('Não quer negociar')}>{refused}</Alert>
        ) : (
          <>
            <div className="cn-patience">
              <ProgressBar value={nego.patience} tone={tone} label={`${ct('Paciência')} · ${mood}`} valueText={`${nego.patience}/100`} />
            </div>

            <div className="cn-terms" role="group" aria-label={ct('Termos do contrato')}>
              <div className="cn-terms__head" aria-hidden>
                <span>{ct('Termo')}</span><span>{ct('Sua proposta')}</span><span>{ct('Exigência')}</span>
              </div>
              {row(ct('Salário por split'), `${ct('mercado')} ${formatMoney(profile.marketWage)}`,
                <div className="cn-money">
                  <input type="range" min={20_000} max={wageMax} step={5000} value={clampN(offer.wage, 20_000, wageMax)} disabled={closed}
                    aria-label={ct('Salário por split')} onChange={(e) => set({ wage: Number(e.target.value) })} />
                  <b className="cn-num">{formatMoney(offer.wage)}</b>
                </div>,
                formatMoney(demand.terms.wage), ok('wage'))}
              {row(ct('Duração'), `${ct('termina no split')} ${profile.split + offer.term - 1}`,
                <Segmented<string>
                  label={ct('Duração do contrato')}
                  value={String(offer.term)}
                  onChange={(v) => { if (!closed) set({ term: Number(v) }); }}
                  items={Array.from({ length: CONTRACT_TERM_MAX - minTerm + 1 }, (_, i) => ({ value: String(i + minTerm), label: String(i + minTerm) }))}
                />,
                `${demand.term} ${ct('splits')}`, ok('term'))}
              {row(ct('Luvas'), ct('pagas na assinatura'),
                <div className="cn-money">
                  <input type="range" min={0} max={bonusMax} step={5000} value={clampN(offer.signingBonus, 0, bonusMax)} disabled={closed}
                    aria-label={ct('Luvas')} onChange={(e) => set({ signingBonus: Number(e.target.value) })} />
                  <b className={`cn-num${overBudget ? ' cn-num--bad' : ''}`}>{formatMoney(offer.signingBonus)}</b>
                </div>,
                formatMoney(demand.terms.signingBonus ?? 0), ok('bonus'))}
              {row(ct('Cláusula de rescisão'), ct('proposta ≥ cláusula: você não pode recusar'),
                <div className="cn-money">
                  <label className="cn-check">
                    <input type="checkbox" checked={offer.releaseClause != null} disabled={closed}
                      onChange={(e) => set({ releaseClause: e.target.checked ? r5k(demand.maxClause ?? profile.marketValue * 2) : null })} />
                    {ct('Incluir')}
                  </label>
                  {offer.releaseClause != null && (
                    <>
                      <input type="range" min={clauseMin} max={clauseMax} step={10000} value={clampN(offer.releaseClause, clauseMin, clauseMax)} disabled={closed}
                        aria-label={ct('Cláusula de rescisão')} onChange={(e) => set({ releaseClause: Number(e.target.value) })} />
                      <b className="cn-num">{formatMoney(offer.releaseClause)}</b>
                    </>
                  )}
                </div>,
                demand.maxClause != null ? `≤ ${formatMoney(demand.maxClause)}` : ct('indiferente'), demand.maxClause != null ? ok('clause') : null)}
              {row(ct('Status no elenco'), offer.statusPromise ? `${ct('espera jogar')} ~${Math.round(statusPlayTimeExpectation(offer.statusPromise) * 100)}% ${ct('dos mapas')}` : null,
                <select className="cn-select" value={offer.statusPromise ?? ''} disabled={closed} aria-label={ct('Status prometido')}
                  onChange={(e) => set({ statusPromise: (e.target.value || null) as SquadStatus | null })}>
                  {statusItems.map((s) => <option key={s} value={s}>{ct(STATUS_LABEL[s])}</option>)}
                </select>,
                ct(STATUS_LABEL[demand.wantedStatus]), ok('status'))}
              {row(ct('Bônus de lealdade'), ct('pago no fim, se ele cumprir o contrato'),
                <div className="cn-money">
                  <input type="range" min={0} max={Math.max(r5k(offer.wage * 3), 50_000)} step={5000} value={offer.loyaltyBonus} disabled={closed}
                    aria-label={ct('Bônus de lealdade')} onChange={(e) => set({ loyaltyBonus: Number(e.target.value) })} />
                  <b className="cn-num">{formatMoney(offer.loyaltyBonus)}</b>
                </div>,
                ct('opcional'), null)}
            </div>

            {reply && (
              <div className={`cn-reply cn-reply--${reply.kind}`} role="status" aria-live="polite">
                <b>{reply.kind === 'accept' ? ct('Aceitou') : reply.kind === 'counter' ? ct('Contraproposta') : reply.kind === 'expired' ? ct('Sem acordo') : ct('Rompeu')}</b>
                <span>{reply.msg}</span>
                {reply.kind === 'counter' && reply.issues.length > 1 && (
                  <ul>{reply.issues.slice(1).map((i) => <li key={i}>{issueText(i)}</li>)}</ul>
                )}
                {reply.patienceLost > 0 && <small>−{reply.patienceLost} {ct('de paciência')}</small>}
              </div>
            )}

            <div className="cn-context">
              <div className="cn-kv"><span>{ct('Mercado paga')}</span><b>{formatMoney(profile.marketWage)}</b></div>
              <div className="cn-kv"><span>{ct('Outros clubes')}</span><b>~{formatMoney(rivalWage(profile))}</b></div>
              <div className="cn-kv"><span>{ct('Contrato inteiro')}</span><b>{formatMoney(totalContract)}</b></div>
              <div className="cn-kv"><span>{ct('Folha depois')}</span><b>{formatMoney(payrollAfter)}</b></div>
              <div className="cn-kv"><span>{ct('Caixa')}</span><b className={overBudget ? 'cn-num--bad' : undefined}>{formatMoney(budget)}</b></div>
            </div>

            {demand.factors.length > 0 && (
              <div className="cn-why">
                <span className="ds-eyebrow">{ct('Por que ele pede isso')}</span>
                <div className="cn-why__list">
                  {demand.factors.map((f) => (
                    <Tag key={f.key} tone={f.pct > 0 ? 'loss' : 'win'}>{ct(f.label)} {f.pct > 0 ? '+' : '−'}{Math.abs(f.pct)}%</Tag>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
