// Peek de jogador: passar o mouse (ou segurar o dedo) em QUALQUER nome marcado
// com data-peek="<ref>" abre um cartão rápido com OVR, função, atributos-chave e
// forma — em qualquer tela do jogo, sem sair de onde você está.
//
// Como funciona: um único listener delegado no document acha o [data-peek]
// mais próximo e pergunta aos resolvedores registrados (cada modo registra o
// seu com usePeekResolver) quem sabe montar o cartão daquele ref.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Crosshair } from 'lucide-react';
import { ALL_ATTRS, ATTR_LABEL, playerAttributes, type AttrKey, type PlayerForAttrs } from '../../../engine/attributes';
import { AttrValue, attrBand } from '../Attr';

export interface PeekData {
  nick: string;
  name?: string;
  country?: string;
  role?: string;
  role2?: string;
  ovr?: number;
  age?: number;
  team?: string;
  /** até 6 atributos 1–20 em destaque */
  attrs?: { label: string; value: number }[];
  /** forma recente: V/D/E ou rating */
  form?: ('W' | 'L' | 'D')[];
  rating?: string;
  extra?: { label: string; value: string }[];
  onOpen?: () => void;
  openLabel?: string;
}

type Resolver = (ref: string) => PeekData | null;
const resolvers = new Set<{ current: Resolver }>();

/** Registra um resolvedor de peek enquanto o componente estiver montado. */
export function usePeekResolver(fn: Resolver) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    const entry = ref;
    resolvers.add(entry);
    return () => { resolvers.delete(entry); };
  }, []);
}

function resolve(ref: string): PeekData | null {
  for (const r of resolvers) {
    const d = r.current(ref);
    if (d) return d;
  }
  return null;
}

/** Os 6 atributos que mais contam pra função (o resto fica no perfil). */
const ROLE_KEYS: Record<string, AttrKey[]> = {
  AWP: ['awp', 'reflexes', 'composure', 'positioning', 'crosshair', 'consistency'],
  IGL: ['leadership', 'communication', 'gameSense', 'decisions', 'vision', 'composure'],
  Entry: ['aim', 'reaction', 'aimMovement', 'headshot', 'reflexes', 'clutch'],
  Support: ['teamwork', 'communication', 'spray', 'positioning', 'discipline', 'consistency'],
  Lurker: ['offAngles', 'anticipation', 'clutch', 'positioning', 'gameSense', 'composure'],
  Rifler: ['aim', 'spray', 'crosshair', 'headshot', 'clutch', 'consistency'],
};

/** Monta o cartão a partir de um Player do jogo (atributos derivados 1–20). */
export function peekFromPlayer(p: PlayerForAttrs & { nick: string; name?: string; country?: string; role?: string; role2?: string }, extra: Partial<PeekData> = {}): PeekData {
  const a = playerAttributes(p);
  const keys = ROLE_KEYS[p.role ?? ''] ?? ALL_ATTRS.slice(0, 6);
  return {
    nick: p.nick,
    name: p.name,
    country: p.country,
    role: p.role,
    role2: p.role2,
    attrs: keys.map((k) => ({ label: ATTR_LABEL[k], value: a[k] })),
    ...extra,
  };
}

interface Open { data: PeekData; x: number; y: number; below: boolean }

