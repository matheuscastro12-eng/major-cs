import { useEffect, useRef, useState } from 'react';
import { useAccount, beginPix, fetchMe, type PixCharge } from '../state/account';
import { setCheckoutSrc, trackCheckoutAbandon, trackCheckoutOpen, trackPaywallView } from '../state/track';
import { ct } from '../state/career-i18n';
import { FounderCounter } from './FounderCounter';

// Card de ativação (upsell) pra contas GRÁTIS. Abre em momentos estratégicos do
// jogo (fim de split, título conquistado, etc.) via evento global, o usuário pode
// fechar, mas tem um CTA pra criar a conta vitalícia. Respeita um cooldown pra não
// encher o saco. Contas pagas nunca veem.
//
// Disparo de qualquer lugar:  window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'split-win' } }))

const COOLDOWN_MS = 1000 * 60 * 45; // no máximo 1 vez a cada 45 min
const LAST_KEY = 'rtm_upsell_last';

// mensagem do topo por gatilho (contexto), pra parecer natural e não genérico
const HOOKS: Record<string, string> = {
  'split-win': 'Você acabou de conquistar um título. Que tal guardar essa campanha pra sempre?',
  'major': 'Campanha histórica! Não perca esse progresso.',
  'major-stage': 'Você se classificou pro MAJOR! Esse momento é histórico — garante ele na nuvem.',
  'world-1': 'TOPO DO MUNDO! Você é o #1 do VRS. Apoiadores eternizam essa marca no ladder vitalício.',
  'milestone': 'Sua carreira está ficando séria. Garanta que ela não se perca.',
  'save-risk': 'Seu progresso fica só neste navegador. Uma conta guarda tudo na nuvem.',
  'promotion': 'Subiu de divisão! Garanta essa evolução com save na nuvem.',
  'market': 'Montando seu elenco? Save na nuvem pra não perder o time dos sonhos.',
  'ranked-free': 'Você está jogando ranqueada, mas no grátis o MMR não conta no ladder. Ative pra valer.',
  'online-done': 'Boa partida! No grátis o resultado some ao fechar a aba — ative pra contar no ladder mundial.',
  'draft-win': 'Mandou bem no Major! Crie sua conta e leve isso pra uma carreira de verdade.',
  'founder': 'Os 500 primeiros viram FUNDADORES (selo #001–#500). Número baixo é troféu — garanta o seu.',
  'return': 'Que bom te ver de volta! Apoiadores nunca perdem progresso — a conta sincroniza tudo.',
  'custom-builder': 'Modo Custom é exclusivo de Vitalícia: crie sua org E os 5 jogadores manualmente (nick, role, atributos) com coach próprio.',
  'academy-rename': 'Editar o nick dos prospects é exclusivo de Vitalícia. Vire apoiador pra customizar o pipeline da sua academia.',
  default: 'Leve sua carreira pro próximo nível.',
};

