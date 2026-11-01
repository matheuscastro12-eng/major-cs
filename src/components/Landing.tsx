// Landing page de marketing (rota /). Mesma identidade da interface nova do
// jogo: marinho + dourado da marca, escudo, Oswald/Barlow.
// Enquanto a vitrine do PGL Major Singapore estiver no ar (data/majorWindow.ts),
// o hero é do Modo Major: pick'em em ~1 min, sem conta, com a régua do evento
// e os favoritos da simulação. No AO VIVO (24/11 a 13/12) a etiqueta diz o
// Stage do dia (data/majorLive.ts) e, depois da trava do Stage 1, o CTA vira
// "Ver meu placar" (tem palpite no navegador) ou "Jogar o Major com um time"
// (chegou depois: palpite novo não pontua). Depois da janela volta o hero geral. Em seguida:
// "Em 1 minuto" (3 portas com tempo honesto), os outros modos numa seção
// compacta, planos (preço via state/price.ts), FAQ, CTA final e o modal de
// conta (checkout real: Pix/Stripe).
// Qual hero, quais portas e os favoritos: data/majorLanding.ts (puro e sem o
// JSON dos 32 times, que não pode entrar no chunk inicial).
// Estilos em src/styles/landing.css (só tokens).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Crosshair, Gift, Globe, Play, Star, Swords, Target, Trophy } from 'lucide-react';
import { setCheckoutSrc, trackCheckoutAbandon, trackCheckoutOpen, trackPaywallView, trackSignup } from '../state/track';
import {
  MAJOR_FAVORITES, MAJOR_SG_MILESTONES, landingDoors, landingHero, landingMajorCta, landingModes, majorPhase, milestonesReached,
  type LandingDoor, type LandingDoorId, type LandingHero, type LandingMajorCta, type LandingModeId, type MajorPhase,
} from '../data/majorLanding';
import { LIVE_LOCKS, livePublished, liveStage, requestPlacarFocus, type LiveStage } from '../data/majorLive';
import { pickemStanding, readMajorLocal } from '../state/homeNext';
import type { MajorTab } from './major/majorTabs';
import { MajorCalendarButton } from './major/MajorCalendarButton';
import { BrandMark } from './brand';
import { FounderCounter } from './FounderCounter';
import { Button, Modal } from './ds';
import { LegalLinks } from './Legal';
import { LEGAL_PATHS } from '../legal';
import { AccountError, login, signup, beginPix, fetchMe, requestPasswordReset, confirmPasswordReset, useAccount, type PixCharge } from '../state/account';
import { pixErrorKind, type PixErrorKind } from '../state/pixView';
import { PixPanel } from './PixPanel';
import { careerLang, ct } from '../state/career-i18n';
import { loadGhost } from '../state/ghost';
import { loadDuelInvite } from '../state/duelInvite';
import { dateKeyOf, dayNumberOf } from '../engine/daily/lines';
// [URG-2] evento de fim de semana: banner público (deslogado também) com contador e a carta exclusiva
import { fetchActiveLiveops } from '../state/liveops';
import type { WeekendEventView } from '../state/weekendEvent';
import type { UltCard } from '../engine/ultimate/cards';
import { formatCountdown } from '../engine/ultimate/weekendEvent';
import { useCommunityGoalPublic } from '../state/communityGoal'; // [URG-5]
import '../styles/landing.css';
import { priceLabel, usePrice, withPrice } from '../state/price';

// capturas reais da interface do jogo (public/landing/, WebP)
const SHOT = '/landing/';
// bastidores e avisos saem primeiro no X (a seção de Novidades saiu da landing)
const X_PROFILE = 'https://x.com/castroomath';