export function PeekLayer() {
  const [open, setOpen] = useState<Open | null>(null);
  const showT = useRef<number | undefined>(undefined);
  const hideT = useRef<number | undefined>(undefined);
  const overCard = useRef(false);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const clear = () => { window.clearTimeout(showT.current); window.clearTimeout(hideT.current); };
    const place = (el: Element, data: PeekData) => {
      const r = el.getBoundingClientRect();
      const W = 288;
      const below = r.top < 260;
      const x = Math.max(8, Math.min(window.innerWidth - W - 8, r.left));
      const y = below ? r.bottom + 8 : r.top - 8;
      setOpen({ data, x, y, below });
    };
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest('[data-peek]') : null);
    const scheduleHide = () => {
      window.clearTimeout(hideT.current);
      hideT.current = window.setTimeout(() => { if (!overCard.current) { setOpen(null); current.current = null; } }, 160);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e);
      if (!el) return;
      if (el === current.current) { window.clearTimeout(hideT.current); return; }
      clear();
      current.current = el;
      const ref = el.getAttribute('data-peek') ?? '';
      showT.current = window.setTimeout(() => {
        const data = resolve(ref);
        if (data && current.current === el) place(el, data);
      }, 320);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e);
      if (!el || el !== current.current) return;
      const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest('[data-peek]') : null;
      if (to === el) return;
      window.clearTimeout(showT.current);
      scheduleHide();
    };
    // toque: segurar o dedo 450ms abre o cartão (o toque curto segue abrindo o perfil)
    let pressT: number | undefined;
    let pressed = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const el = target(e);
      if (!el) { if (!(e.target instanceof Element && e.target.closest('.gs-peek'))) setOpen(null); return; }
      pressed = false;
      window.clearTimeout(pressT);
      pressT = window.setTimeout(() => {
        const data = resolve(el.getAttribute('data-peek') ?? '');
        if (data) { pressed = true; current.current = el; place(el, data); }
      }, 450);
    };
    const onUp = () => window.clearTimeout(pressT);
    // o clique que termina um long-press não deve navegar
    const onClick = (e: MouseEvent) => {
      if (pressed) { e.preventDefault(); e.stopPropagation(); pressed = false; }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const onScroll = () => { if (!overCard.current) setOpen(null); };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clear();
      window.clearTimeout(pressT);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  return open ? <PeekPortal open={open} overCard={overCard} onLeave={() => { setOpen(null); current.current = null; }} onEnter={() => window.clearTimeout(hideT.current)} /> : null;
}

function PeekPortal({ open, overCard, onLeave, onEnter }: { open: Open; overCard: { current: boolean }; onLeave: () => void; onEnter: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  // mede o cartão e mantém dentro da tela (acima do nome se couber, senão abaixo)
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const want = open.below ? open.y : open.y - h;
    setTop(Math.max(8, Math.min(window.innerHeight - h - 8, want)));
  }, [open]);
  const d = open.data;
  const style: CSSProperties = { left: open.x, top: top ?? open.y, visibility: top == null ? 'hidden' : 'visible' };
  return createPortal(
    <div
      ref={ref}
      className="gs-peek"
      style={style}
      role="dialog"
      aria-label={d.nick}
      onPointerEnter={() => { overCard.current = true; onEnter(); }}
      onPointerLeave={() => { overCard.current = false; onLeave(); }}
    >
      <PeekCard data={d} />
    </div>,
    document.body,
  );
}

export function PeekCard({ data: d }: { data: PeekData }) {
  return (
    <>
      <header className="gs-peek__head">
        <span className="gs-peek__ovr" aria-label={d.ovr != null ? `OVR ${d.ovr}` : undefined}>{d.ovr ?? '—'}</span>
        <span className="gs-peek__id">
          <b className="gs-peek__nick">{d.nick}</b>
          <span className="gs-peek__meta">
            {[d.name, d.age != null ? `${d.age} anos` : null, d.team].filter(Boolean).join(' · ')}
          </span>
        </span>
        {d.role && (
          <span className="gs-peek__role"><Crosshair size={12} aria-hidden />{d.role}{d.role2 ? ` / ${d.role2}` : ''}</span>
        )}
      </header>
      {d.attrs && d.attrs.length > 0 && (
        <ul className="gs-peek__attrs">
          {d.attrs.map((a) => (
            <li key={a.label}>
              <span>{a.label}</span>
              <span className="gs-peek__bar" aria-hidden><i style={{ width: `${Math.round((a.value / 20) * 100)}%` }} data-band={attrBand(a.value)} /></span>
              <AttrValue value={a.value} />
            </li>
          ))}
        </ul>
      )}
      {(d.form?.length || d.rating || d.extra?.length) ? (
        <footer className="gs-peek__foot">
          {d.form && d.form.length > 0 && (
            <span className="gs-peek__form" aria-label="Forma recente">
              {d.form.slice(-5).map((f, i) => <i key={i} data-r={f}>{f === 'W' ? 'V' : f === 'L' ? 'D' : 'E'}</i>)}
            </span>
          )}
          {d.rating && <span className="gs-peek__stat"><small>Rating</small>{d.rating}</span>}
          {d.extra?.map((x) => <span key={x.label} className="gs-peek__stat"><small>{x.label}</small>{x.value}</span>)}
        </footer>
      ) : null}
      {d.onOpen && (
        <button type="button" className="gs-peek__open" onClick={d.onOpen}>
          {d.openLabel ?? 'Abrir perfil'} <ArrowUpRight size={14} aria-hidden />
        </button>
      )}
    </>
  );
}
