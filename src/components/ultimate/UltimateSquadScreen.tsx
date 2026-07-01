// Ultimate Squad — tela P1 (Loja + Coleção + reveal de pack). Modo offline,
// cartas do dataset real, moeda `credits`. Padrão em-*/DashCard/Modal/Button.
// Ver docs-but-map.md. Sub-fases futuras: Squad Builder (P2), partida vs IA (P3).

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button, DashCard, Modal } from '../ds';
import { Flag, PlayerAvatar } from '../ui';
import { ultimateIndex, useUltimate } from '../../state/ultimate';
import { PACK_DEFS, type PackDef } from '../../engine/ultimate/packs';
import { rarityInfo } from '../../engine/ultimate/rarities';
import { FORMATIONS, formationById } from '../../engine/ultimate/formations';
import { chemLabel, computeChemistry, roleFitsSlot, type ChemNode } from '../../engine/ultimate/chemistry';
import { activeSquad, type OwnedCard } from '../../engine/ultimate/state';
import type { UltCard } from '../../engine/ultimate/cards';
import { ct } from '../../state/career-i18n';

const fmt = (n: number) => n.toLocaleString('pt-BR');

// carta visual compacta, moldura/glow pela raridade.
function UltCardView({ card, size = 132, count }: { card: UltCard; size?: number; count?: number }) {
  const info = rarityInfo(card.rarity);
  return (
    <div
      style={{
        position: 'relative', width: size, borderRadius: 10, padding: '10px 8px 8px',
        background: `linear-gradient(160deg, ${info.color}22 0%, var(--em-panel-2,#12161e) 62%)`,
        border: `1.5px solid ${info.color}`, boxShadow: `0 0 16px ${info.color}33`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      {count != null && count > 1 && (
        <span style={{ position: 'absolute', top: 6, right: 6, fontSize: '0.62rem', fontWeight: 900, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>×{count}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, alignSelf: 'flex-start' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 900, color: info.color, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1 }}>{card.ovr}</span>
        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--em-muted,#8a99ab)', textTransform: 'uppercase' }}>{card.role}</span>
      </div>
      <PlayerAvatar nick={card.nick} size={Math.round(size * 0.42)} />
      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--em-text,#e6edf5)', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.nick}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem' }}>
        <Flag cc={card.country} /> <span style={{ color: info.color, fontWeight: 800, letterSpacing: '0.3px' }}>{info.label}</span>
      </div>
      <div style={{ fontSize: '0.58rem', color: 'var(--em-muted,#8a99ab)', fontWeight: 600 }}>{card.teamOriginName}</div>
    </div>
  );
}

// agrupa o inventário por cardKey → carta + contagem de cópias (+ owned ids).
interface ClubRow { card: UltCard; count: number; ownedIds: string[]; dupSellValue: number }

export function UltimateSquadScreen({ onBack }: { onBack: () => void }) {
  const { state, openPack, sell, ensureSquad, placeInSquad, setFormation } = useUltimate();
  const index = ultimateIndex();
  const [tab, setTab] = useState<'store' | 'club' | 'squad'>('store');
  const [reveal, setReveal] = useState<UltCard[] | null>(null);
  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const [toast, setToast] = useState<string>('');

  const credits = state.profile.credits;

  // garante um squad ativo ao abrir a aba Squad
  useEffect(() => { if (tab === 'squad') ensureSquad(); }, [tab, ensureSquad]);

  const club = useMemo<ClubRow[]>(() => {
    const byKey = new Map<string, { card: UltCard; ownedIds: string[] }>();
    for (const o of state.inventory) {
      const card = index.get(o.cardKey);
      if (!card) continue;
      const g = byKey.get(o.cardKey);
      if (g) g.ownedIds.push(o.id);
      else byKey.set(o.cardKey, { card, ownedIds: [o.id] });
    }
    const rows: ClubRow[] = [];
    for (const { card, ownedIds } of byKey.values()) {
      rows.push({ card, count: ownedIds.length, ownedIds, dupSellValue: 0 });
    }
    return rows.sort((a, b) => b.card.ovr - a.card.ovr);
  }, [state.inventory, index]);

  const totalCards = state.inventory.length;
  const uniqueCards = club.length;
  const dupCount = totalCards - uniqueCards;

  // ── squad building ──
  const ownedById = useMemo(() => new Map(state.inventory.map((o) => [o.id, o] as const)), [state.inventory]);
  const squad = activeSquad(state);
  const form = formationById(squad?.formation ?? 'standard');
  const slotCard = (slotIdx: number): { owned: OwnedCard; card: UltCard } | null => {
    const entry = squad?.slots.find((s) => s.slot === slotIdx);
    if (!entry?.ownedId) return null;
    const owned = ownedById.get(entry.ownedId);
    const card = owned ? index.get(owned.cardKey) : undefined;
    return owned && card ? { owned, card } : null;
  };
  const nodes: ChemNode[] = form.slots.map((fs) => {
    const sc = slotCard(fs.slot);
    return { slot: fs.slot, slotRole: fs.role, card: sc ? { teamOrigin: sc.card.teamOrigin, region: sc.card.region, country: sc.card.country, role: sc.card.role } : null };
  });
  const chem = computeChemistry(form.adjacency, nodes);
  const placed = form.slots.map((fs) => slotCard(fs.slot)?.card).filter((c): c is UltCard => !!c);
  const avgOvr = placed.length ? Math.round(placed.reduce((a, c) => a + c.ovr, 0) / placed.length) : 0;
  const cl = chemLabel(chem.total);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 1800); };

  const buy = (pack: PackDef) => {
    const res = openPack(pack.id);
    if (!res.ok) { flash(res.reason === 'insufficient' ? ct('Créditos insuficientes.') : ct('Não foi possível abrir.')); return; }
    setReveal([...res.cards].sort((a, b) => b.ovr - a.ovr));
  };

  // vende TODAS as duplicatas (mantém 1 cópia de cada), somando os créditos.
  const sellAllDuplicates = () => {
    let total = 0;
    let sold = 0;
    for (const row of club) {
      if (row.count <= 1) continue;
      // mantém a 1ª, vende o resto
      for (const id of row.ownedIds.slice(1)) {
        const r = sell(id);
        if (r.ok) { total += r.credited; sold++; }
      }
    }
    flash(sold ? `${ct('Vendidas')} ${sold} ${ct('duplicatas')} · +${fmt(total)} 🪙` : ct('Nenhuma duplicata pra vender.'));
  };

  const sellOne = (row: ClubRow) => {
    // vende a cópia "extra" se houver dupe; senão a única
    const id = row.count > 1 ? row.ownedIds[row.ownedIds.length - 1] : row.ownedIds[0];
    const r = sell(id);
    if (r.ok) flash(`+${fmt(r.credited)} 🪙`);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={backBtn}>← {ct('Voltar')}</button>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>MAJOR//CS</span>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.3px', color: 'var(--em-text,#e6edf5)' }}>Ultimate Squad</h1>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(232,193,112,0.12)', border: '1px solid rgba(232,193,112,0.4)', fontWeight: 900, color: '#e8c170', fontFamily: '"JetBrains Mono", monospace' }}>
          🪙 {fmt(credits)}
        </span>
      </header>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {([['store', ct('Loja')], ['squad', ct('Squad')], ['club', `${ct('Coleção')} (${totalCards})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={tabBtn(tab === id)}>{label}</button>
        ))}
      </div>

      {tab === 'store' && (
        <DashCard title={`🎁 ${ct('Loja de pacotes')}`}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>
            {ct('Abra pacotes, monte sua coleção dos jogadores reais de 2026. Venda duplicatas por créditos e junte pros pacotes melhores.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            {PACK_DEFS.map((pack) => {
              const afford = credits >= pack.cost;
              return (
                <div key={pack.id} style={{ borderRadius: 10, padding: 14, border: `1px solid ${pack.color}55`, background: `linear-gradient(160deg, ${pack.color}18 0%, var(--em-panel,#0f131a) 70%)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '2rem', textAlign: 'center' }}>📦</div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: pack.color, textAlign: 'center' }}>{pack.name}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--em-muted,#8a99ab)', textAlign: 'center', minHeight: 32 }}>{pack.desc}</div>
                  <Button variant={afford ? 'primary' : 'ghost'} onClick={() => buy(pack)} disabled={!afford} style={{ width: '100%', justifyContent: 'center' }}>
                    🪙 {fmt(pack.cost)}
                  </Button>
                </div>
              );
            })}
          </div>
        </DashCard>
      )}

      {tab === 'club' && (
        <DashCard
          title={`🗂️ ${ct('Coleção')}`}
          actions={dupCount > 0 ? <Button variant="ghost" onClick={sellAllDuplicates}>{ct('Vender duplicatas')} ({dupCount})</Button> : undefined}
        >
          {uniqueCards === 0 ? (
            <p className="muted small">{ct('Sua coleção está vazia. Abra um pacote na Loja pra começar.')}</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.78rem', color: 'var(--em-muted,#8a99ab)' }}>
                <span>{ct('Cartas')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{totalCards}</b></span>
                <span>{ct('Únicas')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{uniqueCards}</b></span>
                <span>{ct('Duplicatas')}: <b style={{ color: dupCount ? '#e8c170' : 'var(--em-text,#e6edf5)' }}>{dupCount}</b></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, justifyItems: 'center' }}>
                {club.map((row) => (
                  <div key={row.card.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <UltCardView card={row.card} count={row.count} size={140} />
                    <button onClick={() => sellOne(row)} style={sellBtn} title={ct('Quick-sell')}>
                      {row.count > 1 ? ct('vender dup') : ct('vender')} 🪙
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </DashCard>
      )}

      {tab === 'squad' && (
        <DashCard title={`🧩 ${ct('Montar squad')}`}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {FORMATIONS.map((f) => (
              <button key={f.id} onClick={() => setFormation(f.id)} title={f.desc} style={tabBtn(form.id === f.id)}>{f.name}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span>{ct('Química')}: <b style={{ color: cl.color, fontFamily: '"JetBrains Mono", monospace' }}>{chem.total}/15</b> <span style={{ color: cl.color, fontWeight: 800 }}>{cl.label}</span></span>
            <span>{ct('Multiplicador')}: <b style={{ fontFamily: '"JetBrains Mono", monospace', color: chem.multiplier >= 1 ? '#5ed88a' : '#e58a8a' }}>{chem.multiplier.toFixed(2)}×</b></span>
            <span>{ct('OVR médio')}: <b style={{ fontFamily: '"JetBrains Mono", monospace' }}>{avgOvr || '—'}</b></span>
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto', aspectRatio: '4 / 5', background: 'radial-gradient(ellipse at 50% 34%, rgba(94,216,138,0.06), transparent 62%)', border: '1px solid var(--em-border,#2a3340)', borderRadius: 12 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {chem.edges.map((e, i) => {
                const a = form.slots[e.a], b = form.slots[e.b];
                const stroke = e.score >= 1.5 ? '#5ed88a' : e.score >= 0.5 ? '#e8c170' : e.score > 0 ? '#e58a8a' : 'rgba(255,255,255,0.08)';
                return <line key={i} x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100} stroke={stroke} strokeWidth={e.score >= 1.5 ? 0.9 : 0.6} strokeDasharray={e.score > 0 && e.score < 0.5 ? '2 2' : undefined} />;
              })}
            </svg>
            {form.slots.map((fs) => {
              const sc = slotCard(fs.slot);
              return (
                <div key={fs.slot} style={{ position: 'absolute', left: `${fs.x * 100}%`, top: `${fs.y * 100}%`, transform: 'translate(-50%,-50%)' }}>
                  {sc ? (
                    <button onClick={() => setPickSlot(fs.slot)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} title={ct('Trocar')}>
                      <UltCardView card={sc.card} size={92} />
                    </button>
                  ) : (
                    <button onClick={() => setPickSlot(fs.slot)} style={emptySlot}>
                      <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>＋</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 800 }}>{fs.role}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ textAlign: 'center', marginTop: 10 }}>
            {ct('Mesma org (+1), mesma região (+0.5) e mesmo país (+0.5) entre jogadores conectados dão química. Encaixe as funções pra somar mais.')}
          </p>
        </DashCard>
      )}

      {/* seletor de carta pro slot */}
      {pickSlot != null && (() => {
        const slotRole = form.slots[pickSlot].role;
        const cands = state.inventory
          .map((o) => ({ o, card: index.get(o.cardKey) }))
          .filter((x): x is { o: OwnedCard; card: UltCard } => !!x.card)
          .sort((a, b) => (Number(roleFitsSlot(b.card.role, slotRole)) - Number(roleFitsSlot(a.card.role, slotRole))) || b.card.ovr - a.card.ovr);
        const current = slotCard(pickSlot);
        return (
          <Modal open onClose={() => setPickSlot(null)} title={`${ct('Escolher')} · ${slotRole}`} size="lg"
            footer={current ? <Button variant="ghost" onClick={() => { placeInSquad(pickSlot, null); setPickSlot(null); }}>{ct('Remover do slot')}</Button> : undefined}>
            {cands.length === 0 ? (
              <p className="muted small">{ct('Sem cartas. Abra pacotes na Loja.')}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10, maxHeight: 440, overflowY: 'auto', justifyItems: 'center' }}>
                {cands.map(({ o, card }) => {
                  const fits = roleFitsSlot(card.role, slotRole);
                  return (
                    <button key={o.id} onClick={() => { placeInSquad(pickSlot, o.id); setPickSlot(null); }} style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, opacity: fits ? 1 : 0.72 }}>
                      <UltCardView card={card} size={116} />
                      {!fits && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: 'rgba(229,138,138,0.85)', color: '#fff' }}>{ct('fora')}</span>}
                      {o.locked === 'squad' && <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#9fd6ff' }}>{ct('escalado')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}

      {/* reveal do pack */}
      {reveal && (
        <Modal open onClose={() => setReveal(null)} title={`✨ ${ct('Pacote aberto')}`} size="lg"
          footer={<Button variant="primary" onClick={() => { setReveal(null); setTab('club'); }}>{ct('Ver coleção')}</Button>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', padding: '6px 0' }}>
            {reveal.map((c, i) => (
              <div key={`${c.key}-${i}`} className="ult-reveal-card" style={{ animationDelay: `${i * 120}ms` }}>
                <UltCardView card={c} size={132} />
              </div>
            ))}
          </div>
          <style>{`
            .ult-reveal-card { animation: ult-pop .45s cubic-bezier(0.2,0.8,0.2,1) both; }
            @keyframes ult-pop { from { opacity:0; transform: translateY(14px) scale(.82) rotateY(35deg); } to { opacity:1; transform:none; } }
          `}</style>
        </Modal>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '9px 18px', borderRadius: 8, background: 'var(--em-panel-2,#12161e)', border: '1px solid var(--em-border,#2a3340)', fontWeight: 800, fontSize: '0.84rem', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const backBtn: CSSProperties = { padding: '7px 13px', background: 'var(--em-panel-2,#12161e)', color: 'var(--em-text,#e6edf5)', border: '1px solid var(--em-border,#2a3340)', borderRadius: 6, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };
const sellBtn: CSSProperties = { padding: '4px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', borderRadius: 5, border: '1px solid var(--em-border,#2a3340)', background: 'transparent', color: 'var(--em-muted,#8a99ab)', fontFamily: 'inherit' };
const emptySlot: CSSProperties = { width: 78, height: 94, borderRadius: 10, border: '1.5px dashed var(--em-border,#3a4553)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: 'var(--em-muted,#8a99ab)', fontFamily: 'inherit' };
const tabBtn = (on: boolean): CSSProperties => ({ padding: '7px 16px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', borderRadius: 6, border: '1px solid var(--em-border,#2a3340)', background: on ? 'var(--em-gold,#e8c170)' : 'transparent', color: on ? '#1a1205' : 'var(--em-text,#e6edf5)', fontFamily: 'inherit' });
