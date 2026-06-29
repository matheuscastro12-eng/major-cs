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
  'major-stage': 'Você se classificou pro MAJOR! Esse momento é histórico — garante ele na nuvem.',
  'world-1': 'TOPO DO MUNDO! Você é o #1 do VRS. Apoiadores eternizam essa marca no ladder vitalício.',
  'milestone': 'Sua carreira está ficando séria. Garanta que ela não se perca.',
  'save-risk': 'Seu progresso fica só neste navegador. Uma conta guarda tudo na nuvem.',
  'promotion': 'Subiu de divisão! Garanta essa evolução com save na nuvem.',
  'market': 'Montando seu elenco? Save na nuvem pra não perder o time dos sonhos.',
  'ranked-free': 'Você está jogando ranqueada, mas no grátis o MMR não conta no ladder. Ative pra valer.',
  'online-done': 'Boa partida! No grátis o resultado some ao fechar a aba — ative pra contar no ladder mundial.',
  'draft-win': 'Mandou bem no Major! Crie sua conta e leve isso pra uma carreira de verdade.',
  'founder': 'Os 500 primeiros viram FUNDADORES (selo #001–#500). Número baixo é troféu — garanta o seu.',
  'return': 'Que bom te ver de volta! Apoiadores nunca perdem progresso — a conta sincroniza tudo.',
  'custom-builder': 'Modo Custom é exclusivo de Vitalícia: crie sua org E os 5 jogadores manualmente (nick, role, atributos) com coach próprio.',
  'academy-rename': 'Editar o nick dos prospects é exclusivo de Vitalícia. Vire apoiador pra customizar o pipeline da sua academia.',
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
      const force = Boolean((e as CustomEvent).detail?.force); // clique explícito do usuário fura o cooldown
      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      if (!force && Date.now() - last < COOLDOWN_MS) return; // respeita cooldown só nos disparos automáticos
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
          <li><b>{ct('Selo de Fundador #001–#500')}</b> {ct('· logo própria do clube + número baixo é troféu (500 primeiros)')}</li>
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
