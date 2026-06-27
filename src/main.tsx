import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/career-dashboard.css'
import './styles/career-player-page.css'
import './styles/career-team-page.css'
import './styles/play-hub.css'
import App from './App.tsx'
import { installErrorLogging } from './state/errlog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ds'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import { KeyboardHelpHost } from './components/KeyboardHelpOverlay'
import { PatchNotesHost } from './components/PatchNotesModal'

installErrorLogging() // captura crash de runtime em producao (fire-and-forget)

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
    {/* ConfirmDialogHost vive FORA do ErrorBoundary porque ele precisa renderizar
        mesmo quando a app crashou e o boundary mostra a tela de erro (que tem
        botão "Reiniciar carreira" → chama confirm() global). Modal é portado
        ao body, então a ordem na árvore não importa visualmente. */}
    <ConfirmDialogHost />
    <KeyboardHelpHost />
    <PatchNotesHost />
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
