// Landing page de marketing (rota /). Mesma identidade da interface nova do
// jogo: marinho + dourado da marca, escudo, Oswald/Barlow. Hero com UMA ação
// principal (jogar de graça), a vitrine com capturas reais de cada modo, o
// destaque da sala do Road to Pro, planos (grátis x conta vitalícia de R$20),
// como funciona, FAQ, CTA final e o modal de conta (checkout real: Pix/Stripe).
// Estilos em src/styles/landing.css (só tokens).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, Crosshair, Eye, Gauge, Gift, Globe, Layers, Play, Swords, Target, Trophy, Star } from 'lucide-react';
import { setCheckoutSrc, trackCheckoutAbandon, trackCheckoutOpen, trackPaywallView, trackSignup } from '../state/track';
import { BrandMark } from './brand';
import { FounderCounter } from './FounderCounter';
import { Button, Modal } from './ds';
import { AnnouncementTweet, TwitterLink } from './social';
import { LegalLinks } from './Legal';
import { LEGAL_PATHS } from '../legal';
import { login, signup, beginPix, fetchMe, requestPasswordReset, confirmPasswordReset, type PixCharge } from '../state/account';
import { ct } from '../state/career-i18n';
import { loadGhost } from '../state/ghost';
import { loadDuelInvite } from '../state/duelInvite';
import { dateKeyOf, dayNumberOf } from '../engine/daily/lines';
// [URG-2] evento de fim de semana: banner público (deslogado também) com contador e a carta exclusiva
import { fetchActiveLiveops } from '../state/liveops';
import { weekendEventView, weekendExclusiveCard, type WeekendEventView } from '../state/weekendEvent';
import { formatCountdown } from '../engine/ultimate/weekendEvent';
import { useCommunityGoalPublic } from '../state/communityGoal'; // [URG-5]
import '../styles/landing.css';

// capturas reais da interface do jogo (public/landing/, WebP)
const SHOT = '/landing/';

// Revela as seções abaixo da dobra ao entrar na tela. Quem já está visível no
// carregamento nunca some; a trava de segurança (1,6s) garante que nada fica
// escondido se o IntersectionObserver não disparar. Sem movimento liberado, o
// CSS ignora a classe (landing.css: prefers-reduced-motion).
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const els = Array.from(ref.current.querySelectorAll<HTMLElement>('.lp-reveal'));
    els.forEach((el) => { if (el.getBoundingClientRect().top > window.innerHeight * 0.9) el.classList.add('anim'); });
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    const safety = window.setTimeout(() => els.forEach((el) => el.classList.add('in')), 1600);
    return () => { io.disconnect(); window.clearTimeout(safety); };
  }, []);
  return ref;
}

function SectionHead({ kicker, title, sub, center = false, id }: { kicker?: string; title: ReactNode; sub?: string; center?: boolean; id?: string }) {
  return (
    <div className={`lp-head lp-reveal${center ? ' lp-head--center' : ''}`}>
      {kicker && <span className="lp-kicker">{kicker}</span>}
      <h2 className="lp-h2" id={id}>{title}</h2>
      {sub && <p className="lp-lead">{sub}</p>}
    </div>
  );
}

function Wordmark() {
  return <span className="lp-wordmark">Road to <b>Major</b></span>;
}

// Nav fixa: fica sólida quando o topo sai da tela (sentinela observada, sem
// listener de scroll). "Criar conta · R$20" é o único CTA de cadastro com preço
// no próprio texto (src landing-nav); some no celular pra caber o essencial.
function Nav({ onAccount, onLogin, onPlay }: { onAccount: () => void; onLogin: () => void; onPlay: () => void }) {
  const [solid, setSolid] = useState(false);
  const sentinel = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSolid(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const links: [string, string][] = [['modos', 'Modos'], ['conta', 'Conta'], ['como', 'Como funciona'], ['faq', 'Perguntas']];
  return (
    <>
      <span ref={sentinel} aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 24 }} />
      <header className="lp-nav" data-solid={solid}>
        <div className="lp-wrap lp-nav__bar">
          <a href="#topo" className="lp-brand" aria-label="Road to Major, início">
            <BrandMark size={30} />
            <Wordmark />
          </a>
          <nav className="lp-nav__links" aria-label={ct('Seções')}>
            {links.map(([id, lbl]) => <a key={id} href={'#' + id}>{ct(lbl)}</a>)}
          </nav>
          <span className="lp-nav__actions">
            <Button variant="ghost" size="sm" onClick={onLogin}>{ct('Entrar')}</Button>
            <Button variant="gold" size="sm" className="lp-nav__acct" onClick={onAccount}>{ct('Criar conta')} · R$20</Button>
            <Button size="sm" onClick={onPlay}>{ct('Jogar agora')}</Button>
          </span>
        </div>
      </header>
    </>
  );
}

// [URG-5] META DA COMUNIDADE: faixa fina acima da dobra, visível deslogado.
// Número REAL do servidor (GET público cacheado no edge); sem dado, não renderiza.
function CommunityGoalBar({ onPlay }: { onPlay: () => void }) {
  const week = useCommunityGoalPublic();
  if (!week) return null;
  const done = week.reached;
  return (
    <button type="button" className="lp-notice lp-notice--goal" data-done={done} onClick={onPlay}>
      <Globe size={16} aria-hidden />
      <span><b>{ct('Meta da comunidade')}:</b> {week.total.toLocaleString('pt-BR')}/{week.target.toLocaleString('pt-BR')} {ct('partidas esta semana')}{done ? ` · ${ct('batida!')}` : ''}</span>
      <span className="lp-notice__meter" aria-hidden><span style={{ width: `${week.pct}%` }} /></span>
      <span className="lp-notice__cta">{ct('Jogar no Ultimate')} <ArrowRight size={14} aria-hidden /></span>
    </button>
  );
}

