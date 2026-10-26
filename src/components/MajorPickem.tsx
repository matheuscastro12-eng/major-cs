// Aba Pick'em do Major Singapore. Formato Valve: por Stage, 2 times 3-0, 2 times
// 0-3 e 6 que avançam; nos playoffs, semis, final e campeão. A trava é a do
// servidor (api/pickem.ts); aqui o relógio só mostra a contagem.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Lock, LogIn, Trophy } from 'lucide-react';
import { ct } from '../state/career-i18n';
import { Button, Segmented, Tag } from './ds/index';
import { PICKEM_SCORING, PICKEM_STAGES, PLAYOFF_SLOTS, SWISS_SLOTS, scoreStage, type PickemStageId, type StagePick } from '../engine/majorSingapore/pickem';
import {
  fetchMyPicks, fetchPickemBoard, fetchPickemState, hasPickemAccount, savePickemPick,
  type PickemBoardRow, type PickemMine, type PickemStage,
} from '../state/pickemApi';

type Slot = 'threeZero' | 'zeroThree' | 'advance' | 'semis' | 'final' | 'champion';
type Draft = Partial<Record<Slot, string[]>>;

const STAGE_LABEL: Record<PickemStageId, string> = { s1: 'Stage 1', s2: 'Stage 2', s3: 'Stage 3', playoffs: 'Playoffs' };
const SWISS: { slot: Slot; label: string; n: number; pts: string }[] = [
  { slot: 'threeZero', label: '3-0', n: SWISS_SLOTS.threeZero, pts: `${PICKEM_SCORING.swiss.threeZero} pts` },
  { slot: 'zeroThree', label: '0-3', n: SWISS_SLOTS.zeroThree, pts: `${PICKEM_SCORING.swiss.zeroThree} pts` },
  { slot: 'advance', label: 'Avançam', n: SWISS_SLOTS.advance, pts: `${PICKEM_SCORING.swiss.advance} pts` },
];
const PLAYOFF: { slot: Slot; label: string; n: number; pts: string }[] = [
  { slot: 'semis', label: 'Semifinal', n: PLAYOFF_SLOTS.semis, pts: `${PICKEM_SCORING.playoffs.semis} pts` },
  { slot: 'final', label: 'Final', n: PLAYOFF_SLOTS.final, pts: `${PICKEM_SCORING.playoffs.final} pts` },
  { slot: 'champion', label: 'Campeão', n: 1, pts: `${PICKEM_SCORING.playoffs.champion} pts` },
];

const toDraft = (p: StagePick | undefined): Draft => {
  if (!p) return {};
  if ('semis' in p) return { semis: [...p.semis], final: [...p.final], champion: p.champion ? [p.champion] : [] };
  return { threeZero: [...p.threeZero], zeroThree: [...p.zeroThree], advance: [...p.advance] };
};
const toPick = (stage: PickemStageId, d: Draft): StagePick => (stage === 'playoffs'
  ? { semis: d.semis ?? [], final: d.final ?? [], champion: d.champion?.[0] ?? '' }
  : { threeZero: d.threeZero ?? [], zeroThree: d.zeroThree ?? [], advance: d.advance ?? [] });