export function UpsellCard({ onUpgrade, onPixPaid }: { onUpgrade: () => void; onPixPaid: () => void }) {
  const { account } = useAccount();
  const [open, setOpen] = useState(false);
  const [hook, setHook] = useState(HOOKS.default);
  // Pix inline: contas já autenticadas (é o público do UpsellCard) não precisam de
  // cadastro pra gerar a cobrança — dado real mostra que Pix confirma bem mais que
  // o Stripe (checkout_open×rtm_paid_emails), mas essa superfície só oferecia Stripe.
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [pixBusy, setPixBusy] = useState(false);
  const [pixErr, setPixErr] = useState('');
  const [copied, setCopied] = useState(false);
  const pixOpenedAt = useRef(0);
  const pixConfirmed = useRef(false);

  useEffect(() => {
    const onEvt = (e: Event) => {
      if (account?.paid) return; // pagos nunca veem
      const trigger = (e as CustomEvent).detail?.trigger as string | undefined;
      const force = Boolean((e as CustomEvent).detail?.force); // clique explícito do usuário fura o cooldown
      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      if (!force && Date.now() - last < COOLDOWN_MS) return; // respeita cooldown só nos disparos automáticos
      setHook(HOOKS[trigger ?? 'default'] ?? HOOKS.default);
      setOpen(true);
      trackPaywallView('upsell-card'); // funil: card de upsell exibido (1x/sessão)
      localStorage.setItem(LAST_KEY, String(Date.now()));
    };
    window.addEventListener('rtm:upsell', onEvt);
    return () => window.removeEventListener('rtm:upsell', onEvt);
  }, [account?.paid]);

  // polling do Pix: mesmo padrão do modal de checkout da Landing (pausa em aba
  // oculta, teto de 15min, re-checa ao voltar pra aba).
  useEffect(() => {
    if (!pix) return;
    let alive = true;
    const startedAt = Date.now();
    const CAP_MS = 15 * 60_000;
    const check = async () => {
      try { const me = await fetchMe(); if (alive && me?.paid) { pixConfirmed.current = true; setPix(null); setOpen(false); onPixPaid(); } } catch { /* ignora */ }
    };
    const t = window.setInterval(() => {
      if (Date.now() - startedAt > CAP_MS) { window.clearInterval(t); return; }
      if (document.hidden) return;
      void check();
    }, 6000);
    const onVis = () => { if (alive && !document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [pix, onPixPaid]);

  if (!open || account?.paid) return null;

  const close = () => {
    if (pix && !pixConfirmed.current) trackCheckoutAbandon('pix', (Date.now() - pixOpenedAt.current) / 1000);
    setPix(null); setPixErr(''); setPixBusy(false);
    setOpen(false);
  };

  const payPix = async () => {
    if (pixBusy) return;
    setCheckoutSrc('upsell-card');
    setPixBusy(true); setPixErr('');
    try {
      const charge = await beginPix();
      if (!charge) { setOpen(false); onPixPaid(); return; } // já estava paga
      setPix(charge);
      pixOpenedAt.current = Date.now();
      trackCheckoutOpen('pix'); // funil: QR Pix aberto direto do upsell in-game
    } catch (e) { setPixErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); }
    setPixBusy(false);
  };

  const copyBr = async () => {
    if (!pix?.brCode) return;
    try { await navigator.clipboard.writeText(pix.brCode); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* sem permissão */ }
  };

  return (
    <div className="upsell-overlay" role="dialog" aria-modal="true" onClick={close}>
      <div className="upsell-card" onClick={(e) => e.stopPropagation()}>
        <button className="upsell-x" onClick={close} aria-label={ct('fechar')}>✕</button>
        <div className="upsell-kicker">{ct('Conta vitalícia')}</div>
        <h3 className="upsell-title">{ct(hook)}</h3>
        <ul className="upsell-list">
          <li><b>{ct('Save na nuvem')}</b> {ct('· jogue em qualquer aparelho e nunca perca a carreira')}</li>
          <li><b>{ct('Até 5 carreiras')}</b> {ct('· toque várias orgs ao mesmo tempo')}</li>
          <li><b>{ct('Ranqueada com pontuação')}</b> {ct('· suba no ladder e dispute o topo')}</li>
          <li><b>{ct('Perfil e selo de apoiador')}</b> {ct('· identidade no jogo todo')}</li>
          <li><b>{ct('Selo de Fundador #001–#500')}</b> {ct('· logo própria do clube + número baixo é troféu (500 primeiros)')}</li>
        </ul>
        {/* prova social real: única superfície de venda com tráfego relevante que ainda não mostrava (iter48) */}
        <FounderCounter style={{ marginBottom: '4px' }} />
        <div className="upsell-actions">
          {/* Pix vira o CTA primário aqui: dado real (checkout_open × rtm_paid_emails)
              mostra Pix confirmando bem mais que o Stripe, e essa era a única
              superfície de venda que nunca oferecia Pix (só o redirect pro Stripe). */}
          <button className="btn gold big" disabled={pixBusy} onClick={payPix}>
            {pixBusy ? ct('Aguarde…') : `${ct('Pagar com Pix')} · R$20`}
          </button>
          <button className="upsell-card-btn" disabled={pixBusy} onClick={() => { setCheckoutSrc('upsell-card'); close(); onUpgrade(); }}>
            {ct('Ativar com cartão (Stripe)')}
          </button>
          <button className="upsell-later" onClick={close}>{ct('Agora não')}</button>
        </div>
        {pixErr && <p style={{ color: '#e2574c', fontSize: '0.78rem', margin: '10px 0 0' }}>{pixErr}</p>}
        {pix && (
          <div style={{ marginTop: '14px', background: 'rgba(94,216,138,.08)', border: '1px solid rgba(94,216,138,.35)', borderRadius: '6px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5ed88a', boxShadow: '0 0 8px #5ed88a' }} />
              <b style={{ fontSize: '0.8rem', color: 'var(--em-text, #fff)', letterSpacing: '.5px', textTransform: 'uppercase', fontWeight: 800 }}>{ct('Pague o Pix e o acesso libera sozinho')}</b>
            </div>
            {pix.qrCodeImage && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <img src={pix.qrCodeImage} alt="QR Pix" style={{ width: '180px', height: '180px', background: '#fff', padding: '8px', borderRadius: '8px' }} />
              </div>
            )}
            {pix.brCode && (
              <button type="button" onClick={copyBr}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', cursor: 'pointer', background: copied ? 'rgba(94,216,138,.2)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', color: 'inherit', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                {copied ? ct('Copiado!') : ct('Copiar código Pix')}
              </button>
            )}
            <p style={{ fontSize: '0.72rem', opacity: 0.75, margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
              {ct('Pague no app do banco. Estamos checando: assim que o Pix cair, o acesso libera sozinho.')}
            </p>
          </div>
        )}
        <div className="upsell-foot">{ct('Pagamento único. Sem mensalidade. Apoia o desenvolvimento do jogo.')}</div>
      </div>
    </div>
  );
}
