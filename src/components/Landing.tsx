// Landing page de marketing — porta fiel do ui_kits/road-to-major/landing.html do
// design system. Hero, modos, planos (grátis x R$20 vitalício), como funciona,
// FAQ, CTA e o modal de conta (que dispara o checkout real via Stripe).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrandMark } from './brand';
import { Button, Modal } from './ds';
import { AnnouncementTweet, TwitterLink } from './social';
import { LegalLinks } from './Legal';
import { LEGAL_PATHS } from '../legal';
import { login, signup, beginPix, fetchMe, type PixCharge } from '../state/account';
import { ct } from '../state/career-i18n';

const M = '/maps/';

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const els = Array.from(ref.current.querySelectorAll<HTMLElement>('.rtm-reveal'));
    els.forEach((el) => { if (el.getBoundingClientRect().top > window.innerHeight * 0.9) el.classList.add('anim'); });
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    const safety = window.setTimeout(() => els.forEach((el) => el.classList.add('in')), 1600);
    return () => { io.disconnect(); window.clearTimeout(safety); };
  }, []);
  return ref;
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="rtm-reveal" style={{ textAlign: 'center', marginBottom: '34px' }}>
      <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--rtm-gold)' }}>{kicker}</span>
      <h2 style={{ fontFamily: 'var(--font-cond)', fontSize: '38px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--rtm-text-strong)', margin: '8px 0 0' }}>{title}</h2>
      {sub && <p style={{ color: 'var(--rtm-dim)', fontSize: '15px', maxWidth: '560px', margin: '12px auto 0' }}>{sub}</p>}
    </div>
  );
}

function Nav({ onAccount, onLogin, onPlay }: { onAccount: () => void; onLogin: () => void; onPlay: () => void }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const h = () => setSolid(window.scrollY > 40);
    window.addEventListener('scroll', h); return () => window.removeEventListener('scroll', h);
  }, []);
  const links: [string, string][] = [['modos', 'Modos'], ['conta', 'Conta'], ['como', 'Como funciona'], ['faq', 'Perguntas']];
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 60, background: solid ? 'rgba(24,29,35,.92)' : 'transparent', backdropFilter: solid ? 'blur(10px)' : 'none', borderBottom: `1px solid ${solid ? 'var(--rtm-border-soft)' : 'transparent'}`, transition: 'background .25s, border-color .25s' }}>
      <div className="lp-wrap" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 22px' }}>
        <a href="#topo" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
          <BrandMark size={30} />
          <span style={{ fontFamily: 'var(--font-cond)', fontSize: '20px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Road to <span style={{ color: 'var(--em-gold)' }}>Major</span></span>
        </a>
        <nav className="l-nav-links" style={{ display: 'flex', gap: '6px', flex: 1, justifyContent: 'center' }}>
          {links.map(([id, lbl]) => <a key={id} href={'#' + id} style={{ color: 'var(--rtm-dim)', fontSize: '13px', fontWeight: 600, padding: '8px 12px' }}>{ct(lbl)}</a>)}
        </nav>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '10px' }}>
          <Button variant="ghost" size="sm" onClick={onLogin}>{ct('Entrar')}</Button>
          <Button variant="ghost" size="sm" onClick={onAccount}>{ct('Criar conta')}</Button>
          <Button size="sm" onClick={onPlay}>{ct('Jogar agora')}</Button>
        </span>
      </div>
    </header>
  );
}

