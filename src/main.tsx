import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/career-dashboard.css'
import './styles/career-player-page.css'
import './styles/career-team-page.css'
import './styles/play-hub.css'
import App from './App.tsx'
import { installErrorLogging } from './state/errlog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ds'

installErrorLogging() // captura crash de runtime em producao (fire-and-forget)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
