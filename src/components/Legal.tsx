// Política de privacidade enxuta e honesta: cobre o essencial de LGPD/GDPR para um
// jogo grátis sem cadastro (localStorage + métricas anônimas). Sem cookies de
// rastreamento de terceiros, então não há banner de consentimento bloqueante.
import { getLang } from '../state/i18n';

const STR = {
  title: { pt: 'Privacidade', en: 'Privacy', es: 'Privacidad' },
  close: { pt: 'fechar', en: 'close', es: 'cerrar' },
  intro: {
    pt: 'Road to Major é um jogo gratuito. Para funcionar e melhorar, coletamos o mínimo:',
    en: 'Road to Major is a free game. To run and improve, we collect the bare minimum:',
    es: 'Road to Major es un juego gratuito. Para funcionar y mejorar, recogemos lo mínimo:',
  },
  local: {
    pt: 'Armazenamento local: seu progresso de carreira e preferências ficam salvos no seu próprio navegador (localStorage). Não saem do seu dispositivo.',
    en: 'Local storage: your career progress and preferences are saved in your own browser (localStorage). They never leave your device.',
    es: 'Almacenamiento local: tu progreso de carrera y preferencias se guardan en tu propio navegador (localStorage). No salen de tu dispositivo.',
  },
  metrics: {
    pt: 'Métricas anônimas: registramos visitas e erros para corrigir bugs e entender o uso. Pode incluir país aproximado (derivado do IP, que não armazenamos), navegador/dispositivo e um identificador de sessão temporário.',
    en: 'Anonymous metrics: we log visits and errors to fix bugs and understand usage. This may include approximate country (derived from IP, which we do not store), browser/device and a temporary session id.',
    es: 'Métricas anónimas: registramos visitas y errores para corregir bugs y entender el uso. Puede incluir país aproximado (derivado de la IP, que no almacenamos), navegador/dispositivo y un identificador de sesión temporal.',
  },
  no: {
    pt: 'Não vendemos seus dados, não usamos cookies de rastreamento de terceiros e não pedimos cadastro. Você pode apagar tudo limpando os dados do site no navegador.',
    en: 'We do not sell your data, use third-party tracking cookies, or require sign-up. You can erase everything by clearing the site data in your browser.',
    es: 'No vendemos tus datos, no usamos cookies de rastreo de terceros ni pedimos registro. Puedes borrar todo limpiando los datos del sitio en tu navegador.',
  },
  contact: {
    pt: 'Dúvidas: roadtomajor.com.br',
    en: 'Questions: roadtomajor.com.br',
    es: 'Dudas: roadtomajor.com.br',
  },
} as const;

const tr = (k: keyof typeof STR): string => {
  const l = getLang();
  return STR[k][l] ?? STR[k].pt;
};

export function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fade-in" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          🔒 {tr('title')}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label={tr('close')}>
            ✕
          </button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>{tr('intro')}</p>
          <ul className="muted small" style={{ lineHeight: 1.6, paddingLeft: 18 }}>
            <li>{tr('local')}</li>
            <li>{tr('metrics')}</li>
          </ul>
          <p className="muted small">{tr('no')}</p>
          <p className="muted small" style={{ marginBottom: 0 }}>{tr('contact')}</p>
        </div>
      </div>
    </div>
  );
}