// número no formato do idioma da interface (31,6 · 31.6)
const numLocale = () => (careerLang() === 'en' ? 'en-US' : careerLang() === 'es' ? 'es-ES' : 'pt-BR');
const fmtPct = (n: number) => `${n.toLocaleString(numLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

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
// listener de scroll). "Criar conta · {preço}" é o único CTA de cadastro com preço
// no próprio texto (src landing-nav); some no celular pra caber o essencial.
function Nav({ onAccount, onLogin, onPlay }: { onAccount: () => void; onLogin: () => void; onPlay: () => void }) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  const [solid, setSolid] = useState(false);
  const sentinel = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSolid(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const links: [string, string][] = [['comecar', 'Em 1 minuto'], ['modos', 'Modos'], ['conta', 'Conta'], ['faq', 'Perguntas']];
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
            <Button variant="gold" size="sm" className="lp-nav__acct" onClick={onAccount}>{ct('Criar conta')} · {priceLabel()}</Button>
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

// "Criar conta · {preço}" do hero: link, não disputa com o jogar (src landing-hero).
// Preço + "pagamento único" no próprio texto, a reassurance que já ajudou nas
// outras superfícies.
function HeroOffer({ onAccount }: { onAccount: () => void }) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  return (
    <div className="lp-offer">
      <button type="button" className="lp-textlink" onClick={onAccount}>{ct('Criar conta')} · {priceLabel()}</button>
      <span>{ct('Pagamento único · sem mensalidade')}</span>
    </div>
  );
}

// ── hero do Major (enquanto majorPromoOn) ────────────────────────────────────
function phaseLabel(p: MajorPhase): string {
  if (p.kind === 'pre') return p.days === 1 ? ct('Começa amanhã') : `${ct('Começa em')} ${p.days} ${ct('dias')}`;
  if (p.kind === 'stages') return ct('Stages suíços em andamento');
  return ct('Playoffs de 10 a 13/12');
}

/** etiqueta do painel: contagem até 24/11; no ar, "AO VIVO · Stage 2" (o Stage do dia pelas travas do pick'em) */
function deskChip(now: number, stage: LiveStage): { label: string; live: boolean } {
  const p = majorPhase(now);
  if (p.kind === 'pre') return { label: phaseLabel(p), live: false };
  if (stage.kind === 'stage') return { label: `${ct('AO VIVO')} · Stage ${stage.n}`, live: true };
  if (stage.kind === 'gap') return { label: ct('Playoffs em 10/12'), live: false };
  if (stage.kind === 'playoffs') return { label: `${ct('AO VIVO')} · Playoffs`, live: true };
  if (stage.kind === 'final') return { label: `${ct('AO VIVO')} · ${ct('Final')}`, live: true };
  return { label: phaseLabel(p), live: false };
}

/** o botão do Major em cada lugar da landing (hero/final usam o longo; a porta, o curto) */
function majorCtaLabel(cta: LandingMajorCta, short = false): string {
  if (cta === 'placar') return ct('Ver meu placar');
  if (cta === 'jogar') return ct('Jogar o Major com um time');
  return short ? ct("Fazer meu pick'em") : ct("Fazer meu pick'em do Major");
}

// O visual do hero: não há captura do Modo Major em public/landing/, então é
// HTML com dado real e pequeno (data/majorLanding.ts): a régua do evento e os 4
// favoritos ao título do painel do Modo Major, sem o JSON dos 32 times.
function MajorDesk({ now, stage }: { now: number; stage: LiveStage }) {
  const F = MAJOR_FAVORITES;
  const top = F.teams[0]?.pct || 1;
  const reached = milestonesReached(now);
  const chip = deskChip(now, stage);
  return (
    <aside className="lp-desk" aria-label={ct('PGL Major Singapore: datas e favoritos na simulação')}>
      <div className="lp-desk__head">
        <span className="lp-desk__chip" data-live={chip.live || undefined}>{chip.label}</span>
        <p className="lp-desk__event">PGL Major Singapore</p>
        <p className="lp-desk__where">{ct('Singapura · 32 times')}</p>
      </div>
      <ol className="lp-desk__line">
        {MAJOR_SG_MILESTONES.map((m, i) => (
          <li key={m.date} data-on={i < reached || undefined}>
            <b>{m.date}</b>
            <span>{ct(m.label)}</span>
          </li>
        ))}
      </ol>
      <div className="lp-desk__body">
        <p className="lp-desk__label" id="lp-desk-favs">{ct('Favoritos ao título na simulação')}</p>
        <ol className="lp-favs" aria-labelledby="lp-desk-favs">
          {F.teams.map((t, i) => (
            <li key={t.id}>
              <span className="lp-favs__rank" aria-hidden>{i + 1}</span>
              <span className="lp-favs__team"><b>{t.tag}</b>{t.name !== t.tag && <> <span>{t.name}</span></>}</span>
              <span className="lp-favs__bar" aria-hidden><span style={{ transform: `scaleX(${Math.min(1, t.pct / top)})` }} /></span>
              <span className="lp-favs__pct">{fmtPct(t.pct)}</span>
            </li>
          ))}
        </ol>
        <p className="lp-desk__note">
          {F.runs.toLocaleString(numLocale())} {ct('Majors simulados no jogo')} · {F.status === 'projecao' ? ct('lista provisória até 02/11') : ct('lista oficial')}
        </p>
      </div>
      <p className="lp-desk__foot">{ct('3 stages suíços · playoffs em MD3 · final em MD5')}</p>
      <div className="lp-desk__cal">
        <MajorCalendarButton className="lp-notice__go" label={ct('Lembrar no calendário')} doneLabel={ct('Arquivo baixado: abra para salvar')} surface="landing" />
      </div>
    </aside>
  );
}

function HeroMajor({ now, stage, cta, onMajor, onPlay, onAccount }: {
  now: number; stage: LiveStage; cta: LandingMajorCta; onMajor: () => void; onPlay: () => void; onAccount: () => void;
}) {
  return (
    <section id="topo" className="lp-hero lp-hero--major" aria-labelledby="lp-hero-title">
      <div className="lp-wrap lp-hero__grid">
        <div className="lp-hero__copy">
          <span className="lp-kicker"><Trophy size={14} aria-hidden /> {ct('PGL Major Singapore, de 24/11 a 13/12')}</span>
          {/* depois da trava do Stage 1 o hero não promete ponto pra palpite novo */}
          <h1 className="lp-h1" id="lp-hero-title">
            {cta === 'placar' ? <>{ct("Acompanhe o seu pick'em")} <span>{ct('do Major de Singapura')}</span></>
              : cta === 'jogar' ? <>{ct('Jogue o Major')} <span>{ct('de Singapura com um time')}</span></>
              : <>{ct("Faça seu pick'em")} <span>{ct('do Major de Singapura')}</span></>}
          </h1>
          <p className="lp-hero__sub">
            {cta === 'placar'
              ? ct('Os pontos de cada Stage entram quando sai o resultado oficial. Enquanto isso, jogue as séries do Major com um time ou chame os amigos pra uma liga.')
              : cta === 'jogar'
                ? ct('Palpite feito agora não entra no placar, que travou no início do Stage 1. Mas dá para escolher um time e jogar as séries do Major, chamar os amigos pra uma liga ou simular o campeonato inteiro.')
                : ct('Escolha quem passa em cada stage, monte a chave dos playoffs e simule o Major inteiro. Depois, jogue as séries com um time ou chame os amigos pra uma liga.')}
          </p>
          <div className="lp-hero__cta">
            {/* o clique no Major é medido no App (major_vitrine_click, surface landing) */}
            <div className="lp-hero__btns">
              <Button size="big" onClick={onMajor}>{majorCtaLabel(cta)} <ArrowRight size={18} aria-hidden /></Button>
              <Button size="big" variant="secondary" onClick={onPlay}>{ct('Jogar grátis')}</Button>
            </div>
            <p className="lp-hero__assure"><Check size={16} aria-hidden /> {ct('Grátis, sem cadastro, no navegador e no celular.')}</p>
            <HeroOffer onAccount={onAccount} />
          </div>
        </div>
        <div className="lp-hero__stage lp-hero__stage--desk">
          <MajorDesk now={now} stage={stage} />
        </div>
      </div>
    </section>
  );
}

// ── hero geral (depois da janela do Major) ───────────────────────────────────
function HeroGeneral({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
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
            <HeroOffer onAccount={onAccount} />
            {/* prova social REAL: contador de Fundadores do servidor (falhou? não mostra nada) */}
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

// ── "Em 1 minuto": 3 portas, cada uma com o tempo honesto ───────────────────
// Tempos iguais aos do onboarding (onboard.*Meta) e dos cards do Início. O card
// inteiro é clicável pelo botão (o ::after cobre o card); o título continua h3.
type DoorCard = { time: string; title: string; desc: string; meta: string; cta: string };
const DOORS: Record<LandingDoorId, DoorCard> = {
  major: { time: '~1 min', title: 'Modo Major', desc: "Faça o pick'em dos 32 times, jogue o Major com um time ou simule o campeonato inteiro.", meta: 'sem conta · grátis', cta: "Fazer meu pick'em" },
  diario: { time: '2 min', title: 'Diário', desc: 'Quatro desafios por dia, os mesmos pra todo mundo.', meta: 'todo dia · grátis', cta: 'Jogar o de hoje' },
  draft: { time: '~15 min', title: 'Draft', desc: 'Monte um cinco com lendas de cada era e dispute um Major avulso.', meta: 'partida rápida · rejogável', cta: 'Montar meu cinco' },
  carreira: { time: 'Campanha', title: 'Carreira', desc: 'Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.', meta: 'campanha longa · save neste navegador', cta: 'Fundar minha org' },
};

function QuickStart({ hero, cta, onMajor, onDoor }: { hero: LandingHero; cta: LandingMajorCta; onMajor: () => void; onDoor: (door: LandingDoor) => void }) {
  const doors = landingDoors(hero);
  const lateDesc = ct('Jogue o Major com um time, chame os amigos pra uma liga ou simule o campeonato inteiro.');
  return (
    <section id="comecar" className="lp-section lp-section--first" aria-labelledby="lp-comecar-title">
      <div className="lp-wrap">
        <SectionHead
          id="lp-comecar-title"
          kicker={ct('Em 1 minuto')}
          title={ct('Escolha por onde começar')}
          sub={hero === 'major'
            ? ct('O Modo Major abre na hora. Nos outros, você cria um manager em segundos, sem e-mail.')
            : ct('Você cria um manager em segundos, sem e-mail, e já entra jogando.')}
        />
        <ul className="lp-doors">
          {doors.map((id) => {
            const d = DOORS[id];
            const live = id === 'major' && cta !== 'pickem';
            return (
              <li key={id} className="lp-door lp-reveal" data-lead={id === 'major' || undefined}>
                <span className="lp-door__time">{ct(d.time)}</span>
                <h3 id={`lp-door-${id}`}>{ct(d.title)}</h3>
                <p>{live ? lateDesc : ct(d.desc)}</p>
                <span className="lp-door__meta">{ct(d.meta)}</span>
                <button type="button" className="lp-door__go" aria-describedby={`lp-door-${id}`} onClick={() => (id === 'major' ? onMajor() : onDoor(id))}>
                  {id === 'major' ? majorCtaLabel(cta, true) : ct(d.cta)} <ArrowRight size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ── os outros modos, compactos (capturas reais do jogo) ──────────────────────
type ModeCard = { icon: ReactNode; title: string; desc: string; meta: ReactNode; img: string; h?: number; alt: string };

function Modes({ hero, onPlay }: { hero: LandingHero; onPlay: () => void }) {
  const MODES: Record<LandingModeId, ModeCard> = {
    carreira: { icon: <Trophy size={16} />, title: 'Carreira', desc: 'Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.', meta: ct('1 jogador · campanha'), img: 'modo-carreira.webp', alt: 'Elenco da Carreira com os titulares, atributos, OVR e valor de mercado' },
    rtp: { icon: <Crosshair size={16} />, title: 'Road to Pro', desc: 'Você é o jogador. Nos momentos-chave, a chance de cada jogada fica na tela: o % que você vê é o % que rola.', meta: <><b>{ct('Demo grátis')}</b> · {ct('carreira completa na conta vitalícia')}</>, img: 'modo-rtp-sala.webp', h: 800, alt: 'Momento-chave do Road to Pro: round de pistola com três jogadas, cada uma com a sua chance em porcentagem e os modificadores que a formam' },
    ultimate: { icon: <Star size={16} />, title: 'Ultimate', desc: 'Abra pacotes, colecione os jogadores reais de 2026 e dispute a ranqueada online contra outros managers.', meta: ct('Online · ranqueada'), img: 'modo-ultimate.webp', alt: 'Squad do Ultimate com as cartas dos jogadores e a química do time' },
    online: { icon: <Globe size={16} />, title: 'Online', desc: 'Ranqueada contra outros managers, duelo privado com amigos e o Major da Semana.', meta: ct('Com o seu squad do Ultimate'), img: 'modo-online.webp', alt: 'Ranqueada online com as divisões do Bronze ao Elite' },
  };
  const ids = landingModes(hero);
  return (
    <section id="modos" className="lp-section" aria-labelledby="lp-modos-title">
      <div className="lp-wrap">
        <SectionHead id="lp-modos-title" kicker={ct('Mais modos')} title={ct('Quando quiser ir mais fundo')} sub={ct('Estas são telas reais do jogo. Tudo na mesma interface, no PC e no celular.')} />
        <ul className="lp-modes" data-count={ids.length}>
          {ids.map((id) => {
            const m = MODES[id];
            return (
              <li key={id} className="lp-mode lp-reveal">
                <div className="lp-mode__shot">
                  {/* 112px no celular e no tablet, a largura do card só a partir de 1100px: a versão de 320px
                      evita baixar a de 960px para uma miniatura (Lighthouse, 30/10) */}
                  <img
                    src={SHOT + m.img} srcSet={`${SHOT}${m.img.replace('.webp', '-320.webp')} 320w, ${SHOT}${m.img} 960w`}
                    sizes="(min-width: 1100px) 360px, 112px"
                    width={960} height={m.h ?? 600} loading="lazy" decoding="async" alt={ct(m.alt)}
                  />
                </div>
                <div className="lp-mode__body">
                  <h3><span aria-hidden>{m.icon}</span>{ct(m.title)}</h3>
                  <p>{ct(m.desc)}</p>
                  <span className="lp-mode__meta">{m.meta}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="lp-modes__cta lp-reveal">
          <Button size="big" onClick={onPlay}>{ct('Jogar agora, de graça')} <Play size={18} aria-hidden /></Button>
        </div>
      </div>
    </section>
  );
}

function Pricing({ onAccount, onPlay }: { onAccount: () => void; onPlay: () => void }) {
  usePrice(); // re-renderiza quando o preço do servidor chega
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
            <div className="lp-plan__price"><strong>{priceLabel()}</strong><span>{ct('uma vez, sem assinatura')}</span></div>
            <p className="lp-plan__note">{ct('Pix ou cartão · acesso imediato')}</p>
            {/* prova social REAL: contagem de Fundadores do servidor (falhou? não mostra nada) */}
            <FounderCounter />
            <ul className="lp-checks">
              {PAID.map((f) => <li key={f}><Check size={16} aria-hidden /><b>{ct(f)}</b></li>)}
            </ul>
            <Button variant="gold" block onClick={onAccount}>{ct('Criar conta')} · {priceLabel()}</Button>
          </article>
        </div>
        <p className="lp-plans__foot lp-reveal">
          {withPrice(ct('Os {preço} cobrem conta, banco de dados e persistência em nuvem enquanto o serviço estiver em operação, sem mensalidade.'))}
        </p>
      </div>
    </section>
  );
}

function Faq({ hero }: { hero: LandingHero }) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  // durante o Major, a pergunta de quem chega pelos posts do Major vem primeiro (e aberta)
  const MAJOR_Q: [string, string] = ['O Modo Major é de graça?', "É. Pick'em dos 32 times, jogar o Major com um time, liga com os amigos e a simulação do campeonato inteiro, sem conta e sem criar manager. O palpite fica salvo neste navegador."];
  const Q: [string, string][] = [
    ...(hero === 'major' ? [MAJOR_Q] : []),
    ['Preciso pagar pra jogar?', 'Não. Carreira, Ultimate, Draft, Diário e Online são de graça, incluindo a ranqueada online, e o Road to Pro tem demo grátis. O save fica no seu navegador. A conta de {preço} guarda o progresso na nuvem e libera o Road to Pro completo.'],
    ['O que a conta vitalícia me dá?', 'O Road to Pro completo com a Série do Dia, save na nuvem pra jogar no PC e no celular, compra de coins pra abrir mais packs no Ultimate, histórico de partidas e um selo de apoiador. É um pagamento único, sem mensalidade.'],
    ['Funciona no celular?', 'Sim. O jogo roda no navegador do celular com a mesma interface do PC, e dá pra instalar na tela inicial como um app.'],
    ['O Ultimate é o modo online?', 'Sim. No Ultimate você monta seu elenco dos jogadores reais de 2026 e enfrenta outros managers na fila ranqueada, subindo de divisão. É de graça: a conta só entra pra salvar na nuvem e comprar coins.'],
    ['Se eu não criar conta, perco o progresso?', 'O progresso fica salvo no localStorage do navegador. Se você limpar o cache ou trocar de aparelho, ele some. Com conta isso não acontece.'],
    ['Como pago os {preço}?', 'Cartão pelo Stripe ou Pix pelo Woovi. É um pagamento único pelos recursos persistentes, válido enquanto o Road to Major continuar em operação, conforme os Termos.'],
    ['De onde vêm os jogadores e times?', 'Os elencos e dados são curados a partir de HLTV e Liquipedia, do CS 1.6 ao CS2.'],
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
                    <span>{withPrice(ct(q))}</span>
                    <ChevronDown size={20} aria-hidden />
                  </button>
                </h3>
                <div className="lp-qa__panel" id={`lp-a-${i}`} role="region" aria-labelledby={`lp-q-${i}`} hidden={!on}>{withPrice(ct(a))}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ hero, cta, onMajor, onAccount, onPlay }: { hero: LandingHero; cta: LandingMajorCta; onMajor: () => void; onAccount: () => void; onPlay: () => void }) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  const major = hero === 'major';
  return (
    <section className="lp-section lp-section--last" aria-labelledby="lp-final-title">
      <div className="lp-wrap">
        <div className="lp-final lp-reveal">
          <img src="/maps/nuke.jpg" alt="" loading="lazy" decoding="async" width={300} height={168} />
          <BrandMark size={56} />
          <h2 className="lp-h2" id="lp-final-title">{ct('O título não é dado, é conquistado')}</h2>
          <p className="lp-lead">
            {major && cta === 'pickem'
              ? ct("Faça seu pick'em agora, de graça. Quando quiser guardar tudo na nuvem, é só criar a sua conta.")
              : major
                ? ct('Jogue o Major agora, de graça. Quando quiser guardar tudo na nuvem, é só criar a sua conta.')
                : ct('Comece de graça agora. Quando quiser guardar tudo na nuvem, é só criar a sua conta.')}
          </p>
          <div className="lp-final__cta">
            {major
              ? <Button size="big" onClick={onMajor}>{majorCtaLabel(cta)} <ArrowRight size={18} aria-hidden /></Button>
              : <Button size="big" onClick={onPlay}>{ct('Jogar agora, de graça')} <Play size={18} aria-hidden /></Button>}
            {/* funil: CTA final da página, com o preço no texto do botão (a seção de
                planos já ficou pra trás na rolagem). src landing-final. */}
            <Button size="big" variant="gold" onClick={onAccount}>{ct('Criar conta')} · {priceLabel()}</Button>
          </div>
          {major && <button type="button" className="lp-textlink" onClick={onPlay}>{ct('Ou jogue os outros modos, de graça')}</button>}
        </div>
        <footer className="lp-footer">
          <span className="lp-footer__brand"><BrandMark size={22} /> Road to Major</span>
          <p>{ct('Produto comercial independente, não afiliado ou endossado pela Valve, HLTV, Liquipedia, equipes ou jogadores.')}</p>
          <span className="lp-footer__links">
            <a className="lp-footer__x" href={X_PROFILE} target="_blank" rel="noreferrer">{ct('Siga @castroomath no X')} <ArrowUpRight size={14} aria-hidden /></a>
            <LegalLinks />
          </span>
        </footer>
      </div>
    </section>
  );
}

// nudge anti-abandono do QR Pix: no máximo 1x por sessão de navegação (guard de
// módulo). Honesto e descartável — sem timer fake, sem segunda modal.
const nudgeShownThisSession = new Set<string>();

export function AccountModal({ onClose, onCheckout, onPlay, initialMode = 'signup', pixFirst = false, payingAccount = null, playerNick = '' }: {
  onClose: () => void; onCheckout: (email: string, nick: string) => Promise<void>; onPlay: () => void; initialMode?: 'signup' | 'login';
  /** Checkout aberto por cima da trava do Road to Pro: o QR Pix é o passo
   *  seguinte automático e, com ele na tela, o formulário sai do caminho (o QR
   *  e a troca pro cartão cabem sem rolar no celular). O cartão continua. */
  pixFirst?: boolean;
  /** Conta grátis já logada (sem pagar): pula o cadastro e vai direto pro pagamento. */
  payingAccount?: { email: string; nick: string } | null;
  /** Nick do jogador do RtP, citado no reforço do Pix. */
  playerNick?: string;
}) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  // 'pay': conta grátis existente — só o passo de pagamento. Lido 1x (useState):
  // o signup/login de dentro do modal também grava a conta, e o modal NÃO pode
  // trocar de passo no meio do fluxo por causa disso.
  const [mode, setMode] = useState<'signup' | 'login' | 'reset' | 'pay'>(() => (payingAccount ? 'pay' : initialMode));
  const [payAcct] = useState(payingAccount);
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
  // Pix Woovi: a cobrança na tela, o e-mail da conta e quando ela chegou (base do
  // prazo do Woovi). A tela do QR é o PixPanel (igual ao do UpsellCard).
  const [pix, setPix] = useState<{ charge: PixCharge; email: string; at: number } | null>(null);
  // conta que já passou pelo cadastro/login nesta tela: daqui pra frente o modal
  // é só o Pix, e gerar de novo (código expirou, deu erro) não refaz o cadastro.
  const [pixEmail, setPixEmail] = useState('');
  const [pixGenerating, setPixGenerating] = useState(false);
  const [pixErr, setPixErr] = useState<PixErrorKind | null>(null);
  // o polling automático bateu no teto de 15 min: a tela pede o "verificar agora"
  const [pollPaused, setPollPaused] = useState(false);
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
  // funil: a reassurance dos 25s não é o fim da história — nos checkout_abandon
  // (pix, 28d), 4 dos 6 abandonos do gancho 'rtp-demo-cliff' (o público mais
  // engajado do funil) passam de 160s esperando, alguns perto de 400s, e MESMO
  // ASSIM desistem. Essa galera já viu a reassurance e a saída pro cartão —
  // só sobra o polling automático e mudo a cada 6s. O botão chama o MESMO
  // /api/account do polling (nenhuma lógica de pagamento nova), só na hora que
  // a pessoa pede: devolve a sensação de controle pra quem decidiu pagar e só
  // está esperando a confirmação cair.
  const [checkingNow, setCheckingNow] = useState(false);
  const checkPixNow = async () => {
    if (!pix || checkingNow) return;
    setCheckingNow(true);
    trackPaywallView('pix-check-manual'); // funil: usou o "verificar agora" (src próprio)
    try {
      const me = await fetchMe();
      if (me?.paid) { pixConfirmed.current = true; setPix(null); onPlay(); return; }
    } catch { /* ignora: a tela segue esperando o polling automático */ }
    setCheckingNow(false);
  };
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
    setPollPaused(false);
    const check = async () => {
      try { const me = await fetchMe(); if (alive && me?.paid) { pixConfirmed.current = true; setPix(null); onPlay(); } } catch { /* ignora */ }
    };
    const t = setInterval(() => {
      if (Date.now() - startedAt > CAP_MS) { clearInterval(t); if (alive) setPollPaused(true); return; } // Pix expirou: a tela oferece o "verificar agora"
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
  const valid = mode === 'pay' || (/\S+@\S+\.\S+/.test(email) && pw.length >= 6
    && (mode === 'login' || (accepted && pw === pw2)));
  // conta (nova, login ou a grátis já logada) que vai pagar
  const resolveAccount = async () => {
    if (mode === 'pay' && payAcct) return { ...payAcct, paid: false };
    if (mode === 'signup') trackSignup('start'); // funil: cadastro pré-pagamento começou
    const acct = mode === 'signup' ? await signup(email.trim(), pw, nick.trim()) : await login(email.trim(), pw);
    if (mode === 'signup') trackSignup('done');  // funil: cadastro criado com sucesso
    return acct;
  };
  const go = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const acct = await resolveAccount();
      if (acct.paid) { onPlay(); return; }           // já tem conta vitalícia: entra direto
      await onCheckout(acct.email, acct.nick || nick.trim()); // segue pro pagamento (checkout_open é do App.startCheckout)
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); setBusy(false); }
  };
  // Pix via Woovi: cria/entra na conta, gera a cobrança e mostra QR + copia-e-cola
  // INLINE. O webhook (/api/woovi-webhook) marca a conta como paga e o polling
  // acima detecta na mesma tela e libera o acesso.
  // Gera a cobrança da conta já resolvida. Também é o "Gerar novo código" /
  // "Tentar de novo": o checkout_open conta só a 1ª vez que um QR aparece neste
  // modal, e o pixOpenedAt (base do abandono) fica nessa 1ª abertura.
  const requestPix = async (acctEmail: string) => {
    setPixErr(null); setPixGenerating(true);
    try {
      const charge = await beginPix();
      if (!charge) { pixConfirmed.current = true; setPix(null); onPlay(); return; } // já estava paga
      setPix({ charge, email: acctEmail, at: Date.now() });
      if (!pixOpenedAt.current) {
        pixOpenedAt.current = Date.now();
        trackCheckoutOpen('pix'); // funil: QR Pix da vitalícia na tela
      }
    } catch (e) {
      // sem token o beginPix nem chega no servidor: é sessão (como o 401)
      setPixErr(pixErrorKind(e instanceof AccountError ? e.status : 401));
    }
    setPixGenerating(false);
  };
  const goPix = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const acct = pixEmail ? { email: pixEmail, paid: false } : await resolveAccount();
      if (acct.paid) { onPlay(); return; }
      setPixEmail(acct.email);
      await requestPix(acct.email);
    } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); }
    setBusy(false);
  };
  const regenPix = () => { if (pixEmail && !pixGenerating) void requestPix(pixEmail); };
  // troca pro cartão sem perder o cadastro: a conta já foi criada no goPix, então
  // só dispara o checkout do Stripe (mesmo onCheckout do botão "Ativar com
  // cartão" acima) — não é um segundo cadastro.
  const switchToCard = async () => {
    if (!pixEmail || cardSwitching) return;
    setCardSwitching(true);
    pixSwitchedMethod.current = true;
    await onCheckout(pixEmail, nick.trim() || payAcct?.nick || '');
  };
  // pixFirst + conta grátis já logada: não há o que cadastrar — o QR Pix abre
  // sozinho (1x). Quem prefere cartão tem o botão logo abaixo do QR.
  const autoPix = useRef(false);
  useEffect(() => {
    if (!pixFirst || mode !== 'pay' || autoPix.current) return;
    autoPix.current = true;
    void goPix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixFirst, mode]);
  // Passo do Pix: com a conta resolvida e o Pix gerando, na tela ou com erro, o
  // modal vira só o PixPanel. Antes o formulário (e o preço) ficava em cima e, no
  // celular, o QR e o "Copiar" caíam abaixo da dobra. pixFirst + conta grátis já
  // abre direto no passo (sem piscar o preço antes do auto-Pix).
  const pixStep = !!pix || pixGenerating || (!!pixErr && !!pixEmail) || (pixFirst && mode === 'pay');
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
      <span>{pixStep || mode === 'pay' ? ct('Ativar a vitalícia') : mode === 'signup' ? ct('Criar conta') : mode === 'reset' ? ct('Recuperar senha') : ct('Entrar')}</span>
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
      {(mode === 'signup' || mode === 'pay') && !pixStep && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--em-gold)' }}>{priceLabel()}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--em-muted)' }}>{ct('pagamento único pelo save em nuvem')}</span>
          </div>
          {/* reassurance: tira as 3 dúvidas mais comuns antes do pagamento */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '8px', fontSize: '0.74rem', color: 'var(--em-muted)', fontWeight: 600 }}>
            <span>✔ {ct('Pagamento único')}</span>
            <span>✔ {ct('Acesso imediato')}</span>
            <span>✔ {ct('Pix ou cartão')}</span>
          </div>
          {pixFirst && (
            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--c-win)', fontWeight: 700 }}>
              {playerNick
                ? <>{ct('Pix aprova na hora · o')} {playerNick} {ct('continua de onde parou')}</>
                : ct('Pix aprova na hora · seu jogador continua de onde parou')}
            </p>
          )}
          {/* prova social REAL (servidor); fetch falhou → não renderiza nada */}
          <FounderCounter style={{ marginTop: '8px' }} />
        </div>
      )}
      {info && mode !== 'signup' && !pixStep && <p style={{ color: 'var(--c-win)', fontSize: '0.8rem', margin: '0 0 12px' }}>{info}</p>}
      {mode === 'pay' || pixStep ? null : mode !== 'reset' ? (
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
            <input style={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={ct('mínimo 6 caracteres')} type={showPw ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onKeyDown={(e) => e.key === 'Enter' && (mode === 'signup' ? goPix() : go())} />
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
                onKeyDown={(e) => e.key === 'Enter' && goPix()}
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
      {mode === 'signup' && !pixStep && (
        <label className="checkout-legal-accept">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>{ct('Li e aceito os')} <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer">{ct('Termos')}</a> {ct('e a')} <a href={LEGAL_PATHS.refund} target="_blank" rel="noreferrer">{ct('Política de Reembolso')}</a>{ct(', consultei a')} <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer">{ct('Privacidade')}</a> {ct('e confirmo ser maior de 18 anos ou responsável legal pela compra.')}</span>
        </label>
      )}
      {err && !pixStep && <p style={{ color: '#e2574c', fontSize: '0.8rem', margin: '12px 0 0' }}>{err}</p>}
      {/* funil: dado real (checkout_open x rtm_paid_emails, por método) mostra o Pix
          confirmando a imensa maioria dos checkouts abertos, enquanto o cartão perde
          a maior parte no redirect pro Stripe — então o Pix vira o CTA primário
          (ouro) e o cartão passa a secundário, sem tirar a opção de ninguém. */}
      {pixStep ? null : mode === 'signup' || mode === 'pay' ? (
        <>
          {/* funil: dado real (28d) — 10 dos 26 checkout_abandon(pix) (38%) fecham
              em MENOS de 15s, rápido demais pra ser espera de pagamento. É gente
              clicando "Pagar com Pix" sem o banco à mão e desistindo assim que o
              QR aparece. Os nudges existentes (troca pro cartão, reassurance)
              só entram DEPOIS que o QR já está na tela — não alcançam esse grupo.
              Avisa ANTES do clique, sem fricção nem passo extra. */}
          <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', textAlign: 'center', margin: '14px 0 0' }}>
            {ct('Tenha o app do banco à mão: o código Pix aparece logo em seguida')}
          </p>
          <Button variant="gold" disabled={!valid || busy} style={{ width: '100%', marginTop: '8px' }} onClick={goPix}>
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
      {pixStep && (
        <PixPanel
          charge={pix?.charge ?? null}
          chargeAt={pix?.at ?? 0}
          generating={pixGenerating}
          error={pixErr}
          onRegenerate={regenPix}
          /* saída honesta pro cartão — visível desde que o QR abre, não mais só
             aos 25s (ver comentário no effect acima: 29% dos abandonos do Pix
             desistem antes disso). O Pix continua o CTA primário e o QR não some. */
          onCard={() => void switchToCard()}
          cardSwitching={cardSwitching}
          /* reassurance + "Já paguei, verificar agora" a partir dos 25s (ver os
             comentários do pixWaitLong e do checkPixNow acima) */
          waitLong={pixWaitLong}
          onCheckNow={() => void checkPixNow()}
          checkingNow={checkingNow}
          pollPaused={pollPaused}
          note={playerNick ? <>{ct('Pix aprova na hora · o')} {playerNick} {ct('continua de onde parou')}</> : undefined}
          interrupt={nudge ? (
            /* nudge anti-abandono (1x/sessão): inline, honesto, descartável. Logo
               abaixo do status (antes ficava no fim do QR, fora da tela no celular). */
            <div className="pix-panel__nudge" role="group" aria-label={ct('Continuar pagamento')}>
              <p>{ct('Ficou alguma dúvida? O acesso é vitalício e o Pix confirma na hora.')}</p>
              <div className="pix-panel__nudge-actions">
                <Button variant="secondary" autoFocus onClick={() => setNudge(false)}>{ct('Continuar pagamento')}</Button>
                <Button variant="ghost" onClick={onClose}>{ct('Fechar')}</Button>
              </div>
            </div>
          ) : undefined}
        />
      )}
      {mode !== 'pay' && !pixStep && <p style={{ fontSize: '0.8rem', color: 'var(--em-muted)', textAlign: 'center', margin: '14px 0 0' }}>
        {mode === 'reset' ? (
          <button type="button" onClick={() => { setMode('login'); setResetStep('ask'); setErr(''); setInfo(''); }} style={{ background: 'none', border: 'none', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>← {ct('Voltar pro login')}</button>
        ) : (
          <>
            {mode === 'signup' ? ct('Já tem conta? ') : ct('Não tem conta? ')}
            <button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); setInfo(''); setPw2(''); }} style={{ background: 'none', border: 'none', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{mode === 'signup' ? ct('Entrar') : ct('Criar conta')}</button>
          </>
        )}
      </p>}
      <p style={{ fontSize: '0.72rem', color: 'var(--em-muted)', opacity: 0.75, textAlign: 'center', margin: '10px 0 0' }}>{ct('Cartão pelo Stripe ou Pix pelo Woovi. Todo o jogo permanece gratuito; a conta paga apenas mantém dados na nuvem.')}</p>
    </Modal>
  );
}

export function Landing({ onPlay, onCheckout, openSignup, onMajor, onDoor }: {
  onPlay: () => void; onCheckout: (email: string, nick: string) => Promise<void>; openSignup?: boolean;
  /** abre o Modo Major, numa aba se pedir (o App mede o clique: major_vitrine_click, surface landing) */
  onMajor?: (tab?: MajorTab) => void;
  /** porta do "Em 1 minuto" (Diário, Draft, Carreira); sem ela, cai no onPlay */
  onDoor?: (door: LandingDoor) => void;
}) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  const [acct, setAcct] = useState(!!openSignup); // deep-link /?criar OU clique numa trava dentro do app: pula a landing e abre direto o cadastro
  const [acctMode, setAcctMode] = useState<'signup' | 'login'>('signup');
  const ref = useReveal();
  // hero do Major enquanto a vitrine estiver no ar (data/majorWindow.ts) e o App
  // souber abrir o modo; o instante é lido 1x por visita (régua e contagem)
  const [now] = useState(() => Date.now());
  const hero = landingHero(now, !!onMajor);
  // ao vivo: o Stage do dia (data/majorLive.ts) e o CTA pelo palpite deste navegador
  const [live] = useState(() => {
    const { parts, snaps } = readMajorLocal();
    return { stage: liveStage(now, livePublished()), cta: landingMajorCta(pickemStanding(parts, snaps, LIVE_LOCKS, now)) };
  });
  // nunca repassa o evento do clique como aba
  const openMajor = () => {
    if (!onMajor) return onPlay();
    if (live.cta === 'placar') { requestPlacarFocus(); onMajor('pickem'); }
    else if (live.cta === 'jogar') onMajor('play');
    else onMajor();
  };
  const openDoor = onDoor ?? (() => onPlay());
  // funil: CTA da landing abrindo o modal de conta. first-touch, então quem
  // chegou de uma trava (home-rtp, wl-lock...) mantém a origem original.
  // src por botão: landing-nav, landing-hero, landing-pricing, landing-final e
  // landing-ghost; o "Entrar" segue com o src padrão 'landing'.
  const openAcct = (mode: 'signup' | 'login' = 'signup', src: string = 'landing') => { setCheckoutSrc(src); setAcctMode(mode); setAcct(true); };
  // conta grátis já logada (cadastro pendente) que chegou aqui pra pagar (trava do
  // perfil/ranking → goToCheckout, /?criar): vai direto pro passo do pagamento,
  // sem refazer o cadastro (antes: os 4 campos + o aceite de novo).
  const { account } = useAccount();
  const payingAccount = acctMode === 'signup' && account && !account.paid ? { email: account.email, nick: account.nick } : null;
  // desafio de fantasma pendente (link aberto sem vitalícia): o motivo de
  // comprar HOJE, o desafio expira à meia-noite.
  const ghost = loadGhost(dayNumberOf(dateKeyOf(new Date())));
  const duelInvite = loadDuelInvite(); // [U11]
  // [URG-2] evento de fim de semana: lê o live-ops público (o servidor mescla o automático) e
  // recalcula a cada minuto pro contador; sem rede cai no cálculo local do mesmo engine.
  // O módulo do evento vem sob demanda: o cálculo local usa o catálogo do
  // Ultimate (a base de jogadores, ~124 KB gz) e não pode entrar na primeira
  // carga da landing. Até ele chegar, a faixa ocupa o mesmo lugar sem texto
  // visível (não empurra o hero quando aparece: CLS).
  const [wk, setWk] = useState<{ view: WeekendEventView; card: UltCard | null } | null>(null);
  useEffect(() => {
    let on = true;
    let t = 0;
    void import('../state/weekendEvent').then((m) => {
      const compute = () => { if (on) { const view = m.weekendEventView(); setWk({ view, card: m.weekendExclusiveCard(view) }); } };
      compute();
      void fetchActiveLiveops().then(compute, compute);
      t = window.setInterval(compute, 60_000);
    }, () => { /* sem o chunk: a faixa fica de fora */ });
    return () => { on = false; window.clearInterval(t); };
  }, []);
  const wknd = wk?.view ?? null;
  const wkndCard = wk?.card ?? null;
  const wkndRemain = wknd ? (wknd.open ? wknd.endsAtMs : wknd.startsAtMs) - Date.now() : 0;
  return (
    <div ref={ref} className="lp-page">
      <a className="lp-skip" href="#conteudo">{ct('Pular para o conteúdo')}</a>
      <Nav onAccount={() => openAcct('signup', 'landing-nav')} onLogin={() => openAcct('login')} onPlay={onPlay} />
      <main id="conteudo" tabIndex={-1}>
        {/* o Modo Major não tem mais faixa aqui: com a vitrine no ar, ele é o hero */}
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
          {!wk && (
            // reserva o lugar da faixa do evento enquanto o módulo carrega (sem CLS)
            <div className="lp-notice lp-notice--wait" aria-hidden>
              <Gift size={16} aria-hidden />
              <span>{ct('Evento até domingo')}: <b>Fim de Semana</b> · {ct('carta exclusiva')} <b>…</b> · {ct('termina em')} <b>…</b></span>
              <span className="lp-notice__go">{ct('Jogar')} <ArrowRight size={14} aria-hidden /></span>
            </div>
          )}
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
              <span><b>{ghost.nick}</b> {ct('te desafiou na SÉRIE DO DIA')}, {ct('rating')} <b>{ghost.rating.toFixed(2)}</b> {ct('na mesma série que você jogaria')}. {withPrice(ct('O desafio expira à meia-noite. A Série do Dia é da conta vitalícia ({preço}, uma vez).'))}</span>
              <button type="button" className="lp-notice__go" onClick={() => openAcct('signup', 'landing-ghost')}>{ct('Aceitar o desafio')} <ArrowRight size={14} aria-hidden /></button>
            </div>
          )}
          <CommunityGoalBar onPlay={onPlay} />
        </div>
        {hero === 'major'
          ? <HeroMajor now={now} stage={live.stage} cta={live.cta} onMajor={openMajor} onPlay={onPlay} onAccount={() => openAcct('signup', 'landing-hero')} />
          : <HeroGeneral onAccount={() => openAcct('signup', 'landing-hero')} onPlay={onPlay} />}
        <QuickStart hero={hero} cta={live.cta} onMajor={openMajor} onDoor={openDoor} />
        <Modes hero={hero} onPlay={onPlay} />
        <Pricing onAccount={() => openAcct('signup', 'landing-pricing')} onPlay={onPlay} />
        <Faq hero={hero} />
        <FinalCta hero={hero} cta={live.cta} onMajor={openMajor} onAccount={() => openAcct('signup', 'landing-final')} onPlay={onPlay} />
      </main>
      {acct && <AccountModal onClose={() => setAcct(false)} onCheckout={onCheckout} onPlay={onPlay} initialMode={acctMode} payingAccount={payingAccount} />}
    </div>
  );
}
