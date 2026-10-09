import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// tokens primeiro: fonte única do design system "Broadcast Desk" (docs/design-system.md)
import './styles/tokens.css'
import './styles/tokens-legacy.css'
import './styles/base.css'
import './index.css'
import './styles/career-dashboard.css'
import './styles/career-player-page.css'
import './styles/career-team-page.css'
import './styles/play-hub.css'
import './styles/rtp.css'
// primitivos por último: .ds-* ganha empate de especificidade com o CSS legado
import './styles/primitives.css'
// shell universal (trilho + sidebar + topbar + CONTINUAR + paleta + peek)
import './styles/shell.css'
import './styles/home.css'
import './styles/screens.css'
// por último: a nova interface por cima das telas legadas dentro do shell
import './styles/skin.css'
import App from './App.tsx'
import { installErrorLogging } from './state/errlog'
import { installPwa } from './state/pwa'
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

installErrorLogging() // captura crash de runtime em producao (fire-and-forget)
installPwa()          // registra o SW e guarda o convite de instalacao (ver state/pwa.ts)

// BrowserRouter envolve a app desde T1.2 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md. Por enquanto fica
// inerte (sem <Routes>) — o App.tsx ainda usa o Screen union manual com
// history.pushState/popstate. Cada tela migra pra <Route> em commit separado:
// substituindo `setScreen('xxx')` por `useNavigate('/xxx')` e tirando a
// entrada do `Screen` union quando o último uso sair. Habilitar o BrowserRouter
// agora desbloqueia o uso dos hooks (useNavigate, useLocation, useParams) sem
// quebrar o sistema atual.
// Clutch Mode (/clutch ou ?clutch=1): tela cheia isolada, sem os modais globais
// (novidades, ajuda, etc.) por cima do jogo.
const CLUTCH_ROUTE = (() => {
  try {
    return window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/clutch'
      || new URLSearchParams(window.location.search).get('clutch') === '1';
  } catch { return false; }
})();

createRoot(document.getElementById('root')!).render(CLUTCH_ROUTE ? (
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
) : (
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
  </StrictMode>
))
