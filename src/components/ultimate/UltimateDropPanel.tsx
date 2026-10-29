// [CSM-1] Drop de escolha no hub do Ultimate: contador do próximo drop, as 3
// cartas e a escolha. Tudo vem do servidor (state/ultimateDrops.ts); a carta
// é desenhada pelo componente de carta existente (renderCard), sem mexer nele.
// A regra do vencimento fica escrita na tela, com a carta que seria entregue.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Gift, Timer } from 'lucide-react';
import { UtPanel } from './UtPanel';
import { ct } from '../../state/career-i18n';
import { fetchDropStatus, openDrop, pickDrop, type DropFail, type DropStatusView } from '../../state/ultimateDrops';
import { useUltimate } from '../../state/ultimate';
import type { UltCard } from '../../engine/ultimate/cards';

function clock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(t / 60), s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const FAIL_TEXT: Record<DropFail['error'], string> = {
  needAccount: 'Entre na sua conta para receber drops.',
  offline: 'Servidor fora do ar agora. Tente de novo em instantes.',
  frozen: 'Carteira em revisão: drops pausados.',
  noStock: 'Sem drop disponível ainda.',
  other: 'Não deu certo. Tente de novo.',
};

export function UltimateDropPanel({ renderCard }: { renderCard: (card: UltCard) => ReactNode }) {
  const serverCardGrant = useUltimate((s) => s.serverCardGrant);
  const [view, setView] = useState<DropStatusView | null>(null);
  const [skew, setSkew] = useState(0); // relógio do servidor − local
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const apply = useCallback((v: DropStatusView) => {
    setView(v);
    setSkew(v.serverNow - Date.now());
    if (v.settled?.cardId) {
      serverCardGrant(v.settled.cardId, v.settled.cardKey);
      setMsg(`${ct('O tempo acabou e você recebeu')} ${v.settled.card?.nick ?? ct('a carta de menor valor')}.`);
    }
  }, [serverCardGrant]);

  const refresh = useCallback(async () => {
    const r = await fetchDropStatus();
    if (r.ok) apply(r.view);
    else if (r.error === 'needAccount') setHidden(true);
    else setMsg(r.message ?? ct(FAIL_TEXT[r.error]));
  }, [apply]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + skew;
  // contador zerou (novo drop ou janela vencida): pede o estado ao servidor
  const nextIn = view?.nextAt != null ? view.nextAt - serverNow : null;
  const choiceIn = view?.pending ? view.pending.expiresAt - serverNow : null;
  useEffect(() => {
    if ((nextIn != null && nextIn <= 0 && nextIn > -1500) || (choiceIn != null && choiceIn <= 0 && choiceIn > -1500)) void refresh();
  }, [nextIn, choiceIn, refresh]);

  if (hidden) return null;

  const doOpen = async () => {
    setBusy(true); setMsg(null);
    const r = await openDrop();
    setBusy(false);
    if (r.ok) apply(r.view); else setMsg(r.message ?? ct(FAIL_TEXT[r.error]));
  };
  const doPick = async (index: number) => {
    if (!view?.pending) return;
    setBusy(true); setMsg(null);
    const r = await pickDrop(view.pending.dropId, index);
    setBusy(false);
    if (!r.ok) { setMsg(r.message ?? ct(FAIL_TEXT[r.error])); return; }
    serverCardGrant(r.grant.cardId, r.grant.cardKey);
    setMsg(r.grant.auto
      ? `${ct('O tempo tinha acabado: você recebeu')} ${r.grant.card?.nick ?? ''} (${ct('menor valor')}).`
      : `${r.grant.card?.nick ?? ct('Carta')} ${ct('foi para a sua coleção.')}`);
    void refresh();
  };

  const pending = view?.pending ?? null;
  const right = view ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
      <strong>{view.available}/{view.max}</strong>
      {view.nextAt != null && nextIn != null && <span style={{ color: 'var(--ut-muted)' }}><Timer size={12} style={{ verticalAlign: '-2px' }} /> {ct('próximo em')} {clock(nextIn)}</span>}
      {view.nextAt == null && <span style={{ color: 'var(--ut-muted)' }}>{ct('estoque cheio')}</span>}
    </span>
  ) : undefined;

  return (
    <UtPanel label={ct('Drop de escolha')} icon={<Gift size={15} className="ut-panel__lead" />} right={right} accent="amber"
      info={ct('1 drop a cada 20 min, até 3 guardados. Abra, veja 3 cartas e fique com 1. O sorteio é feito no servidor.')}>
      {!view && !msg && <p className="muted small">{ct('Carregando…')}</p>}
      {view && !pending && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.85rem' }}>
            {view.available > 0 ? ct('Você tem drop para abrir.') : ct('Sem drop agora.')}
            <div className="muted small">
              {view.pityIn === 0 ? ct('O próximo drop garante uma opção Ouro ou melhor.') : `${ct('Ouro garantido em até')} ${view.pityIn + 1} ${ct('drops')}.`}
            </div>
          </div>
          <button className="ut-jogar" style={{ padding: '10px 18px' }} disabled={busy || view.available < 1} onClick={() => void doOpen()}>
            <Gift size={15} /> {ct('Abrir drop')}
          </button>
        </div>
      )}
      {pending && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <strong style={{ fontSize: '0.9rem' }}>{ct('Escolha 1 carta')}</strong>
            {choiceIn != null && <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem' }}><Timer size={13} style={{ verticalAlign: '-2px' }} /> {clock(choiceIn)}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, justifyItems: 'center' }}>
            {pending.offers.map((o, i) => (
              <div key={o.cardKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {o.card ? renderCard(o.card) : <div className="muted small">{o.cardKey}</div>}
                {o.card?.eventLabel && <span className="small" style={{ color: '#f97316', fontWeight: 800 }}>{o.card.eventLabel}</span>}
                <span className="muted small">{ct('Valor')} {o.value.toLocaleString('pt-BR')}{i === pending.autoIndex ? ` · ${ct('menor valor')}` : ''}</span>
                <button className="ut-btn ut-btn--gold" style={{ padding: '6px 14px' }} disabled={busy} onClick={() => void doPick(i)}>{ct('Ficar com esta')}</button>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            {ct(pending.rule)} {pending.offers[pending.autoIndex]?.card ? `(${pending.offers[pending.autoIndex].card!.nick})` : ''}
          </p>
        </>
      )}
      {msg && <p className="small" role="status" style={{ marginTop: 8 }}>{msg}</p>}
    </UtPanel>
  );
}
