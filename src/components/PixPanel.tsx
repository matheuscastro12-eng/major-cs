// Tela do QR Pix da conta vitalícia, igual no AccountModal (Landing.tsx) e no
// UpsellCard. Só apresenta: quem chama gera a cobrança (beginPix), faz o polling,
// mede o funil e decide o que acontece no cartão e no "verificar agora".
//
// Celular primeiro (metade do tráfego do Google): o caminho principal é
// "Copiar código Pix" no topo, grande; o QR fica para quem paga de outro
// aparelho. Com mouse (desktop), o QR sobe para o topo (CSS: pointer fine).
// Lógica pura (vista, prazo, tipo de erro): src/state/pixView.ts.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Alert, Button } from './ds/index';
import { ct } from '../state/career-i18n';
import type { PixCharge } from '../state/account';
import {
  PIX_EXPIRY_WARN_MS, formatPixCountdown, pixCanRegenerate, pixExpiresAt, pixPanelView, type PixErrorKind,
} from '../state/pixView';
import '../styles/pix-panel.css';

// Canal de contato que já existe (Legal.tsx, política de reembolso).
const SUPPORT_URL = 'https://x.com/castroomath';

// Clipboard moderno e, se o navegador bloquear (app embutido, sem permissão),
// o plano B do execCommand num textarea temporário DENTRO do painel, pra o foco
// não sair do modal. false = não deu: a tela mostra o código para copiar à mão.
async function copyText(text: string, host: HTMLElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* bloqueado: tenta o plano B */ }
  if (!host) return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  ta.setAttribute('aria-hidden', 'true');
  ta.tabIndex = -1;
  ta.className = 'pix-panel__clip';
  host.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    host.removeChild(ta);
  }
}

const ERROR_COPY: Record<PixErrorKind, { title: string; body: string }> = {
  offline: {
    title: 'Sem conexão agora',
    body: 'O código Pix não foi gerado porque a internet caiu. Confira a conexão e toque em Tentar de novo.',
  },
  session: {
    title: 'Sua sessão expirou',
    body: 'Feche esta janela, entre de novo na sua conta e gere o Pix outra vez.',
  },
  provider: {
    title: 'O Pix não foi gerado',
    body: 'O sistema de pagamento (Woovi) não respondeu. Tente de novo em alguns segundos ou pague com cartão.',
  },
};

function Support() {
  return (
    <p className="pix-panel__support">
      {ct('Já pagou e o acesso não liberou?')}{' '}
      <a href={SUPPORT_URL} target="_blank" rel="noreferrer">{ct('Chame @castroomath no X')}</a>{' '}
      {ct('com o e-mail da conta.')}
    </p>
  );
}

export interface PixPanelProps {
  /** cobrança atual (null enquanto a 1ª não chega ou se ela falhou) */
  charge: PixCharge | null;
  /** quando a cobrança atual chegou (ms), base do prazo do Woovi */
  chargeAt: number;
  /** beginPix() em voo */
  generating: boolean;
  /** a última tentativa de gerar falhou */
  error: PixErrorKind | null;
  /** gera outra cobrança (só aparece com o código expirado ou com erro) */
  onRegenerate: () => void;
  onCard: () => void;
  cardSwitching: boolean;
  /** passou dos 25s esperando: reassurance + "verificar agora" */
  waitLong: boolean;
  onCheckNow: () => void;
  checkingNow: boolean;
  /** o polling automático parou (teto de 15 min) */
  pollPaused: boolean;
  /** linha de contexto acima do título (ex.: o jogador do RtP) */
  note?: ReactNode;
  /** bloco logo abaixo do status (nudge anti-abandono do modal) */
  interrupt?: ReactNode;
  className?: string;
}

