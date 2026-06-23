import { useEffect, useState } from 'react';
import { useAccount } from '../state/account';
import { ct } from '../state/career-i18n';

// Card de ativação (upsell) pra contas GRÁTIS. Abre em momentos estratégicos do
// jogo (fim de split, título conquistado, etc.) via evento global, o usuário pode
// fechar, mas tem um CTA pra criar a conta vitalícia. Respeita um cooldown pra não
// encher o saco. Contas pagas nunca veem.
//
// Disparo de qualquer lugar:  window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'split-win' } }))

const COOLDOWN_MS = 1000 * 60 * 45; // no máximo 1 vez a cada 45 min
const LAST_KEY = 'rtm_upsell_last';

// mensagem do topo por gatilho (contexto), pra parecer natural e não genérico
const HOOKS: Record<string, string> = {
  'split-win': 'Você acabou de conquistar um título. Que tal guardar essa campanha pra sempre?',
  'major': 'Campanha histórica! Não perca esse progresso.',
  'milestone': 'Sua carreira está ficando séria. Garanta que ela não se perca.',
  'save-risk': 'Seu progresso fica só neste navegador. Uma conta guarda tudo na nuvem.',
  default: 'Leve sua carreira pro próximo nível.',
};

export function UpsellCard({ onUpgrade }: { onUpgrade: () => void }) {
  const { account } = useAccount();
  const [open, setOpen] = useState(false);
  const [hook, setHook] = useState(HOOKS.default);

  useEffect(() => {
    const onEvt = (e: Event) => {
      if (account?.paid) return; // pagos nunca veem
      const trigger = (e as CustomEvent).detail?.trigger as string | undefined;
      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      if (Date.now() - last < COOLDOWN_MS) return; // respeita cooldown
      setHook(HOOKS[trigger ?? 'default'] ?? HOOKS.default);
      setOpen(true);
      localStorage.setItem(LAST_KEY, String(Date.now()));
    };
    window.addEventListener('rtm:upsell', onEvt);
    return () => window.removeEventListener('rtm:upsell', onEvt);
  }, [account?.paid]);

  if (!open || account?.paid) return null;

  const close = () => setOpen(false);

  return (
    <div className="upsell-overlay" role="dialog" aria-modal="true" onClick={close}>
      <div className="upsell-card" onClick={(e) => e.stopPropagation()}>
        <button className="upsell-x" onClick={close} aria-label={ct('fechar')}>✕</button>
        <div className="upsell-kicker">{ct('Conta vitalícia')}</div>
        <h3 className="upsell-title">{ct(hook)}</h3>
        <ul className="upsell-list">
          <li><b>{ct('Save na nuvem')}</b> {ct('· jogue em qualquer aparelho e nunca perca a carreira')}</li>
          <li><b>{ct('Até 5 carreiras')}</b> {ct('· toque várias orgs ao mesmo tempo')}</li>
          <li><b>{ct('Ranqueada com pontuação')}</b> {ct('· suba no ladder e dispute o topo')}</li>
          <li><b>{ct('Perfil e selo de apoiador')}</b> {ct('· identidade no jogo todo')}</li>
        </ul>
        <div className="upsell-actions">
          <button className="btn gold big" onClick={() => { close(); onUpgrade(); }}>
            {ct('Criar conta vitalícia')} · R$20
          </button>
          <button className="upsell-later" onClick={close}>{ct('Agora não')}</button>
        </div>
        <div className="upsell-foot">{ct('Pagamento único. Sem mensalidade. Apoia o desenvolvimento do jogo.')}</div>
      </div>
    </div>
  );
}
