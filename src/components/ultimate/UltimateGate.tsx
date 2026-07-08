// Portão de entrada do Ultimate para quem está DESLOGADO.
// O Ultimate roda de localStorage, então o jogador pode entrar como convidado e
// jogar na hora — mas o progresso fica só neste navegador e pode ser perdido.
// Este modal deixa isso explícito e faz o upsell da conta vitalícia (save na
// nuvem + jogar no PC e no celular com o mesmo squad).
//
// NÃO confundir com Road to Pro / saves extras de carreira: esses continuam
// EXCLUSIVOS de conta vitalícia. O modo convidado vale só para o Ultimate.
import { Button, Modal } from '../ds';
import { BrandMark } from '../brand';
import { ct } from '../../state/career-i18n';

export function UltimateGate({
  onGuest,
  onSignup,
  onLogin,
  onClose,
}: {
  onGuest: () => void;
  onSignup: () => void;
  onLogin: () => void;
  onClose: () => void;
}) {
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandMark size={22} />
      <span>Ultimate Squad</span>
    </span>
  );
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <p style={{ margin: '0 0 16px', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--em-text)' }}>
        {ct('Você pode entrar e jogar agora mesmo, sem conta. Mas antes, entenda o combinado:')}
      </p>

      {/* Vantagens da conta vitalícia — o caminho recomendado */}
      <div style={{ background: 'rgba(232,193,112,0.08)', border: '1px solid rgba(232,193,112,0.4)', borderRadius: 8, padding: '14px 16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--em-gold)' }}>R$20</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--em-muted)' }}>{ct('pagamento único · acesso vitalício, sem mensalidade')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem', color: 'var(--em-text)', fontWeight: 600 }}>
          <span>✔ {ct('Progresso salvo na nuvem — nunca perde o squad')}</span>
          <span>✔ {ct('Jogue no PC e no celular com a mesma conta')}</span>
          <span>✔ {ct('Ranqueada no ladder real e Major da Semana')}</span>
        </div>
      </div>

      <Button variant="gold" style={{ width: '100%' }} onClick={onSignup}>
        {ct('Criar conta vitalícia')}
      </Button>
      <p style={{ fontSize: '0.8rem', color: 'var(--em-muted)', textAlign: 'center', margin: '12px 0' }}>
        {ct('Já tem conta? ')}
        <button type="button" onClick={onLogin} style={{ background: 'none', border: 'none', color: 'var(--em-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
          {ct('Entrar')}
        </button>
      </p>

      {/* Aviso honesto do modo convidado */}
      <div style={{ borderTop: '1px solid var(--em-border)', paddingTop: '14px' }}>
        <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--em-muted)', lineHeight: 1.5 }}>
          ⚠️ {ct('Como convidado, o progresso fica só neste navegador. Se limpar o cache ou trocar de aparelho, você perde tudo — e não dá pra comprar coins nem entrar no ladder persistente.')}
        </p>
        <Button variant="ghost" style={{ width: '100%' }} onClick={onGuest}>
          {ct('Jogar como convidado (posso perder o progresso)')}
        </Button>
      </div>
    </Modal>
  );
}
