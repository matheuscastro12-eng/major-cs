// CONVITE PARA COMPARTILHAR — o mesmo bloco nos 3 momentos de pico (pick'em
// fechado, fim de uma série, fim da campanha do Major): uma frase e duas ações,
// "Desafie um amigo" e "Postar o card". Quem chama monta o texto, o link e a
// medição (state/shareInvite.ts + state/shareX.ts) e devolve a mensagem de
// retorno, que aparece embaixo dos botões e é lida pelo leitor de tela.
// Sem modal: o convite fica no fluxo da página, logo depois da ação.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImageUp, Swords } from 'lucide-react';
// '../ds/index' = primitivos novos (Panel com icon/tone); './ds' é o wrapper legado
import { Button, Panel, cx } from './ds/index';
import '../styles/share-invite.css';

export interface ShareInviteProps {
  /** cabeçalho do painel; sem ele, o convite entra compacto dentro de outro bloco */
  title?: string;
  icon?: ReactNode;
  lead: ReactNode;
  dareLabel: string;
  cardLabel: string;
  /** cada ação devolve a mensagem de retorno ("Desafio copiado") ou null */
  onDare: () => Promise<string | null>;
  onCard: () => Promise<string | null>;
  /** o desafio é o botão principal; dentro do resultado da série o principal é o Continuar */
  darePrimary?: boolean;
  /** rola até o convite (só se ele estiver fora da tela); depois chama onRevealed */
  reveal?: boolean;
  onRevealed?: () => void;
  /** o convite entrou/saiu da tela (a barra fixa do pick'em some enquanto ele aparece) */
  onVisibleChange?: (visible: boolean) => void;
  children?: ReactNode;
  className?: string;
}

const MSG_MS = 4000;

export function ShareInvite({
  title, icon, lead, dareLabel, cardLabel, onDare, onCard, darePrimary = true,
  reveal = false, onRevealed, onVisibleChange, children, className,
}: ShareInviteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'dare' | 'card' | null>(null);
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // logo depois da ação: traz o convite pra tela se ele nasceu fora dela
  // (o onRevealed vem depois da rolagem: ele desliga o reveal e isso cancelaria o frame)
  useEffect(() => {
    if (!reveal) return;
    const raf = requestAnimationFrame(() => {
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      onRevealed?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [reveal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el || !onVisibleChange || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => onVisibleChange(!!e?.isIntersecting));
    io.observe(el);
    return () => { io.disconnect(); onVisibleChange(false); };
  }, [onVisibleChange]);

  const run = async (which: 'dare' | 'card') => {
    if (busy) return;
    setBusy(which);
    const out = await (which === 'dare' ? onDare() : onCard()).catch(() => null);
    setBusy(null);
    window.clearTimeout(timer.current);
    setMsg(out ?? '');
    if (out) timer.current = window.setTimeout(() => setMsg(''), MSG_MS);
  };

  const body = (
    <>
      <p className="shi__lead">{lead}</p>
      <div className="shi__actions">
        <Button
          variant={darePrimary ? 'primary' : 'secondary'}
          icon={<Swords size={16} aria-hidden />}
          loading={busy === 'dare'}
          disabled={busy === 'card'}
          onClick={() => void run('dare')}
        >
          {dareLabel}
        </Button>
        <Button
          variant="secondary"
          icon={<ImageUp size={16} aria-hidden />}
          loading={busy === 'card'}
          disabled={busy === 'dare'}
          onClick={() => void run('card')}
        >
          {cardLabel}
        </Button>
      </div>
      {children}
      <p className="shi__status" role="status" aria-live="polite">{msg}</p>
    </>
  );

  return (
    <div ref={ref} className={cx('shi', title == null && 'shi--compact', className)}>
      {title != null ? <Panel tone="accent" title={title} icon={icon}>{body}</Panel> : body}
    </div>
  );
}
