import { useState } from 'react';
import { useLang } from '../state/i18n';

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

export function Onboarding({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [, setSeen] = useState(false);
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* sem storage: o modal volta na próxima visita, nada quebra */
    }
    setSeen(true);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          {t('onboard.welcome')}
          <span className="spacer" />
          <button className="icon-btn" onClick={close} aria-label={t('onboard.closeAria')}>
            ✕
          </button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            {t('onboard.intro')}
          </p>
          <div className="onboarding-steps">
            <div className="ob-step">
              <span className="n">1</span>
              <div>
                <h4>{t('onboard.step1Title')}</h4>
                <p>
                  {t('onboard.step1a')}
                  <b> {t('onboard.step1b')}</b> {t('onboard.step1c')}
                </p>
              </div>
            </div>
            <div className="ob-step">
              <span className="n">2</span>
              <div>
                <h4>{t('onboard.step2Title')}</h4>
                <p>{t('onboard.step2')}</p>
              </div>
            </div>
            <div className="ob-step">
              <span className="n">3</span>
              <div>
                <h4>{t('onboard.step3Title')}</h4>
                <p>
                  {t('onboard.step3a')}{' '}
                  <b>{t('onboard.step3b')}</b> {t('onboard.step3c')}
                </p>
              </div>
            </div>
          </div>
          <div className="center">
            <button className="btn big" onClick={close}>
              {t('onboard.cta')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