function Hero({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  return (
    <section id="topo" style={{ position: 'relative', overflow: 'hidden', marginTop: '-66px', paddingTop: '66px' }}>
      <img src={M + 'mirage.jpg'} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 500px at 50% 0, rgba(67,130,182,.25), transparent 70%), linear-gradient(180deg, rgba(13,17,22,.7) 0%, rgba(24,29,35,.96) 78%, var(--rtm-bg) 100%)' }} />
      <div className="lp-wrap" style={{ position: 'relative', textAlign: 'center', padding: '56px 22px 44px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '999px', background: 'rgba(216,169,67,.12)', border: '1px solid var(--rtm-gold-soft)', color: 'var(--rtm-gold)', fontSize: '12px', fontWeight: 700, letterSpacing: '.5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--rtm-green-bright)' }} /> {ct('Beta aberto, joga de graça no navegador')}
        </span>
        <h1 className="l-hero-h1" style={{ fontFamily: 'var(--font-cond)', fontSize: '74px', fontWeight: 700, letterSpacing: '4px', margin: '18px 0 0', textTransform: 'uppercase', color: 'var(--rtm-text-strong)', lineHeight: 0.98, textShadow: '0 0 40px rgba(97,168,221,.35)' }}>
          {ct('Monte o time dos sonhos')}<br /><span style={{ color: 'var(--em-gold)' }}>{ct('de todas as eras do CS')}</span>
        </h1>
        <p style={{ color: 'var(--rtm-dim)', fontSize: '17px', maxWidth: '620px', margin: '18px auto 0', lineHeight: 1.55 }}>
          {ct('Sorteie lendas de 1.6, Source, CS:GO e CS2. Escolha cinco, contrate o coach e leve o seu elenco até o título do Major. Fase suíça, playoffs, veto de mapa e scoreboard no estilo HLTV.')}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '28px', flexWrap: 'wrap' }}>
          <Button size="big" onClick={onPlay}>{ct('Jogar agora, de graça')}</Button>
          <Button size="big" variant="gold" onClick={onAccount}>{ct('Save na nuvem por R$20')}</Button>
        </div>
        <div style={{ display: 'flex', gap: '22px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap', color: 'var(--rtm-faint)', fontSize: '13px' }}>
          <span><b style={{ color: 'var(--rtm-text-strong)' }}>16</b> {ct('times')}</span>
          <span><b style={{ color: 'var(--rtm-text-strong)' }}>5</b> {ct('eras de CS')}</span>
          <span><b style={{ color: 'var(--rtm-text-strong)' }}>3</b> {ct('modos de jogo')}</span>
          <span>{ct('Dados de HLTV e Liquipedia')}</span>
        </div>
      </div>
    </section>
  );
}