function fmtLeft(ms: number) {
  if (ms <= 0) return null;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, '0')}min`;
}

export function MajorPickem({ badge, nameOf }: { badge: (id: string, size?: number) => ReactNode; nameOf: (id: string) => string }) {
  const [stages, setStages] = useState<PickemStage[] | null>(null);
  const [skew, setSkew] = useState(0); // relógio do servidor − relógio local
  const [offline, setOffline] = useState(false);
  const [mine, setMine] = useState<PickemMine>({});
  const [board, setBoard] = useState<{ total: number; board: PickemBoardRow[] } | null>(null);
  const [stage, setStage] = useState<PickemStageId>('s1');
  const [slot, setSlot] = useState<Slot>('threeZero');
  const [draft, setDraft] = useState<Draft>({});
  const [msg, setMsg] = useState<{ tone: 'win' | 'loss'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const logged = hasPickemAccount();

  useEffect(() => {
    let live = true;
    void (async () => {
      const st = await fetchPickemState();
      if (!live) return;
      if (!st) { setOffline(true); setStages([]); return; }
      setSkew(Date.parse(st.serverNow) - Date.now());
      setStages(st.stages);
      const open = PICKEM_STAGES.find((id) => { const s = st.stages.find((x) => x.stage === id); return s?.locksAt && Date.parse(s.locksAt) > Date.parse(st.serverNow) && s.teams.length; });
      if (open) setStage(open);
      const [b, m] = await Promise.all([fetchPickemBoard(), logged ? fetchMyPicks() : Promise.resolve(null)]);
      if (!live) return;
      setBoard(b);
      if (m) setMine(m);
    })();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { live = false; clearInterval(t); };
  }, [logged]);

  useEffect(() => {
    setDraft(toDraft(mine[stage]?.pick));
    setSlot(stage === 'playoffs' ? 'semis' : 'threeZero');
    setMsg(null);
  }, [stage, mine]);

  const cur = stages?.find((s) => s.stage === stage);
  const lockMs = cur?.locksAt ? Date.parse(cur.locksAt) - (now + skew) : -1;
  const locked = !cur?.locksAt || lockMs <= 0;
  const slots = stage === 'playoffs' ? PLAYOFF : SWISS;
  const teams = useMemo(() => {
    if (!cur) return [];
    if (stage !== 'playoffs') return cur.teams;
    // final só entre os semifinalistas, campeão só entre os finalistas
    if (slot === 'final') return draft.semis ?? [];
    if (slot === 'champion') return draft.final ?? [];
    return cur.teams;
  }, [cur, stage, slot, draft.semis, draft.final]);

  const slotOf = (id: string): Slot | null => {
    for (const s of stage === 'playoffs' ? (['champion', 'final', 'semis'] as Slot[]) : (['threeZero', 'zeroThree', 'advance'] as Slot[])) if (draft[s]?.includes(id)) return s;
    return null;
  };
  const toggle = (id: string) => {
    if (locked) return;
    const max = slots.find((s) => s.slot === slot)!.n;
    setMsg(null);
    setDraft((d) => {
      const nd: Draft = { ...d };
      const has = nd[slot]?.includes(id);
      if (stage !== 'playoffs') for (const s of ['threeZero', 'zeroThree', 'advance'] as Slot[]) nd[s] = (nd[s] ?? []).filter((x) => x !== id);
      else nd[slot] = (nd[slot] ?? []).filter((x) => x !== id);
      if (has) {
        // tirar das semis tira da final/campeão também
        if (slot === 'semis') { nd.final = (nd.final ?? []).filter((x) => x !== id); nd.champion = (nd.champion ?? []).filter((x) => x !== id); }
        if (slot === 'final') nd.champion = (nd.champion ?? []).filter((x) => x !== id);
        return nd;
      }
      const list = [...(nd[slot] ?? [])];
      if (list.length >= max) list.shift();
      nd[slot] = [...list, id];
      return nd;
    });
  };
  const complete = slots.every((s) => (draft[s.slot]?.length ?? 0) === s.n);
  const save = async () => {
    setSaving(true);
    const r = await savePickemPick(stage, toPick(stage, draft));
    setSaving(false);
    if (r.ok) { setMine((m) => ({ ...m, [stage]: { pick: toPick(stage, draft), savedAt: r.savedAt } })); setMsg({ tone: 'win', text: ct('Palpite salvo. Dá pra trocar até a trava.') }); }
    else setMsg({ tone: 'loss', text: r.error });
  };
  const score = cur?.result && mine[stage] ? scoreStage(stage, mine[stage]!.pick, cur.result) : null;
  const tag = (s: Slot) => (s === 'threeZero' ? '3-0' : s === 'zeroThree' ? '0-3' : s === 'advance' ? 'AV' : s === 'semis' ? 'SF' : s === 'final' ? 'F' : '★');

  return (
    <div className="msg-pk">
      <header className="msg-pk__hero">
        <div>
          <p className="msg-ev__kicker msg-ev__kicker--gold">{ct('Pick\'em oficial do Major')}</p>
          <h2 className="msg-phead__title">Pick'em Singapore</h2>
          <p className="msg-pk__lead">{ct('Grátis pra qualquer conta. Acerte 3-0, 0-3 e quem avança em cada Stage, depois os playoffs. Os 3 primeiros do placar levam prêmio.')}</p>
        </div>
        <ul className="msg-pk__rules" aria-label={ct('Pontuação')}>
          <li><b>{PICKEM_SCORING.swiss.threeZero}</b><span>3-0 / 0-3</span></li>
          <li><b>{PICKEM_SCORING.swiss.advance}</b><span>{ct('avança')}</span></li>
          <li><b>{PICKEM_SCORING.playoffs.final}</b><span>{ct('finalista')}</span></li>
          <li className="is-gold"><b>{PICKEM_SCORING.playoffs.champion}</b><span>{ct('campeão')}</span></li>
        </ul>
      </header>

      {offline && <p className="msg-pk__note">{ct('O Pick\'em abre perto do Stage 1 (24/11). Volte aqui pra fazer seus palpites.')}</p>}

      <div className="msg-pk__grid">
        <section className="msg-pk__main">
          <div className="msg-pk__bar">
            <Segmented label={ct('Fase')} value={stage} onChange={setStage} items={PICKEM_STAGES.map((id) => ({ value: id, label: STAGE_LABEL[id] }))} />
            <span className={`msg-pk__lock${locked ? ' is-locked' : ''}`}>
              {locked ? <><Lock size={14} aria-hidden />{cur?.locksAt ? ct('Travado') : ct('Ainda não abriu')}</> : <>{ct('Trava em')} <b>{fmtLeft(lockMs)}</b></>}
            </span>
          </div>

          <div className="msg-pk__slots" role="tablist" aria-label={ct('O que você está escolhendo')}>
            {slots.map((s) => {
              const got = draft[s.slot] ?? [];
              return (
                <button key={s.slot} type="button" role="tab" aria-selected={slot === s.slot} className={`msg-pk__slot msg-pk__slot--${s.slot}${slot === s.slot ? ' is-on' : ''}`} onClick={() => setSlot(s.slot)}>
                  <span className="msg-pk__slothead"><b>{ct(s.label)}</b><small>{got.length}/{s.n} · {s.pts}</small></span>
                  <span className="msg-pk__chips">
                    {Array.from({ length: s.n }, (_, i) => (
                      <span key={i} className={`msg-pk__chip${got[i] ? ' is-full' : ''}`} title={got[i] ? nameOf(got[i]) : undefined}>{got[i] ? badge(got[i], 22) : null}</span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {cur && cur.teams.length > 0 ? (
            <ul className="msg-pk__teams">
              {teams.map((id) => {
                const s = slotOf(id);
                return (
                  <li key={id}>
                    <button type="button" disabled={locked} aria-pressed={s === slot} className={`msg-pk__team${s ? ` is-${s}` : ''}`} onClick={() => toggle(id)}>
                      {badge(id, 32)}
                      <span className="msg-pk__tname">{nameOf(id)}</span>
                      {s && <span className="msg-pk__ttag">{tag(s)}</span>}
                    </button>
                  </li>
                );
              })}
              {teams.length === 0 && <li className="msg-pk__empty">{slot === 'final' ? ct('Escolha os semifinalistas primeiro.') : ct('Escolha os finalistas primeiro.')}</li>}
            </ul>
          ) : !offline && (
            <p className="msg-pk__note">{stage === 'playoffs' ? ct('Os 8 dos playoffs entram quando o Stage 3 terminar.') : ct('Os times deste Stage entram quando o Stage anterior terminar.')}</p>
          )}

          <footer className="msg-pk__foot">
            {!logged ? (
              <><span className="msg-pk__hint"><LogIn size={16} aria-hidden />{ct('Entre na sua conta (grátis vale) pra salvar seus palpites.')}</span></>
            ) : (
              <>
                <span className="msg-pk__hint">
                  {msg ? <Tag tone={msg.tone}>{msg.text}</Tag>
                    : score ? <Tag tone="achievement" icon={<Trophy size={12} />}>{score.points} pts {ct('neste Stage')}</Tag>
                    : mine[stage] ? <Tag tone="win" icon={<Check size={12} />}>{ct('Palpite salvo')}</Tag>
                    : <span>{ct('Escolha todos os espaços pra salvar.')}</span>}
                </span>
                <Button variant="primary" size="lg" disabled={locked || !complete || saving} loading={saving} onClick={() => void save()}>{mine[stage] ? ct('Atualizar palpite') : ct('Salvar palpite')}</Button>
              </>
            )}
          </footer>
        </section>

        <aside className="msg-pk__board" aria-label={ct('Placar do Pick\'em')}>
          <header className="msg-pk__bhead"><h3>{ct('Placar')}</h3><small>{board ? `${board.total} ${ct('participantes')}` : '—'}</small></header>
          {board && board.board.length > 0 ? (
            <ol className="msg-pk__rank">
              {board.board.slice(0, 15).map((r) => (
                <li key={r.rank} className={r.rank <= PICKEM_SCORING.winners ? `is-top is-${r.rank}` : ''}>
                  <span className="msg-pk__pos">{r.rank}</span>
                  <span className="msg-pk__nick">{r.nick}</span>
                  <b>{r.points}</b>
                </li>
              ))}
            </ol>
          ) : <p className="msg-pk__note">{ct('O placar aparece quando sair o primeiro resultado.')}</p>}
          <p className="msg-pk__fine">{ct('Desempate: mais acertos exatos (3-0/0-3), acertou o campeão, mais acertos nos playoffs, quem salvou antes. Prêmio só depois da conferência da equipe.')}</p>
        </aside>
      </div>
    </div>
  );
}