export function PixPanel({
  charge, chargeAt, generating, error, onRegenerate, onCard, cardSwitching, waitLong, onCheckNow, checkingNow, pollPaused, note, interrupt, className,
}: PixPanelProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef(0);

  const brCode = charge?.brCode ?? null;
  const expiresAt = charge ? pixExpiresAt(chargeAt, charge.expiresIn) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (expiresAt == null) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= expiresAt) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);

  const view = pixPanelView({
    hasCharge: !!charge,
    hasCode: !!(charge?.brCode || charge?.qrCodeImage),
    generating,
    error: !!error,
    expiresAt,
    now,
  });
  const canRegenerate = pixCanRegenerate(view, !!error);

  // código novo: some o "copiado" do código anterior
  useEffect(() => {
    setCopied(false); setCopiedOnce(false); setCopyFailed(false);
  }, [brCode]);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  // a ação principal de cada vista recebe o foco (teclado e leitor de tela já
  // caem nela; no celular isso também a traz para a vista)
  useEffect(() => {
    if (view !== 'loading') primaryRef.current?.focus();
  }, [view]);

  const copy = async () => {
    if (!brCode) return;
    const ok = await copyText(brCode, rootRef.current);
    if (ok) {
      setCopied(true); setCopiedOnce(true); setCopyFailed(false);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2500);
      primaryRef.current?.focus();
      return;
    }
    setCopyFailed(true);
    window.requestAnimationFrame(() => { codeRef.current?.focus(); codeRef.current?.select(); });
  };

  const msLeft = expiresAt != null ? expiresAt - now : null;
  const errCopy = error ? ERROR_COPY[error] : view === 'error' ? ERROR_COPY.provider : null;
  // o que o leitor de tela ouve depois de copiar (o texto também aparece na tela)
  const copyStatus = copyFailed
    ? ct('Seu navegador bloqueou a cópia. Toque e segure no código abaixo, escolha Selecionar tudo e depois Copiar.')
    : copiedOnce ? ct('Copiado! Agora abra o app do banco e cole em Pix copia e cola.') : '';

  return (
    <section ref={rootRef} className={`pix-panel${className ? ` ${className}` : ''}`} aria-labelledby={titleId} aria-busy={generating || undefined}>
      {note && <p className="pix-panel__context">{note}</p>}
      <div className="pix-panel__head">
        <h3 id={titleId} className="pix-panel__title">{ct('Pague o Pix e o acesso libera sozinho')}</h3>
        {view === 'ready' && (
          <p className="pix-panel__status">
            <span className="pix-panel__dot" aria-hidden />
            <span>{ct('Aguardando o pagamento…')}</span>
            {msLeft != null && (
              <span className={`pix-panel__expiry${msLeft <= PIX_EXPIRY_WARN_MS ? ' pix-panel__expiry--soon' : ''}`}>
                {ct('Expira em')} <b>{formatPixCountdown(msLeft)}</b>
              </span>
            )}
          </p>
        )}
      </div>

      {interrupt}

      {view === 'loading' && (
        <div className="pix-panel__loading" role="status">
          <span className="pix-panel__spin" aria-hidden />
          {ct('Gerando cobrança Pix…')}
        </div>
      )}

      {errCopy && (
        <Alert tone="danger" title={ct(errCopy.title)}>
          <p>{ct(errCopy.body)}</p>
          <Support />
        </Alert>
      )}
      {!errCopy && view === 'expired' && (
        <Alert tone="warn" title={ct('Este código Pix expirou')}>
          <p>{ct('Gere um novo código para pagar. O anterior não vale mais.')}</p>
        </Alert>
      )}
      {canRegenerate && error !== 'session' && (
        <Button ref={primaryRef} variant="primary" size="lg" block loading={generating} icon={<RefreshCw size={18} aria-hidden />} onClick={onRegenerate}>
          {view === 'expired' && !error ? ct('Gerar novo código') : ct('Tentar de novo')}
        </Button>
      )}

      {view === 'ready' && charge && (
        <div className="pix-panel__main">
          <div className="pix-panel__copy">
            {brCode && (
              <Button
                ref={primaryRef}
                variant="primary"
                size="lg"
                block
                icon={copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                onClick={() => void copy()}
              >
                {copied ? ct('Código copiado') : ct('Copiar código Pix')}
              </Button>
            )}
            <p className={`pix-panel__copy-status${copyFailed ? ' pix-panel__copy-status--fail' : ''}`} role="status" aria-live="polite">{copyStatus}</p>
            {copyFailed && brCode && (
              <label className="pix-panel__code">
                <span className="pix-panel__code-label">{ct('Pix copia e cola')}</span>
                <textarea ref={codeRef} className="pix-panel__code-input" readOnly value={brCode} rows={6} onFocus={(e) => e.currentTarget.select()} />
              </label>
            )}
            {brCode && (
              <ol className="pix-panel__steps">
                <li>{ct('Copie o código Pix')}</li>
                <li>{ct('Abra o app do seu banco e escolha Pix copia e cola')}</li>
                <li>{ct('Cole o código e confirme o pagamento')}</li>
              </ol>
            )}
            <p className="pix-panel__note">{ct('Esta tela confirma sozinha assim que o Pix cair — não precisa recarregar. Costuma levar de 1 a 3 minutos.')}</p>
          </div>
          {charge.qrCodeImage && (
            <figure className="pix-panel__qr">
              <figcaption className="pix-panel__qr-label">
                <span className="pix-panel__qr-label--touch">{ct('Vai pagar de outro aparelho? Escaneie este QR Code no app do banco.')}</span>
                <span className="pix-panel__qr-label--mouse">{ct('Abra o app do banco no celular e escaneie o QR Code.')}</span>
              </figcaption>
              <div className="pix-panel__qr-frame">
                <img src={charge.qrCodeImage} alt={ct('QR Code do Pix')} decoding="async" />
              </div>
            </figure>
          )}
        </div>
      )}

      {(view === 'ready' || view === 'expired' || view === 'error') && (
        <div className="pix-panel__more">
          {(waitLong || pollPaused) && view === 'ready' && (
            <>
              <p className="pix-panel__wait">
                {pollPaused
                  ? ct('A checagem automática pausou depois de 15 minutos. Já pagou? Toque em Já paguei, verificar agora.')
                  : ct('Alguns bancos demoram alguns minutos pra confirmar o Pix — pode deixar essa aba aberta, o acesso libera sozinho assim que cair.')}
              </p>
              <Button variant="secondary" block loading={checkingNow} onClick={onCheckNow}>
                {checkingNow ? ct('Checando…') : ct('Já paguei, verificar agora')}
              </Button>
            </>
          )}
          {/* saída honesta pro cartão, visível desde que o QR abre (o Pix segue primário) */}
          {error !== 'session' && (
            <Button variant="secondary" block disabled={cardSwitching} onClick={onCard}>
              {cardSwitching ? ct('Abrindo pagamento…') : view === 'ready' ? ct('Prefere não esperar? Pagar com cartão') : ct('Pagar com cartão')}
            </Button>
          )}
          {pollPaused && view === 'ready' && <Support />}
        </div>
      )}
    </section>
  );
}