function Modes({ onPlay }: { onPlay: () => void }) {
  const [tab, setTab] = useState(0);
  const MODES = [
    { id: 'career', tone: 'var(--rtm-gold)', kicker: 'Campanha longa', title: 'Carreira', img: M + 'nuke.jpg', desc: 'Funde a sua organização, monte o elenco, gerencie transferências e dispute uma temporada inteira rumo ao título.', bullets: ['Hub da organização com química do time', 'Mercado de transferências com orçamento', 'Perfis de jogador e de time clicáveis', 'Killfeed ao vivo na partida'] },
    { id: 'draft', tone: 'var(--em-gold)', kicker: 'Partida rápida', title: 'Draft', img: M + 'mirage.jpg', desc: 'Gire a roleta, pegue uma lenda de cada elenco histórico e jogue um Major de uma sentada só. Rápido e diferente toda vez.', bullets: ['Roleta de sorteio estilo abertura de caixa', 'Cinco escolhas mais o coach', 'Pick Em nas outras partidas da chave', 'Fase suíça completa com playoffs'] },
    { id: 'online', tone: 'var(--rtm-green-bright)', kicker: 'Competitivo', title: 'Online', img: M + 'dust2.jpg', desc: 'Snake draft contra um rival de verdade e melhor de três pra valer pontos. Suba no ranking e prove que conhece CS.', bullets: ['Matchmaking por MMR', 'Draft alternado contra o rival', 'Ranking e ladder da temporada', 'Histórico salvo (precisa de conta)'] },
  ];
  const m = MODES[tab];
  return (
    <section id="modos" className="lp-wrap" style={{ padding: '70px 22px' }}>
      <SectionHead kicker={ct('Três jeitos de jogar')} title={ct('Escolha o seu modo')} />
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '22px', flexWrap: 'wrap' }}>
        {MODES.map((x, i) => (
          <button key={x.id} type="button" onClick={() => setTab(i)} style={{ cursor: 'pointer', borderRadius: '999px', padding: '9px 22px', fontFamily: 'var(--font-cond)', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', border: `1px solid ${i === tab ? x.tone : 'var(--rtm-border)'}`, background: i === tab ? x.tone : 'transparent', color: i === tab ? '#06121d' : 'var(--rtm-dim)', transition: 'all .15s' }}>{ct(x.title)}</button>
        ))}
      </div>
      <div className="rtm-reveal in l-grid2" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '20px', alignItems: 'stretch', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ position: 'relative', minHeight: '300px', overflow: 'hidden' }}>
          <img key={m.img} src={m.img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,17,22,.2), rgba(13,17,22,.85))' }} />
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: m.tone }} />
          <span style={{ position: 'absolute', bottom: '20px', left: '22px', fontFamily: 'var(--font-cond)', fontSize: '40px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>{ct(m.title)}</span>
        </div>
        <div style={{ padding: '26px 26px 26px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', color: m.tone }}>{ct(m.kicker)}</span>
          <p style={{ color: 'var(--rtm-text)', fontSize: '15px', lineHeight: 1.55, margin: '10px 0 16px' }}>{ct(m.desc)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {m.bullets.map((b, i) => <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--rtm-dim)' }}><span style={{ color: m.tone, fontWeight: 800 }}>✓</span> {ct(b)}</span>)}
          </div>
          <Button style={{ marginTop: '22px', alignSelf: 'flex-start' }} onClick={onPlay}>{ct('Abrir o jogo')}</Button>
        </div>
      </div>
    </section>
  );
}

function Pricing({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  const FREE = ['Os três modos liberados', 'Save no navegador (localStorage)', 'Roleta, draft e Major completos', 'Sem ranking salvo no online'];
  const PAID = ['Todo o gameplay continua gratuito', 'Save na nuvem, joga de qualquer lugar', 'Ranking e MMR salvos no online', 'Histórico de todas as partidas', 'Selo de apoiador no perfil', 'Pagamento único, sem mensalidade'];
  return (
    <section id="conta" className="lp-wrap" style={{ padding: '60px 22px' }}>
      <SectionHead kicker={ct('Conta e save')} title={ct('Grátis pra jogar, conta pra valer pontos')} sub={ct('Você joga tudo de graça com save no navegador. A conta guarda o seu progresso na nuvem e libera o ranking salvo do modo online.')} />
      <div className="rtm-reveal l-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: '18px', alignItems: 'stretch', maxWidth: '880px', margin: '0 auto' }}>
        <div style={{ background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: '12px', padding: '26px 24px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--rtm-dim)' }}>{ct('Sem conta')}</span>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: '44px', fontWeight: 800, color: 'var(--rtm-text-strong)', margin: '6px 0 2px' }}>R$0</div>
          <span style={{ fontSize: '13px', color: 'var(--rtm-faint)', marginBottom: '18px' }}>{ct('Joga agora, save só neste navegador')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', flex: 1 }}>
            {FREE.map((f, i) => <span key={i} style={{ display: 'flex', gap: '10px', fontSize: '14px', color: 'var(--rtm-dim)' }}><span style={{ color: 'var(--em-gold)', fontWeight: 800 }}>✓</span>{ct(f)}</span>)}
          </div>
          <Button variant="ghost" style={{ marginTop: '22px', width: '100%' }} onClick={onPlay}>{ct('Jogar de graça')}</Button>
        </div>
        <div style={{ position: 'relative', background: 'linear-gradient(160deg, rgba(216,169,67,.12), var(--rtm-panel))', border: '1px solid var(--rtm-gold-soft)', borderRadius: '12px', padding: '26px 24px', display: 'flex', flexDirection: 'column', boxShadow: '0 0 0 1px rgba(216,169,67,.18), 0 12px 36px rgba(0,0,0,.4)' }}>
          <span style={{ position: 'absolute', top: '18px', right: '20px', fontSize: '10px', fontWeight: 800, letterSpacing: '.8px', textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '4px 10px', borderRadius: '999px' }}>{ct('Recomendado')}</span>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--rtm-gold)' }}>{ct('Conta com save na nuvem')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '6px 0 2px' }}>
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: '44px', fontWeight: 800, color: 'var(--rtm-gold)' }}>R$20</span>
            <span style={{ fontSize: '13px', color: 'var(--rtm-dim)' }}>{ct('uma vez, sem assinatura')}</span>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--rtm-faint)', marginBottom: '18px' }}>{ct('Persistência enquanto o serviço estiver em operação')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', flex: 1 }}>
            {PAID.map((f, i) => <span key={i} style={{ display: 'flex', gap: '10px', fontSize: '14px', color: i === 0 ? 'var(--rtm-dim)' : 'var(--rtm-text)' }}><span style={{ color: 'var(--rtm-gold)', fontWeight: 800 }}>✓</span>{ct(f)}</span>)}
          </div>
          <Button variant="gold" style={{ marginTop: '22px', width: '100%' }} onClick={onAccount}>{ct('Ativar conta com save')}</Button>
        </div>
      </div>
      <p className="rtm-reveal" style={{ textAlign: 'center', color: 'var(--rtm-faint)', fontSize: '12.5px', marginTop: '18px' }}>
        {ct('O jogo completo é gratuito. Os R$20 cobrem conta, banco de dados e persistência em nuvem, sem mensalidade.')}
      </p>
    </section>
  );
}

