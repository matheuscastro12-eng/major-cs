// Gerência de saves da carreira (conta vitalícia): até 5 carreiras, criar e apagar.
// Mostra também saves que estão só na nuvem (outro aparelho) e reconcilia ao continuar.
// Visual do design (Panel/Button + tokens --rtm-*). O grátis nem chega aqui.
import { useEffect, useState } from 'react';
import { Panel, Button } from './ds';
import { listSlots, listSlotsCloudMerged, deleteSlot, slotKey, cloudSlot, CAREER_SLOTS, type SlotSummary } from '../state/careerSaves';
import { syncSlot } from '../state/cloud';

const money = (n?: number) => (n == null ? '—' : `R$ ${Math.round(n).toLocaleString('pt-BR')}`);

export function CareerSaves({ paid, onPlay, onBack }: { paid: boolean; onPlay: (slot: number) => void; onBack: () => void }) {
  const [slots, setSlots] = useState<SlotSummary[]>(() => listSlots());
  const [loadingCloud, setLoadingCloud] = useState(paid);
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  // puxa os saves da nuvem pra também mostrar o que está em outro aparelho
  useEffect(() => {
    if (!paid) return;
    let alive = true;
    void listSlotsCloudMerged().then((merged) => { if (alive) { setSlots(merged); setLoadingCloud(false); } }).catch(() => { if (alive) setLoadingCloud(false); });
    return () => { alive = false; };
  }, [paid]);

  const used = slots.filter((s) => s.exists).length;
  const refresh = () => { setSlots(listSlots()); if (paid) void listSlotsCloudMerged().then(setSlots).catch(() => {}); };

  const doDelete = (n: number) => { deleteSlot(n); setConfirmSlot(null); refresh(); };

  // entra no slot: se o save está só na nuvem, baixa antes (reconcilia local<-nuvem)
  const go = async (slot: number, fromCloud?: boolean) => {
    if (busySlot != null) return;
    if (paid && fromCloud) { setBusySlot(slot); try { await syncSlot(cloudSlot(slot), slotKey(slot)); } catch { /* segue com o que tiver */ } }
    onPlay(slot);
  };

  return (
    <div className="rtm-fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>⇤ Menu</button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '10px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '4px 12px', borderRadius: '999px' }}>★ Conta vitalícia · apoiador</span>
        <h1 style={{ margin: '10px 0 0', fontFamily: 'var(--rtm-font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Suas carreiras</h1>
        <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '520px', margin: '8px auto 0', lineHeight: 1.55 }}>
          Você pode manter até {CAREER_SLOTS} carreiras salvas ao mesmo tempo e apagar qualquer uma quando quiser para começar outra. <b style={{ color: 'var(--rtm-text)' }}>{used}/{CAREER_SLOTS}</b> em uso{loadingCloud ? ' · sincronizando com a nuvem…' : ''}.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {slots.map((s) => {
          const c0 = s.colors?.[0] ?? '#2a3340';
          const busy = busySlot === s.slot;
          if (!s.exists) {
            return (
              <div key={s.slot} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 18px', borderRadius: '10px', background: 'var(--rtm-bg-deep)', border: '1px dashed var(--rtm-border)' }}>
                <span style={{ width: '46px', height: '46px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rtm-faint)', fontSize: '22px', border: '1px dashed var(--rtm-border)' }}>+</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--rtm-font-cond)', fontWeight: 700, fontSize: '17px', color: 'var(--rtm-dim)' }}>Slot {s.slot} · vazio</div>
                  <div style={{ fontSize: '12px', color: 'var(--rtm-faint)' }}>Comece uma carreira nova do zero.</div>
                </div>
                <Button variant="primary" disabled={busySlot != null} onClick={() => void go(s.slot)}>Novo save</Button>
              </div>
            );
          }
          return (
            <div key={s.slot} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 18px', borderRadius: '10px', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)' }}>
              <span style={{ width: '46px', height: '46px', borderRadius: '10px', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--rtm-font-cond)', fontWeight: 800, fontSize: '16px', color: '#fff', background: `linear-gradient(160deg, ${c0}, #20303f)` }}>
                {s.logo ? <img src={s.logo} alt="" style={{ width: '64%', height: '64%', objectFit: 'contain' }} /> : (s.tag ?? '??').slice(0, 2).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--rtm-font-cond)', fontWeight: 700, fontSize: '18px', color: 'var(--rtm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.org ?? `Carreira ${s.slot}`}
                  {s.fromCloud && <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.4px', color: 'var(--rtm-blue-bright)', border: '1px solid var(--rtm-border)', padding: '1px 6px', borderRadius: '4px' }}>☁ NUVEM</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>
                  Slot {s.slot} · Split {s.split ?? 1}{s.tier ? ` · Tier ${s.tier}` : ''} · {s.titles ?? 0}× título · {money(s.budget)}
                </div>
              </div>
              {confirmSlot === s.slot ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--rtm-red-bright)', fontWeight: 700 }}>Apagar?</span>
                  <Button variant="danger" size="sm" onClick={() => doDelete(s.slot)}>Sim, apagar</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmSlot(null)}>Não</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="gold" disabled={busySlot != null} onClick={() => void go(s.slot, s.fromCloud)}>{busy ? 'Carregando…' : 'Continuar'}</Button>
                  <Button variant="ghost" size="sm" disabled={busySlot != null} onClick={() => setConfirmSlot(s.slot)}>Apagar</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Panel title="Como funciona" accent="blue" style={{ marginTop: '18px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--rtm-dim)', lineHeight: 1.55 }}>
          Cada save é uma carreira independente (org, elenco, títulos, dinheiro). Apagar um save libera o slot na hora e não dá pra desfazer. Como sua conta é vitalícia, seus saves sincronizam na nuvem e aparecem em qualquer aparelho.
        </p>
      </Panel>
    </div>
  );
}
