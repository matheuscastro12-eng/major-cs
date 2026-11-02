// só em dev: ?agora= adianta o relógio (state/devClock.ts); 1º import, antes de qualquer módulo ler Date.now
import './state/devClock'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// tokens primeiro: fonte única do design system "Broadcast Desk" (docs/design-system.md)
import './styles/tokens.css'
import './styles/tokens-legacy.css'
import './styles/base.css'
// index.css e os CSS das telas de jogo (carreira, RtP, play-hub) saíram da carga
// inicial: aqui fica só a cópia das regras que a landing, o Início, o shell e o
// /major-singapore usam (gerada por scripts/gen-css-inicial.mts). O resto chega
// com as telas de jogo, no lugar exato de antes (state/telasCss.ts).
import './styles/carga-inicial.css'
// primitivos por último: .ds-* ganha empate de especificidade com o CSS legado
import './styles/primitives.css'
// shell universal (trilho + sidebar + topbar + CONTINUAR + paleta + peek)
import './styles/shell.css'
import './styles/home.css'
import './styles/screens.css'
// por último: a nova interface por cima das telas legadas dentro do shell
import './styles/skin.css'
import App from './App.tsx'
import { getLang } from './state/i18n'
import { loadCareerStrings } from './state/career-i18n'
import { installErrorLogging } from './state/errlog'
import { installPwa } from './state/pwa'
import { installVercelAnalytics } from './state/vercelAnalytics'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ds'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import { KeyboardHelpHost } from './components/KeyboardHelpOverlay'
import { PatchNotesHost } from './components/PatchNotesModal'
import { HowToPlayHost, closeHowToPlay } from './components/HowToPlayHost'
import { CompareHost, closeCompare } from './components/CompareHost'
import { MetaPageHost, closeMeta } from './components/MetaPageHost'
import { FiredModalHost, closeFiredModal } from './components/FiredModalHost'
import { InfrastructurePageHost, closeInfrastructure } from './components/InfrastructurePageHost'
import { LockerRoomPageHost, closeLockerRoom } from './components/LockerRoomPageHost'
import { LogoBuilderHost, closeLogoBuilder } from './components/LogoBuilderHost'
import { SeasonRecapModalHost, closeSeasonRecap } from './components/SeasonRecapModalHost'
import { TrophyRoomHost, closeTrophyRoom } from './components/TrophyRoomHost'
import { CoachProfileHost, closeCoachProfile } from './components/CoachProfileHost'
import { HostBoundary } from './components/HostBoundary'
import { telasCss } from './state/telasCss'

// o CSS das telas de jogo entra logo depois do CSS global (state/telasCss.ts): marca
// o fim dele agora, antes de qualquer chunk lazy anexar o próprio CSS. Em dev ele
// carrega já, em toda tela: quem edita index.css (ou um CSS das telas) vê a mudança
// na landing sem regenerar o carga-inicial.css (o teste do gerador cobra antes do merge).
telasCss.markGlobalEnd()
if (import.meta.env.DEV) void telasCss.load()

installErrorLogging() // captura crash de runtime em producao (fire-and-forget)
installPwa()          // registra o SW e guarda o convite de instalacao (ver state/pwa.ts)
installVercelAnalytics() // pageviews no painel da Vercel, URL sem query sensível (ver state/vercelAnalytics.ts)

// idioma salvo em en/es: o dicionário do ct() (sob demanda, state/career-i18n.ts)
// começa a baixar já, em paralelo com o primeiro render
if (getLang() !== 'pt') void loadCareerStrings()

// BrowserRouter envolve a app desde T1.2 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md. Por enquanto fica
// inerte (sem <Routes>) — o App.tsx ainda usa o Screen union manual com
// history.pushState/popstate. Cada tela migra pra <Route> em commit separado:
// substituindo `setScreen('xxx')` por `useNavigate('/xxx')` e tirando a
// entrada do `Screen` union quando o último uso sair. Habilitar o BrowserRouter
// agora desbloqueia o uso dos hooks (useNavigate, useLocation, useParams) sem
// quebrar o sistema atual.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ConfirmDialogHost vive FORA de qualquer boundary porque as telas de erro
        (ErrorBoundary global e ModeErrorBoundary de cada modo) usam o confirm()
        global no "Recomeçar". Modal é portado ao body, então a ordem na árvore
        não importa visualmente. */}
    <ConfirmDialogHost />
    {/* [O1-36] cada host de modal com boundary próprio: um crash fecha o modal
        e avisa, em vez de desmontar a raiz inteira (tela branca). */}
    <HostBoundary name="keyboard-help"><KeyboardHelpHost /></HostBoundary>
    <HostBoundary name="patch-notes"><PatchNotesHost /></HostBoundary>
    <HostBoundary name="how-to-play" onCrash={closeHowToPlay}><HowToPlayHost /></HostBoundary>
    <HostBoundary name="compare" onCrash={closeCompare}><CompareHost /></HostBoundary>
    <HostBoundary name="meta" onCrash={closeMeta}><MetaPageHost /></HostBoundary>
    <HostBoundary name="fired" onCrash={closeFiredModal}><FiredModalHost /></HostBoundary>
    <HostBoundary name="infrastructure" onCrash={closeInfrastructure}><InfrastructurePageHost /></HostBoundary>
    <HostBoundary name="locker-room" onCrash={closeLockerRoom}><LockerRoomPageHost /></HostBoundary>
    <HostBoundary name="logo-builder" onCrash={closeLogoBuilder}><LogoBuilderHost /></HostBoundary>
    <HostBoundary name="season-recap" onCrash={closeSeasonRecap}><SeasonRecapModalHost /></HostBoundary>
    <HostBoundary name="trophy-room" onCrash={closeTrophyRoom}><TrophyRoomHost /></HostBoundary>
    <HostBoundary name="coach-profile" onCrash={closeCoachProfile}><CoachProfileHost /></HostBoundary>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