function How() {
  const STEPS: [string, string, string][] = [
    ['01', 'Crie o seu manager', 'Nick, idade, país e a cor da sua organização. Leva dez segundos.'],
    ['02', 'Monte o elenco', 'Sorteie elencos históricos e escolha uma lenda de cada era, mais o coach.'],
    ['03', 'Dispute o Major', 'Veto de mapa, killfeed ao vivo e scoreboard. Vença a suíça e os playoffs.'],
    ['04', 'Suba no ranking', 'No online você ganha MMR. Com conta, tudo fica salvo na nuvem.'],
  ];
  return (
    <section id="como" className="lp-wrap" style={{ padding: '60px 22px' }}>
      <SectionHead kicker={ct('Começar é simples')} title={ct('Como funciona')} />
      <div className="rtm-reveal l-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {STEPS.map(([n, t, d]) => (
          <div key={n} style={{ background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: 'var(--rtm-radius)', padding: '22px 18px' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: '36px', fontWeight: 800, color: 'var(--em-gold)', lineHeight: 1 }}>{n}</div>
            <h3 style={{ fontFamily: 'var(--font-cond)', fontSize: '19px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--rtm-text-strong)', margin: '12px 0 6px' }}>{ct(t)}</h3>
            <p style={{ color: 'var(--rtm-dim)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>{ct(d)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const Q: [string, string][] = [
    ['Preciso pagar pra jogar?', 'Não. Os três modos estão liberados de graça e o save fica no seu navegador. A conta de R$20 serve pra guardar o progresso na nuvem e liberar o ranking salvo do online.'],
    ['O que a conta me dá?', 'Save na nuvem pra jogar de qualquer aparelho, ranking e MMR persistentes no modo online, histórico de partidas e um selo de apoiador. Nenhum modo ou vantagem de gameplay é vendido.'],
    ['Por que o ranking online pede conta?', 'O ranking precisa guardar o seu histórico em servidor pra ser justo e não dar pra burlar. Sem conta você ainda joga partidas online, mas elas não contam pontos salvos.'],
    ['Se eu não criar conta, perco o progresso?', 'O progresso fica salvo no localStorage do navegador. Se você limpar o cache ou trocar de aparelho, ele some. Com conta isso não acontece.'],
    ['Como pago os R$20?', 'Cartão pelo Stripe ou Pix pelo Woovi. É um pagamento único pelos recursos persistentes, válido enquanto o Road to Major continuar em operação, conforme os Termos.'],
    ['De onde vêm os jogadores e times?', 'Os elencos e dados são curados a partir de HLTV e Liquipedia, cobrindo as cinco eras do Counter-Strike.'],
  ];
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-wrap" style={{ padding: '60px 22px', maxWidth: '820px' }}>
      <SectionHead kicker={ct('Tirando dúvidas')} title={ct('Perguntas frequentes')} />
      <div className="rtm-reveal" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Q.map(([q, a], i) => {
          const on = open === i;
          return (
            <div key={i} style={{ background: 'var(--rtm-panel)', border: `1px solid ${on ? 'var(--em-gold)' : 'var(--rtm-border-soft)'}`, borderRadius: 'var(--rtm-radius)', overflow: 'hidden' }}>
              <button type="button" onClick={() => setOpen(on ? -1 : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 18px', textAlign: 'left' }}>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: '17px', fontWeight: 700, color: 'var(--rtm-text-strong)' }}>{ct(q)}</span>
                <span style={{ color: 'var(--em-gold)', fontSize: '20px', fontWeight: 700, transform: on ? 'rotate(45deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>+</span>
              </button>
              {on && <div style={{ padding: '0 18px 16px', color: 'var(--rtm-dim)', fontSize: '14px', lineHeight: 1.6 }}>{ct(a)}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  return (
    <section className="lp-wrap" style={{ padding: '40px 22px 70px' }}>
      <div className="rtm-reveal" style={{ position: 'relative', overflow: 'hidden', borderRadius: '14px', border: '1px solid var(--rtm-gold-soft)', textAlign: 'center', padding: '46px 26px' }}>
        <img src={M + 'nuke.jpg'} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.22 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 300px at 50% 0, rgba(216,169,67,.18), transparent 70%), rgba(13,17,22,.7)' }} />
        <div style={{ position: 'relative' }}>
          <BrandMark size={56} />
          <h2 style={{ fontFamily: 'var(--font-cond)', fontSize: '44px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--rtm-text-strong)', margin: '14px 0 8px', lineHeight: 1 }}>{ct('O título não é dado, é conquistado')}</h2>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '16px', maxWidth: '520px', margin: '0 auto 24px' }}>{ct('Comece de graça agora. Quando quiser salvar tudo e disputar o ranking, é só criar a sua conta.')}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button size="big" onClick={onPlay}>{ct('Jogar agora')}</Button>
            <Button size="big" variant="gold" onClick={onAccount}>{ct('Ativar save na nuvem')}</Button>
          </div>
        </div>
      </div>
      <footer className="landing-legal-footer">
        <span className="landing-footer-brand"><BrandMark size={22} /> Road to Major</span>
        <span>{ct('Produto comercial independente, não afiliado ou endossado pela Valve, HLTV, Liquipedia, equipes ou jogadores.')}</span>
        <LegalLinks />
      </footer>
    </section>
  );
}

export function AccountModal({ onClose, onCheckout, onPlay, initialMode = 'signup' }: { onClose: () => void; onCheckout: (email: string, nick: string) => Promise<void>; onPlay: () => void; initialMode?: 'signup' | 'login' }) {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [accepted, setAccepted] = useState(false);
  // Pix Woovi (merge origin/master) + visual em-* (HEAD)
  const [pix, setPix] = useState<{ charge: PixCharge; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // polling: confere se a conta já virou paga (o webhook do Woovi é quem marca; este
  // poll só detecta pra liberar a tela). Guardas de custo: (1) pausa em aba oculta —
  // se o pagamento cair com a aba escondida, o webhook já gravou paid e o retorno à
  // aba re-checa na hora; (2) 6s em vez de 4s (imperceptível ao esperar pagamento);
  // (3) teto de 15min (o Pix expira) pra não bater /api/account pra sempre numa aba
  // esquecida. Antes: 4s sem guarda nenhuma = ~900 req/h de invocação à toa.
  useEffect(() => {
    if (!pix) return;
    let alive = true;
    const startedAt = Date.now();
    const CAP_MS = 15 * 60_000;
    const check = async () => {
      try { const me = await fetchMe(); if (alive && me?.paid) { setPix(null); onPlay(); } } catch { /* ignora */ }
    };
    const t = setInterval(() => {
      if (Date.now() - startedAt > CAP_MS) { clearInterval(t); return; } // Pix expirou
      if (document.hidden) return;                                       // aba oculta: webhook cobre
      void check();
    }, 6000);
    const onVis = () => { if (alive && !document.hidden) void check(); }; // voltou à aba: re-checa já
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [pix, onPlay]);
  // Input/label nativos puxam os overrides em-* via body.career-dash (Fase 0/1),
  // então não precisamos mais de inline style nos campos.
  const input: CSSProperties = { width: '100%' };
  const lbl: CSSProperties = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--em-muted)', display: 'block', marginBottom: '6px' };
  const valid = /\S+@\S+\.\S+/.test(email) && pw.length >= 6 && (mode === 'login' || accepted);
  const go = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const acct = mode === 'signup' ? await signup(email.trim(), pw, nick.trim()) : await login(email.trim(), pw);
      if (acct.paid) { onPlay(); return; }           // já tem conta vitalícia: entra direto
      await onCheckout(acct.email, acct.nick || nick.trim()); // segue pro pagamento
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); setBusy(false); }
  };
  // Pix via Woovi (merged de origin/master): cria/entra na conta, gera a cobrança
  // e mostra QR + copia-e-cola INLINE. O webhook (/api/woovi-webhook) marca a conta
  // como paga e o polling acima detecta na mesma tela e libera o acesso.
  const goPix = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const acct = mode === 'signup' ? await signup(email.trim(), pw, nick.trim()) : await login(email.trim(), pw);
      if (acct.paid) { onPlay(); return; }
      const charge = await beginPix();
      if (!charge) { onPlay(); return; } // já estava paga
      setPix({ charge, email: acct.email });
      setBusy(false);
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); setBusy(false); }
  };
  const copyBr = async () => {
    if (!pix?.charge.brCode) return;
    try { await navigator.clipboard.writeText(pix.charge.brCode); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* sem permissão */ }
  };
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandMark size={22} />
      <span>{mode === 'signup' ? ct('Criar conta') : ct('Entrar')}</span>
    </span>
  );
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      {mode === 'signup' && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--em-gold)' }}>R$20</span>
          <span style={{ fontSize: '0.82rem', color: 'var(--em-muted)' }}>{ct('pagamento único pelo save em nuvem')}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {mode === 'signup' && <div><label style={lbl}>{ct('Nick de manager')}</label><input style={input} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="br4z1l_zera" maxLength={24} /></div>}
        <div><label style={lbl}>{ct('E-mail')}</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ct("voce@email.com")} type="email" autoComplete="email" /></div>
        <div><label style={lbl}>{ct('Senha')}</label><input style={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={ct('mínimo 6 caracteres')} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onKeyDown={(e) => e.key === 'Enter' && go()} /></div>
      </div>
      {mode === 'signup' && (
        <label className="checkout-legal-accept">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>{ct('Li e aceito os')} <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer">{ct('Termos')}</a> {ct('e a')} <a href={LEGAL_PATHS.refund} target="_blank" rel="noreferrer">{ct('Política de Reembolso')}</a>{ct(', consultei a')} <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer">{ct('Privacidade')}</a> {ct('e confirmo ser maior de 18 anos ou responsável legal pela compra.')}</span>
        </label>
      )}
      {err && <p style={{ color: '#e2574c', fontSize: '0.8rem', margin: '12px 0 0' }}>{err}</p>}
      <Button variant="gold" disabled={!valid || busy} style={{ width: '100%', marginTop: '20px' }} onClick={go}>{busy ? ct('Aguarde…') : mode === 'signup' ? ct('Ativar com cartão (Stripe)') : ct('Entrar')}</Button>
      {mode === 'signup' && (
        <button type="button" disabled={!valid || busy} onClick={goPix}
          style={{ width: '100%', marginTop: '10px', padding: '11px', borderRadius: '6px', cursor: !valid || busy ? 'default' : 'pointer', opacity: !valid || busy ? 0.5 : 1, background: 'rgba(94,216,138,.12)', border: '1px solid rgba(94,216,138,.55)', color: '#5ed88a', fontWeight: 700, fontSize: '0.84rem', fontFamily: 'inherit' }}>
          {ct('Pagar com Pix (Woovi)')}
        </button>
      )}
      {pix && (
        <div style={{ marginTop: '14px', background: 'rgba(94,216,138,.08)', border: '1px solid rgba(94,216,138,.35)', borderRadius: '6px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5ed88a', boxShadow: '0 0 8px #5ed88a', animation: 'pulse 1.4s infinite' }} />
            <b style={{ fontSize: '0.82rem', color: 'var(--em-text)', letterSpacing: '.5px', textTransform: 'uppercase', fontWeight: 800 }}>{ct('Pague o Pix e o acesso libera sozinho')}</b>
          </div>
          {pix.charge.qrCodeImage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <img src={pix.charge.qrCodeImage} alt="QR Pix" style={{ width: '200px', height: '200px', background: '#fff', padding: '8px', borderRadius: '8px' }} />
            </div>
          )}
          {pix.charge.brCode && (
            <>
              <label style={lbl}>{ct('Pix copia e cola')}</label>
              <textarea readOnly value={pix.charge.brCode} rows={3} onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                style={{ ...input, fontFamily: 'monospace', fontSize: '0.72rem', resize: 'none', wordBreak: 'break-all' }} />
              <button type="button" onClick={copyBr}
                style={{ width: '100%', marginTop: '8px', padding: '9px', borderRadius: '6px', cursor: 'pointer', background: copied ? 'rgba(94,216,138,.2)' : 'var(--em-panel-2)', border: '1px solid var(--em-border)', color: 'var(--em-text)', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                {copied ? ct('Copiado!') : ct('Copiar código Pix')}
              </button>
            </>
          )}
          <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            {ct('Pague no app do banco. Estamos checando: assim que o Pix cair, o acesso libera nesta tela.')}
          </p>
        </div>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--em-muted)', textAlign: 'center', margin: '14px 0 0' }}>
        {mode === 'signup' ? ct('Já tem conta? ') : ct('Não tem conta? ')}
        <button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); }} style={{ background: 'none', border: 'none', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{mode === 'signup' ? ct('Entrar') : ct('Criar conta')}</button>
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', opacity: 0.75, textAlign: 'center', margin: '10px 0 0' }}>{ct('Cartão pelo Stripe ou Pix pelo Woovi. Todo o jogo permanece gratuito; a conta paga apenas mantém dados na nuvem.')}</p>
    </Modal>
  );
}

// banda de novidades: o tweet de anúncio do @castroomath como prova social, logo
// abaixo dos modos e antes do plano (momento de decisão).
function TweetBand() {
  return (
    <section id="novidades" className="lp-wrap" style={{ padding: '50px 22px', textAlign: 'center' }}>
      <div className="rtm-reveal" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--rtm-gold)', fontWeight: 800, marginBottom: '6px' }}>{ct('Acompanhe o projeto')}</div>
        <h2 style={{ fontFamily: 'var(--font-cond)', fontSize: '30px', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--rtm-text-strong)', margin: '0 0 6px' }}>{ct('Novidades direto do X')}</h2>
        <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', margin: '0 0 22px' }}>{ct('Updates, bastidores e o anúncio oficial do Road to Major.')}</p>
        <AnnouncementTweet />
        <div style={{ marginTop: '20px' }}><TwitterLink /></div>
      </div>
    </section>
  );
}

export function Landing({ onPlay, onCheckout, openSignup }: { onPlay: () => void; onCheckout: (email: string, nick: string) => Promise<void>; openSignup?: boolean }) {
  const [acct, setAcct] = useState(!!openSignup); // deep-link /?criar abre direto o cadastro
  const [acctMode, setAcctMode] = useState<'signup' | 'login'>('signup');
  const ref = useReveal();
  const openAcct = (mode: 'signup' | 'login' = 'signup') => { setAcctMode(mode); setAcct(true); };
  return (
    <div ref={ref} className="lp-root">
      <Nav onAccount={() => openAcct('signup')} onLogin={() => openAcct('login')} onPlay={onPlay} />
      <Hero onAccount={() => openAcct('signup')} onPlay={onPlay} />
      <Modes onPlay={onPlay} />
      <TweetBand />
      <Pricing onAccount={() => openAcct('signup')} onPlay={onPlay} />
      <How />
      <Faq />
      <FinalCta onAccount={() => openAcct('signup')} onPlay={onPlay} />
      {acct && <AccountModal onClose={() => setAcct(false)} onCheckout={onCheckout} onPlay={onPlay} initialMode={acctMode} />}
    </div>
  );
}
