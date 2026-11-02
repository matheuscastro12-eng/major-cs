import { ChevronRight, Layers, Target, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLang } from '../state/i18n';
import { Button, Modal } from './ds';

const KEY = 'major-onboarded-v1';

export function shouldOnboard(): boolean {
  // roda dentro de um useState initializer no primeiro render: storage
  // bloqueado (cookies off / iframe) não pode derrubar o app inteiro
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* sem storage: o modal volta na próxima visita, nada quebra */
  }
}

// As 3 portas da primeira sessão, da mais curta para a mais longa. Antes o
// modal explicava só o Draft (draft → veto → partida) e o botão apenas fechava:
// o visitante caía no Início com 7 modos e nenhuma primeira ação.
export type OnboardRoute = 'major' | 'draft' | 'career';

function Route({ mode, icon, kicker, title, desc, meta, cta, onGo }: {
  mode: string; icon: ReactNode; kicker: string; title: string; desc: string; meta: string; cta: string; onGo: () => void;
}) {
  // mesmo card de "Modos de jogo" do Início (home.css), pra primeira escolha
  // já ter a cara do lugar onde o jogador vai voltar
  return (
    <div className="home-mode" data-mode={mode}>
      <button type="button" className="home-mode__main" onClick={onGo}>
        <span className="home-mode__ic">{icon}</span>
        <span className="home-mode__txt">
          <span className="home-mode__kicker">{kicker}</span>
          <b>{title}</b>
          <span className="home-mode__desc">{desc}</span>
          <small>{meta}</small>
        </span>
        <span className="home-mode__cta">{cta} <ChevronRight size={14} aria-hidden /></span>
      </button>
    </div>
  );
}

export function Onboarding({ onClose, onRoute }: { onClose: () => void; onRoute: (route: OnboardRoute) => void }) {
  const { t } = useLang();
  const close = () => { markOnboarded(); onClose(); };
  const go = (route: OnboardRoute) => { markOnboarded(); onClose(); onRoute(route); };

  return (
    <Modal
      open
      onClose={close}
      title={t('onboard.welcome')}
      size="md"
      footer={<Button variant="ghost" onClick={close}>{t('onboard.skip')}</Button>}
    >
      <p className="muted" style={{ marginTop: 0 }}>{t('onboard.intro')}</p>
      <div className="onboarding-routes">
        <Route
          mode="major" icon={<Target size={20} />}
          kicker="PGL Major Singapore" title={t('onboard.majorTitle')}
          desc={t('onboard.majorDesc')} meta={t('onboard.majorMeta')} cta={t('onboard.majorCta')}
          onGo={() => go('major')}
        />
        <Route
          mode="major" icon={<Layers size={20} />}
          kicker={t('onboard.draftKicker')} title="Draft"
          desc={t('onboard.draftDesc')} meta={t('onboard.draftMeta')} cta={t('onboard.draftCta')}
          onGo={() => go('draft')}
        />
        <Route
          mode="carreira" icon={<Trophy size={20} />}
          kicker={t('onboard.careerKicker')} title={t('onboard.careerTitle')}
          desc={t('onboard.careerDesc')} meta={t('onboard.careerMeta')} cta={t('onboard.careerCta')}
          onGo={() => go('career')}
        />
      </div>
    </Modal>
  );
}