function Hero({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  return (
    <section id="topo" className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-wrap lp-hero__grid">
        <div className="lp-hero__copy">
          <span className="lp-badge"><span className="lp-badge__live" aria-hidden /> {ct('Beta aberto, joga de graça no navegador')}</span>
          <h1 className="lp-h1" id="lp-hero-title">
            {ct('Seu time de CS')} <span>{ct('rumo ao Major')}</span>
          </h1>
          <p className="lp-hero__sub">
            {ct('Manager e simulador de Counter-Strike no navegador. Comande uma org, viva a carreira de pro ou dispute a ranqueada online, no PC e no celular.')}
          </p>
          <div className="lp-hero__cta">
            <Button size="big" onClick={onPlay}>{ct('Jogar agora, de graça')} <Play size={18} aria-hidden /></Button>
            {/* funil: o CTA pago do Hero é a maior exposição do funil (paywall_view
                src=landing). Continua aqui, mas como link: não disputa com o jogar.
                Preço + "pagamento único" no próprio texto (a reassurance que já
                ajudou nas outras superfícies) e o contador REAL de Fundadores. */}
            <div className="lp-offer">
              <button type="button" className="lp-textlink" onClick={onAccount}>{ct('Criar conta')} · R$20</button>
              <span>{ct('Pagamento único · sem mensalidade')}</span>
            </div>
            <FounderCounter />
          </div>
        </div>
        <div className="lp-hero__stage">
          <div className="lp-screen">
            <img
              src={SHOT + 'hero-carreira-1440.webp'}
              srcSet={`${SHOT}hero-carreira-800.webp 800w, ${SHOT}hero-carreira-1440.webp 1440w`}
              sizes="(min-width: 1180px) 640px, (min-width: 960px) 52vw, calc(100vw - 32px)"
              width={1440}
              height={900}
              fetchPriority="high"
              decoding="async"
              alt={ct('Tela da Carreira no Road to Major: próximo jogo, relatório do adversário, finanças e ranking mundial')}
            />
          </div>
          <div className="lp-phone">
            <img src={SHOT + 'rtp-celular.webp'} width={390} height={565} decoding="async" alt={ct('Road to Pro no celular: a próxima série e o botão de jogar')} />
          </div>
        </div>
      </div>
    </section>
  );
}

// fatos que já estavam na landing (e no código): nada inventado sobre o negócio
function Facts() {
  const FACTS: [string, string, boolean?][] = [
    ['6', 'modos de jogo'],
    ['5', 'eras do CS'],
    ['16', 'times por Major'],
    ['HLTV + Liquipedia', 'fonte dos dados', true],
  ];
  return (
    <div className="lp-wrap">
      <dl className="lp-facts">
        {FACTS.map(([v, l, text]) => (
          <div key={l}><dt>{ct(l)}</dt><dd className={text ? 'is-text' : undefined}>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

type ModeCard = { id: string; icon: ReactNode; kicker: string; title: string; desc: string; meta: ReactNode; img: string; alt: string; lead?: boolean };

function Modes({ onPlay }: { onPlay: () => void }) {
  const MODES: ModeCard[] = [
    { id: 'carreira', lead: true, icon: <Trophy size={18} />, kicker: 'Destaque', title: 'Carreira', desc: 'Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.', meta: ct('1 jogador · campanha'), img: 'modo-carreira.webp', alt: 'Elenco da Carreira com os titulares, atributos, OVR e valor de mercado' },
    { id: 'rtp', lead: true, icon: <Crosshair size={18} />, kicker: 'Demo grátis', title: 'Road to Pro', desc: 'Você não treina o time: você é o jogador. Treine, cuide da sua vida de pro e brilhe nos momentos decisivos.', meta: <><b>{ct('Demo grátis')}</b> · {ct('carreira completa na conta vitalícia')}</>, img: 'modo-rtp.webp', alt: 'Visão geral do Road to Pro: próxima série, energia do jogador, finanças e ranking mundial' },
    { id: 'ultimate', icon: <Star size={18} />, kicker: 'Competitivo · Online', title: 'Ultimate', desc: 'Abra pacotes, colecione os jogadores reais de 2026 e dispute a ranqueada online contra outros managers.', meta: ct('Online · ranqueada'), img: 'modo-ultimate.webp', alt: 'Squad do Ultimate com as cartas dos jogadores e a química do time' },
    { id: 'online', icon: <Globe size={18} />, kicker: 'Ranqueada', title: 'Online', desc: 'Ranqueada contra outros managers, duelo privado com amigos e o Major da Semana.', meta: ct('Com o seu squad do Ultimate'), img: 'modo-online.webp', alt: 'Ranqueada online com as divisões do Bronze ao Elite' },
    { id: 'draft', icon: <Layers size={18} />, kicker: 'Partida rápida', title: 'Draft', desc: 'Monte um cinco com lendas de cada era e dispute um Major avulso. Rápido e rejogável.', meta: ct('1 jogador · ~15 min'), img: 'modo-draft.webp', alt: 'Draft do elenco: escolha um jogador de um elenco histórico sorteado' },
    { id: 'diario', icon: <CalendarDays size={18} />, kicker: 'Todo dia', title: 'Diário', desc: 'Quatro desafios por dia, os mesmos pra todo mundo. Grátis, sem conta.', meta: ct('1 jogador · 2 min'), img: 'modo-diario.webp', alt: 'Os quatro desafios do Diário: Lines Históricas, Quem é o Pro, O Impostor e Placar do Clássico' },
  ];
  return (
    <section id="modos" className="lp-section" aria-labelledby="lp-modos-title">
      <div className="lp-wrap">
        <SectionHead id="lp-modos-title" center title={ct('Seis modos, um jogo só')} sub={ct('Tudo na mesma interface, com o trilho de modos à mão. Estas são telas reais do jogo.')} />
        <div className="lp-modes">
          {MODES.map((m) => (
            <article key={m.id} className={`lp-mode lp-reveal${m.lead ? ' lp-mode--lead' : ''}`} aria-labelledby={`lp-mode-${m.id}`}>
              <div className="lp-mode__shot">
                <img src={SHOT + m.img} width={960} height={600} loading="lazy" decoding="async" alt={ct(m.alt)} />
              </div>
              <div className="lp-mode__body">
                <div className="lp-mode__top">
                  <span className="lp-mode__icon" aria-hidden>{m.icon}</span>
                  <span className="lp-kicker">{ct(m.kicker)}</span>
                </div>
                <h3 id={`lp-mode-${m.id}`}>{ct(m.title)}</h3>
                <p>{ct(m.desc)}</p>
                <span className="lp-mode__meta">{m.meta}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="lp-modes__cta lp-reveal">
          <Button size="big" onClick={onPlay}>{ct('Jogar agora, de graça')} <Play size={18} aria-hidden /></Button>
        </div>
      </div>
    </section>
  );
}

// A sala do Road to Pro: o diferencial que merece seção própria.
function RtpSpotlight() {
  const POINTS: [ReactNode, string, string][] = [
    [<Eye size={18} />, 'Nada escondido', 'Cada escolha mostra a chance e de onde ela vem: base, mira, cansaço, tendência do adversário, OVR de quem está do outro lado.'],
    [<Gauge size={18} />, 'Você decide e executa', 'Depois de escolher, o seu tempo de reação ainda move as odds em até 8%, pra cima ou pra baixo.'],
    [<Target size={18} />, 'Demo grátis', 'A peneira e as três primeiras semanas são de graça. A carreira inteira vem com a conta vitalícia.'],
  ];
  return (
    <section id="road-to-pro" className="lp-section" aria-labelledby="lp-rtp-title">
      <div className="lp-wrap lp-spot">
        <div className="lp-spot__copy lp-reveal">
          <span className="lp-kicker"><Crosshair size={14} aria-hidden /> Road to Pro</span>
          <h2 className="lp-h2" id="lp-rtp-title">{ct('O % que você vê')} <span>{ct('é o % que rola')}</span></h2>
          <p className="lp-lead">{ct('No Road to Pro você é o jogador. Nos momentos-chave da partida, o jogo abre a conta na sua frente e você escolhe a jogada.')}</p>
          <ul className="lp-points">
            {POINTS.map(([icon, t, d]) => (
              <li key={t}><span aria-hidden>{icon}</span><div><b>{ct(t)}</b><p>{ct(d)}</p></div></li>
            ))}
          </ul>
        </div>
        <figure className="lp-spot__media lp-reveal">
          <div className="lp-screen lp-screen--gold">
            <img src={SHOT + 'modo-rtp-sala.webp'} width={960} height={800} loading="lazy" decoding="async" alt={ct('Momento-chave do Road to Pro: round de pistola com três jogadas, cada uma com a sua chance em porcentagem e os modificadores que a formam')} />
          </div>
          <figcaption>{ct('Round de pistola numa partida real: três jogadas, três chances.')}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Pricing({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  const FREE = ['Carreira, Ultimate, Draft, Diário e Online completos', 'Ranqueada online do Ultimate', 'Road to Pro: demo com a peneira e 3 semanas', 'Save neste navegador'];
  const PAID = ['Road to Pro completo, com a Série do Dia', 'Save na nuvem: joga no PC e no celular', 'Compra de coins pra abrir mais packs', 'Histórico de todas as partidas', 'Selo de apoiador no perfil'];
  return (
    <section id="conta" className="lp-section" aria-labelledby="lp-conta-title">
      <div className="lp-wrap">
        <SectionHead id="lp-conta-title" center kicker={ct('Conta e save')} title={ct('Grátis pra jogar, conta pra ir além')} sub={ct('Sem conta você joga de graça com save no navegador, incluindo a ranqueada online. A conta vitalícia guarda tudo na nuvem e libera o Road to Pro completo.')} />
        <div className="lp-plans lp-reveal">
          <article className="lp-plan" aria-labelledby="lp-plan-free">
            <h3 className="lp-plan__name" id="lp-plan-free">{ct('Sem conta')}</h3>
            <div className="lp-plan__price"><strong>R$0</strong><span>{ct('pra sempre')}</span></div>
            <p className="lp-plan__note">{ct('Joga agora, save só neste navegador')}</p>
            <ul className="lp-checks">
              {FREE.map((f) => <li key={f}><Check size={16} aria-hidden />{ct(f)}</li>)}
            </ul>
            <Button variant="secondary" block onClick={onPlay}>{ct('Jogar agora, de graça')}</Button>
          </article>
          <article className="lp-plan lp-plan--paid" aria-labelledby="lp-plan-paid">
            <h3 className="lp-plan__name" id="lp-plan-paid">{ct('Conta vitalícia')}</h3>
            <div className="lp-plan__price"><strong>R$20</strong><span>{ct('uma vez, sem assinatura')}</span></div>
            <p className="lp-plan__note">{ct('Pix ou cartão · acesso imediato')}</p>
            {/* prova social REAL: contagem de Fundadores do servidor (falhou? não mostra nada) */}
            <FounderCounter />
            <ul className="lp-checks">
              {PAID.map((f) => <li key={f}><Check size={16} aria-hidden /><b>{ct(f)}</b></li>)}
            </ul>
            <Button variant="gold" block onClick={onAccount}>{ct('Criar conta')} · R$20</Button>
          </article>
        </div>
        <p className="lp-plans__foot lp-reveal">
          {ct('Os R$20 cobrem conta, banco de dados e persistência em nuvem enquanto o serviço estiver em operação, sem mensalidade.')}
        </p>
      </div>
    </section>
  );
}

function How() {
  const STEPS: [string, string][] = [
    ['Crie o seu manager', 'Nick, idade, país e a cor da sua organização. Leva dez segundos.'],
    ['Escolha o modo', 'Carreira, Road to Pro, Ultimate, Draft, Diário ou Online. Dá pra trocar a qualquer hora.'],
    ['Jogue a partida', 'Veto de mapa, killfeed ao vivo e scoreboard no estilo HLTV.'],
    ['Suba no ranking', 'Na ranqueada online você enfrenta outros managers e sobe do Bronze ao Elite.'],
  ];
  return (
    <section id="como" className="lp-section" aria-labelledby="lp-como-title">
      <div className="lp-wrap">
        <SectionHead id="lp-como-title" title={ct('Como funciona')} />
        <ol className="lp-steps lp-reveal">
          {STEPS.map(([t, d]) => (
            <li key={t}><div><h3>{ct(t)}</h3><p>{ct(d)}</p></div></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq() {
  const Q: [string, string][] = [
    ['Preciso pagar pra jogar?', 'Não. Carreira, Ultimate, Draft, Diário e Online são de graça, incluindo a ranqueada online, e o Road to Pro tem demo grátis. O save fica no seu navegador. A conta de R$20 guarda o progresso na nuvem e libera o Road to Pro completo.'],
    ['O que a conta vitalícia me dá?', 'O Road to Pro completo com a Série do Dia, save na nuvem pra jogar no PC e no celular, compra de coins pra abrir mais packs no Ultimate, histórico de partidas e um selo de apoiador. É um pagamento único, sem mensalidade.'],
    ['Funciona no celular?', 'Sim. O jogo roda no navegador do celular com a mesma interface do PC, e dá pra instalar na tela inicial como um app.'],
    ['O Ultimate é o modo online?', 'Sim. No Ultimate você monta seu elenco dos jogadores reais de 2026 e enfrenta outros managers na fila ranqueada, subindo de divisão. É de graça: a conta só entra pra salvar na nuvem e comprar coins.'],
    ['Se eu não criar conta, perco o progresso?', 'O progresso fica salvo no localStorage do navegador. Se você limpar o cache ou trocar de aparelho, ele some. Com conta isso não acontece.'],
    ['Como pago os R$20?', 'Cartão pelo Stripe ou Pix pelo Woovi. É um pagamento único pelos recursos persistentes, válido enquanto o Road to Major continuar em operação, conforme os Termos.'],
    ['De onde vêm os jogadores e times?', 'Os elencos e dados são curados a partir de HLTV e Liquipedia, cobrindo as cinco eras do Counter-Strike.'],
  ];
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-faq">
        <div className="lp-faq__intro lp-reveal">
          <h2 className="lp-h2" id="lp-faq-title">{ct('Perguntas frequentes')}</h2>
          <p className="lp-lead">{ct('O essencial sobre modos, conta e pagamento. Ainda com dúvida? Chama no X: @castroomath.')}</p>
        </div>
        <div className="lp-faq__list lp-reveal">
          {Q.map(([q, a], i) => {
            const on = open === i;
            return (
              <div key={q} className="lp-qa" data-open={on}>
                <h3>
                  <button type="button" className="lp-qa__btn" id={`lp-q-${i}`} aria-expanded={on} aria-controls={`lp-a-${i}`} onClick={() => setOpen(on ? -1 : i)}>
                    <span>{ct(q)}</span>
                    <ChevronDown size={20} aria-hidden />
                  </button>
                </h3>
                <div className="lp-qa__panel" id={`lp-a-${i}`} role="region" aria-labelledby={`lp-q-${i}`} hidden={!on}>{ct(a)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  return (
    <section className="lp-section lp-section--last" aria-labelledby="lp-final-title">
      <div className="lp-wrap">
        <div className="lp-final lp-reveal">
          <img src="/maps/nuke.jpg" alt="" loading="lazy" decoding="async" width={300} height={168} />
          <BrandMark size={56} />
          <h2 className="lp-h2" id="lp-final-title">{ct('O título não é dado, é conquistado')}</h2>
          <p className="lp-lead">{ct('Comece de graça agora. Quando quiser guardar tudo na nuvem, é só criar a sua conta.')}</p>
          <div className="lp-final__cta">
            <Button size="big" onClick={onPlay}>{ct('Jogar agora, de graça')} <Play size={18} aria-hidden /></Button>
            {/* funil: CTA final da página, com o preço no texto do botão (a seção de
                planos já ficou pra trás na rolagem). src landing-final. */}
            <Button size="big" variant="gold" onClick={onAccount}>{ct('Criar conta')} · R$20</Button>
          </div>
        </div>
        <footer className="lp-footer">
          <span className="lp-footer__brand"><BrandMark size={22} /> Road to Major</span>
          <p>{ct('Produto comercial independente, não afiliado ou endossado pela Valve, HLTV, Liquipedia, equipes ou jogadores.')}</p>
          <LegalLinks />
        </footer>
      </div>
    </section>
  );
}

// nudge anti-abandono do QR Pix: no máximo 1x por sessão de navegação (guard de
// módulo). Honesto e descartável — sem timer fake, sem segunda modal.
const nudgeShownThisSession = new Set<string>();

export function AccountModal({ onClose, onCheckout, onPlay, initialMode = 'signup' }: { onClose: () => void; onCheckout: (email: string, nick: string) => Promise<void>; onPlay: () => void; initialMode?: 'signup' | 'login' }) {
  const [mode, setMode] = useState<'signup' | 'login' | 'reset'>(initialMode);
  // reset de senha em 2 passos: pedir o código por e-mail → código + senha nova.
  const [resetStep, setResetStep] = useState<'ask' | 'code'>('ask');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState('');
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  // confirmação + revelar: só no cadastro (ver comentário no campo)
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [accepted, setAccepted] = useState(false);
  // Pix Woovi (merge origin/master) + visual em-* (HEAD)
  const [pix, setPix] = useState<{ charge: PixCharge; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [nudge, setNudge] = useState(false);
  // funil: refinando o achado anterior — de 60 checkout_abandon (pix) nos últimos
  // 28 dias, 18 (30%) fecham em menos de 60s, e 11 desses entre 15s–60s, ou seja,
  // ANTES da reassurance de espera aparecer (ela só ligava aos 60s). Antecipar pra
  // 25s cobre boa parte desse grupo sem incomodar quem confirma rápido.
  const [pixWaitLong, setPixWaitLong] = useState(false);
  useEffect(() => {
    if (!pix) { setPixWaitLong(false); return; }
    const t = window.setTimeout(() => setPixWaitLong(true), 25_000);
    return () => window.clearTimeout(t);
  }, [pix]);
  useEffect(() => {
    if (pixWaitLong) trackPaywallView('pix-wait-longo'); // funil: reassurance de espera longa exibida (evento existente, novo src)
  }, [pixWaitLong]);
  // funil: a troca pro cartão só aparecia junto da reassurance, aos 25s — mas o
  // dado real (28d) mostra 16 dos 55 abandonos de Pix (29%) desistindo em MENOS
  // de 30s, rápido demais pra terem saído da aba pro app do banco e voltado.
  // Esse grupo nunca chega a ver nem a reassurance nem a troca de cartão: as
  // duas ligam tarde demais pra quem já foi embora. Mostra a saída pro cartão
  // desde o instante em que o QR abre (o cartão continua secundário na UI —
  // Pix segue sendo o CTA primário e o QR não some), sem esperar o timer.
  const [cardSwitching, setCardSwitching] = useState(false);
  useEffect(() => {
    if (pix) trackPaywallView('pix-cartao-cedo'); // funil: saída pro cartão exibida desde a abertura do QR (src novo — mede o grupo que antes desistia sem ver essa opção)
  }, [pix]);
  // funil: abandono do QR Pix — best-effort, dispara no desmonte do modal se o
  // QR chegou a abrir e o pagamento não foi confirmado pelo polling.
  const pixOpenedAt = useRef(0);
  const pixConfirmed = useRef(false);
  // trocou pro cartão em vez de desistir (ver switchToCard mais abaixo) — não
  // é abandono, é o mesmo usuário concluindo por outro método.
  const pixSwitchedMethod = useRef(false);
  useEffect(() => () => {
    if (pixOpenedAt.current && !pixConfirmed.current && !pixSwitchedMethod.current) trackCheckoutAbandon('pix', (Date.now() - pixOpenedAt.current) / 1000);
  }, []);
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
      try { const me = await fetchMe(); if (alive && me?.paid) { pixConfirmed.current = true; setPix(null); onPlay(); } } catch { /* ignora */ }
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
  const pwMismatch = mode === 'signup' && pw2.length > 0 && pw !== pw2;
  const valid = /\S+@\S+\.\S+/.test(email) && pw.length >= 6
    && (mode === 'login' || (accepted && pw === pw2));
  const go = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      if (mode === 'signup') trackSignup('start'); // funil: cadastro pré-pagamento começou
      const acct = mode === 'signup' ? await signup(email.trim(), pw, nick.trim()) : await login(email.trim(), pw);
      if (mode === 'signup') trackSignup('done');  // funil: cadastro criado com sucesso
      if (acct.paid) { onPlay(); return; }           // já tem conta vitalícia: entra direto
      await onCheckout(acct.email, acct.nick || nick.trim()); // segue pro pagamento (checkout_open é do App.startCheckout)
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); setBusy(false); }
  };
  // Pix via Woovi (merged de origin/master): cria/entra na conta, gera a cobrança
  // e mostra QR + copia-e-cola INLINE. O webhook (/api/woovi-webhook) marca a conta
  // como paga e o polling acima detecta na mesma tela e libera o acesso.
  const goPix = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      if (mode === 'signup') trackSignup('start'); // funil: cadastro pré-pagamento começou
      const acct = mode === 'signup' ? await signup(email.trim(), pw, nick.trim()) : await login(email.trim(), pw);
      if (mode === 'signup') trackSignup('done');  // funil: cadastro criado com sucesso
      if (acct.paid) { onPlay(); return; }
      const charge = await beginPix();
      if (!charge) { onPlay(); return; } // já estava paga
      setPix({ charge, email: acct.email });
      pixOpenedAt.current = Date.now();
      trackCheckoutOpen('pix'); // funil: QR Pix da vitalícia na tela
      setBusy(false);
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); setBusy(false); }
  };
  const copyBr = async () => {
    if (!pix?.charge.brCode) return;
    try { await navigator.clipboard.writeText(pix.charge.brCode); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* sem permissão */ }
  };
  // troca pro cartão sem perder o cadastro: a conta já foi criada no goPix, então
  // só dispara o checkout do Stripe (mesmo onCheckout do botão "Ativar com
  // cartão" acima) — não é um segundo cadastro.
  const switchToCard = async () => {
    if (!pix || cardSwitching) return;
    setCardSwitching(true);
    pixSwitchedMethod.current = true;
    await onCheckout(pix.email, nick.trim());
  };
  // fechar com o QR Pix aberto e sem pagamento confirmado: UM nudge leve inline
  // (1x por sessão), honesto e descartável. Depois disso, fechar fecha mesmo.
  const requestClose = () => {
    if (pix && !pixConfirmed.current && !nudgeShownThisSession.has('pix-nudge')) {
      nudgeShownThisSession.add('pix-nudge');
      setNudge(true);
      trackPaywallView('checkout-nudge'); // funil: nudge exibido (evento existente, novo src)
      return;
    }
    onClose();
  };
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandMark size={22} />
      <span>{mode === 'signup' ? ct('Criar conta') : mode === 'reset' ? ct('Recuperar senha') : ct('Entrar')}</span>
    </span>
  );

  // ── reset de senha ──────────────────────────────────────────────────────────
  const sendResetCode = async () => {
    if (!/\S+@\S+\.\S+/.test(email) || busy) return;
    setBusy(true); setErr('');
    try {
      await requestPasswordReset(email.trim());
      setResetStep('code'); setCode(''); setPw('');
      setInfo(ct('Se este e-mail tem conta, o código chegou na caixa de entrada (vale 30 minutos).'));
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); }
    setBusy(false);
  };
  const confirmReset = async () => {
    if (!/^\d{6}$/.test(code.trim()) || pw.length < 6 || busy) return;
    setBusy(true); setErr('');
    try {
      await confirmPasswordReset(email.trim(), code.trim(), pw);
      setMode('login'); setResetStep('ask'); setCode(''); setPw('');
      setInfo(ct('Senha trocada! Entre com a senha nova.'));
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); }
    setBusy(false);
  };
  return (
    <Modal open onClose={requestClose} title={title} size="sm">
      {mode === 'signup' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--em-gold)' }}>R$20</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--em-muted)' }}>{ct('pagamento único pelo save em nuvem')}</span>
          </div>
          {/* reassurance: tira as 3 dúvidas mais comuns antes do pagamento */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '8px', fontSize: '0.74rem', color: 'var(--em-muted)', fontWeight: 600 }}>
            <span>✔ {ct('Pagamento único')}</span>
            <span>✔ {ct('Acesso imediato')}</span>
            <span>✔ {ct('Pix ou cartão')}</span>
          </div>
          {/* prova social REAL (servidor); fetch falhou → não renderiza nada */}
          <FounderCounter style={{ marginTop: '8px' }} />
        </div>
      )}
      {info && mode !== 'signup' && <p style={{ color: 'var(--c-win)', fontSize: '0.8rem', margin: '0 0 12px' }}>{info}</p>}
      {mode !== 'reset' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && <div><label style={lbl}>{ct('Nick de manager')}</label><input style={input} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="br4z1l_zera" maxLength={24} /></div>}
          <div><label style={lbl}>{ct('E-mail')}</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ct("voce@email.com")} type="email" autoComplete="email" /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <label style={lbl}>{ct('Senha')}</label>
              <button type="button" onClick={() => setShowPw((v) => !v)}
                style={{ background: 'none', border: 'none', padding: 0, marginBottom: '6px', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', fontFamily: 'inherit' }}>
                {showPw ? ct('ocultar') : ct('mostrar')}
              </button>
            </div>
            <input style={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={ct('mínimo 6 caracteres')} type={showPw ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onKeyDown={(e) => e.key === 'Enter' && go()} />
          </div>
          {/* Confirmação só no CADASTRO: um typo aqui cria uma conta com senha que
              ninguém conhece. O reset por e-mail existe e resolve, mas obriga quem
              acabou de PAGAR a passar por recuperação antes de jogar — atrito no
              pior momento possível. Confirmar + revelar mata o erro na origem. */}
          {mode === 'signup' && (
            <div>
              <label style={lbl}>{ct('Confirme a senha')}</label>
              <input
                style={{ ...input, ...(pwMismatch ? { borderColor: '#e2574c' } : null) }}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder={ct('digite a senha de novo')}
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={pwMismatch}
                onKeyDown={(e) => e.key === 'Enter' && go()}
              />
              {pwMismatch && <p style={{ color: '#e2574c', fontSize: '0.74rem', margin: '6px 0 0' }}>{ct('As senhas não são iguais.')}</p>}
            </div>
          )}
          {mode === 'login' && (
            <button type="button" onClick={() => { setMode('reset'); setResetStep('ask'); setErr(''); setInfo(''); setPw2(''); }}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: 'var(--em-muted)', cursor: 'pointer', fontSize: '0.76rem', textDecoration: 'underline', fontFamily: 'inherit' }}>
              {ct('Esqueci minha senha')}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={lbl}>{ct('E-mail da conta')}</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ct("voce@email.com")} type="email" autoComplete="email" disabled={resetStep === 'code'} /></div>
          {resetStep === 'code' && (
            <>
              <div><label style={lbl}>{ct('Código (6 dígitos, chegou no e-mail)')}</label><input style={input} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" /></div>
              <div><label style={lbl}>{ct('Senha nova')}</label><input style={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={ct('mínimo 6 caracteres')} type="password" autoComplete="new-password" onKeyDown={(e) => e.key === 'Enter' && confirmReset()} /></div>
            </>
          )}
          {resetStep === 'ask' ? (
            <Button variant="gold" disabled={!/\S+@\S+\.\S+/.test(email) || busy} style={{ width: '100%' }} onClick={sendResetCode}>
              {busy ? ct('Aguarde…') : ct('Enviar código por e-mail')}
            </Button>
          ) : (
            <>
              <Button variant="gold" disabled={!/^\d{6}$/.test(code) || pw.length < 6 || busy} style={{ width: '100%' }} onClick={confirmReset}>
                {busy ? ct('Aguarde…') : ct('Trocar a senha')}
              </Button>
              <button type="button" onClick={sendResetCode} disabled={busy}
                style={{ background: 'none', border: 'none', color: 'var(--em-muted)', cursor: 'pointer', fontSize: '0.74rem', textDecoration: 'underline', fontFamily: 'inherit' }}>
                {ct('Não chegou? Reenviar código')}
              </button>
            </>
          )}
        </div>
      )}
      {mode === 'signup' && (
        <label className="checkout-legal-accept">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>{ct('Li e aceito os')} <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer">{ct('Termos')}</a> {ct('e a')} <a href={LEGAL_PATHS.refund} target="_blank" rel="noreferrer">{ct('Política de Reembolso')}</a>{ct(', consultei a')} <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer">{ct('Privacidade')}</a> {ct('e confirmo ser maior de 18 anos ou responsável legal pela compra.')}</span>
        </label>
      )}
      {err && <p style={{ color: '#e2574c', fontSize: '0.8rem', margin: '12px 0 0' }}>{err}</p>}
      {/* funil: dado real (checkout_open x rtm_paid_emails, por método) mostra o Pix
          confirmando a imensa maioria dos checkouts abertos, enquanto o cartão perde
          a maior parte no redirect pro Stripe — então o Pix vira o CTA primário
          (ouro) e o cartão passa a secundário, sem tirar a opção de ninguém. */}
      {mode === 'signup' ? (
        <>
          <Button variant="gold" disabled={!valid || busy} style={{ width: '100%', marginTop: '20px' }} onClick={goPix}>
            {busy ? ct('Aguarde…') : ct('Pagar com Pix')}
          </Button>
          <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', textAlign: 'center', margin: '6px 0 0' }}>{ct('Confirma na hora, sem sair desta tela')}</p>
          <Button variant="ghost" disabled={!valid || busy} style={{ width: '100%', marginTop: '10px' }} onClick={go}>
            {busy ? ct('Aguarde…') : ct('Ativar com cartão (Stripe)')}
          </Button>
        </>
      ) : mode === 'login' ? (
        <Button variant="gold" disabled={!valid || busy} style={{ width: '100%', marginTop: '20px' }} onClick={go}>{busy ? ct('Aguarde…') : ct('Entrar')}</Button>
      ) : null}
      {pix && (
        <div style={{ marginTop: '14px', background: 'color-mix(in srgb, var(--c-win) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--c-win) 35%, transparent)', borderRadius: '6px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--c-win)', boxShadow: '0 0 8px var(--c-win)', animation: 'pulse 1.4s infinite' }} />
            <b style={{ fontSize: '0.82rem', color: 'var(--em-text)', letterSpacing: '.5px', textTransform: 'uppercase', fontWeight: 800 }}>{ct('Pague o Pix e o acesso libera sozinho')}</b>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {/* funil: a mediana real de espera do Pix é ~133s — "aprovado em
                segundos" prometia rápido demais e pode ter puxado parte dos 30%
                de abandonos que saem em menos de 1min. Troca por expectativa
                honesta desde o primeiro segundo, sem depender só do timer acima. */}
            {ct('Esta tela confirma sozinha assim que o Pix cair — não precisa recarregar. Costuma levar de 1 a 3 minutos.')}
          </p>
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
                style={{ width: '100%', marginTop: '8px', padding: '9px', borderRadius: '6px', cursor: 'pointer', background: copied ? 'color-mix(in srgb, var(--c-win) 20%, transparent)' : 'var(--em-panel-2)', border: '1px solid var(--em-border)', color: 'var(--em-text)', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                {copied ? ct('Copiado!') : ct('Copiar código Pix')}
              </button>
            </>
          )}
          <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            {ct('Pague no app do banco. Estamos checando: assim que o Pix cair, o acesso libera nesta tela.')}
          </p>
          {/* saída honesta pro cartão — visível desde que o QR abre, não mais só
              aos 25s (ver comentário no effect acima: 29% dos abandonos do Pix
              desistem antes disso). O Pix continua o CTA primário e o QR não some. */}
          <button
            type="button"
            onClick={() => void switchToCard()}
            disabled={cardSwitching}
            style={{ display: 'block', width: '100%', marginTop: '10px', padding: '8px', borderRadius: '6px', cursor: cardSwitching ? 'default' : 'pointer', background: 'transparent', border: '1px solid var(--em-border)', color: 'var(--em-muted)', fontWeight: 700, fontSize: '0.74rem', fontFamily: 'inherit', opacity: cardSwitching ? 0.6 : 1 }}
          >
            {cardSwitching ? ct('Abrindo pagamento…') : ct('Prefere não esperar? Pagar com cartão')}
          </button>
          {pixWaitLong && (
            /* reassurance honesta pra quem passou de 25s esperando (ver comentário no effect acima) */
            <p style={{ fontSize: '0.72rem', color: 'var(--em-gold, #e8c170)', margin: '8px 0 0', textAlign: 'center', lineHeight: 1.5, fontWeight: 600 }}>
              {ct('Alguns bancos demoram alguns minutos pra confirmar o Pix — pode deixar essa aba aberta, o acesso libera sozinho assim que cair.')}
            </p>
          )}
          {nudge && (
            /* nudge anti-abandono (1x/sessão): inline, honesto, descartável */
            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(232,193,112,.08)', border: '1px solid rgba(232,193,112,.4)', borderRadius: '6px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--em-text)', lineHeight: 1.5 }}>
                {ct('Ficou alguma dúvida? O acesso é vitalício e o Pix confirma na hora.')}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setNudge(false)}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', background: 'var(--em-gold)', border: 'none', color: '#1a1205', fontWeight: 800, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                  {ct('Continuar pagamento')}
                </button>
                <button type="button" onClick={onClose}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--em-border)', color: 'var(--em-muted)', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                  {ct('Fechar')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--em-muted)', textAlign: 'center', margin: '14px 0 0' }}>
        {mode === 'reset' ? (
          <button type="button" onClick={() => { setMode('login'); setResetStep('ask'); setErr(''); setInfo(''); }} style={{ background: 'none', border: 'none', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>← {ct('Voltar pro login')}</button>
        ) : (
          <>
            {mode === 'signup' ? ct('Já tem conta? ') : ct('Não tem conta? ')}
            <button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); setInfo(''); setPw2(''); }} style={{ background: 'none', border: 'none', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{mode === 'signup' ? ct('Entrar') : ct('Criar conta')}</button>
          </>
        )}
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', opacity: 0.75, textAlign: 'center', margin: '10px 0 0' }}>{ct('Cartão pelo Stripe ou Pix pelo Woovi. Todo o jogo permanece gratuito; a conta paga apenas mantém dados na nuvem.')}</p>
    </Modal>
  );
}

// novidades: o tweet de anúncio do @castroomath como prova social. O widget do X
// é pesado, então só carrega quando a seção chega perto da tela.
function TweetBand() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return (
    <section id="novidades" className="lp-section" aria-labelledby="lp-news-title">
      <div className="lp-wrap lp-news">
        <SectionHead id="lp-news-title" center title={ct('Novidades direto do X')} sub={ct('Updates, bastidores e o anúncio oficial do Road to Major.')} />
        <div ref={ref} className="lp-news__embed lp-reveal">{near && <AnnouncementTweet />}</div>
        <TwitterLink />
      </div>
    </section>
  );
}

export function Landing({ onPlay, onCheckout, openSignup }: { onPlay: () => void; onCheckout: (email: string, nick: string) => Promise<void>; openSignup?: boolean }) {
  const [acct, setAcct] = useState(!!openSignup); // deep-link /?criar OU clique numa trava dentro do app: pula a landing e abre direto o cadastro
  const [acctMode, setAcctMode] = useState<'signup' | 'login'>('signup');
  const ref = useReveal();
  // funil: CTA da landing abrindo o modal de conta. first-touch, então quem
  // chegou de uma trava (home-rtp, wl-lock...) mantém a origem original.
  // src por botão: landing-nav, landing-hero, landing-pricing, landing-final e
  // landing-ghost; o "Entrar" segue com o src padrão 'landing'.
  const openAcct = (mode: 'signup' | 'login' = 'signup', src: string = 'landing') => { setCheckoutSrc(src); setAcctMode(mode); setAcct(true); };
  // desafio de fantasma pendente (link aberto sem vitalícia): o motivo de
  // comprar HOJE, o desafio expira à meia-noite.
  const ghost = loadGhost(dayNumberOf(dateKeyOf(new Date())));
  const duelInvite = loadDuelInvite(); // [U11]
  // [URG-2] evento de fim de semana: lê o live-ops público (o servidor mescla o automático) e
  // recalcula a cada minuto pro contador; sem rede cai no cálculo local do mesmo engine.
  const [wknd, setWknd] = useState<WeekendEventView | null>(null);
  useEffect(() => {
    let on = true;
    const compute = () => { if (on) setWknd(weekendEventView()); };
    void fetchActiveLiveops().then(compute, compute);
    const t = window.setInterval(compute, 60_000);
    return () => { on = false; window.clearInterval(t); };
  }, []);
  const wkndCard = wknd ? weekendExclusiveCard(wknd) : null;
  const wkndRemain = wknd ? (wknd.open ? wknd.endsAtMs : wknd.startsAtMs) - Date.now() : 0;
  return (
    <div ref={ref} className="lp-page">
      <a className="lp-skip" href="#conteudo">{ct('Pular para o conteúdo')}</a>
      <Nav onAccount={() => openAcct('signup', 'landing-nav')} onLogin={() => openAcct('login')} onPlay={onPlay} />
      <main id="conteudo" tabIndex={-1}>
        <div className="lp-notices">
          {/* [U11] convite de duelo pendente: explica e dá o caminho (conta ou convidado) */}
          {duelInvite && (
            <div className="lp-notice">
              <Swords size={16} aria-hidden />
              <span>{ct('Você foi convidado pra um DUELO no Ultimate')}, {ct('sala')} <b className="lp-notice__code">{duelInvite}</b>. {ct('A sala expira em algumas horas.')}</span>
              <button type="button" className="lp-notice__go" onClick={onPlay}>{ct('Entrar e aceitar')} <ArrowRight size={14} aria-hidden /></button>
            </div>
          )}
          {/* [URG-2] evento de fim de semana: discreto, acima da dobra, mesmo deslogado */}
          {wknd && (
            <div className="lp-notice">
              <Gift size={16} aria-hidden />
              <span>
                {wknd.open
                  ? <>{ct('Evento até domingo')}: <b>{wknd.name}</b>{wkndCard && <> · {ct('carta exclusiva')} <b>{wkndCard.nick}</b> ({wkndCard.ovr})</>} · {ct('termina em')} <b>{formatCountdown(wkndRemain)}</b></>
                  : <>{ct('Próximo evento em')} <b>{formatCountdown(wkndRemain)}</b>: <b>{wknd.name}</b>{wkndCard && <> · {ct('carta exclusiva')} <b>{wkndCard.nick}</b> ({wkndCard.ovr})</>}</>}
              </span>
              <button type="button" className="lp-notice__go" onClick={onPlay}>{ct('Jogar')} <ArrowRight size={14} aria-hidden /></button>
            </div>
          )}
          {ghost && (
            <div className="lp-notice">
              <Target size={16} aria-hidden />
              <span><b>{ghost.nick}</b> {ct('te desafiou na SÉRIE DO DIA')}, {ct('rating')} <b>{ghost.rating.toFixed(2)}</b> {ct('na mesma série que você jogaria')}. {ct('O desafio expira à meia-noite. A Série do Dia é da conta vitalícia (R$20, uma vez).')}</span>
              <button type="button" className="lp-notice__go" onClick={() => openAcct('signup', 'landing-ghost')}>{ct('Aceitar o desafio')} <ArrowRight size={14} aria-hidden /></button>
            </div>
          )}
          <CommunityGoalBar onPlay={onPlay} />
        </div>
        <Hero onAccount={() => openAcct('signup', 'landing-hero')} onPlay={onPlay} />
        <Facts />
        <Modes onPlay={onPlay} />
        <RtpSpotlight />
        <Pricing onAccount={() => openAcct('signup', 'landing-pricing')} onPlay={onPlay} />
        <How />
        <TweetBand />
        <Faq />
        <FinalCta onAccount={() => openAcct('signup', 'landing-final')} onPlay={onPlay} />
      </main>
      {acct && <AccountModal onClose={() => setAcct(false)} onCheckout={onCheckout} onPlay={onPlay} initialMode={acctMode} />}
    </div>
  );
}
