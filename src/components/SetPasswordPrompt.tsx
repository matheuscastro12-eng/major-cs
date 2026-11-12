// [paywall v2] Depois do Pix em 1 passo (cadastro só com e-mail): a conta já é
// paga (o webhook confirmou), mas ainda não tem senha. Aqui o jogador cria o
// nick e a senha pra entrar em outros aparelhos.
//   - mesmo navegador do pagamento: chave de configuração local → setPassword;
//   - outro aparelho / cache limpo: reset por código no e-mail (o mesmo fluxo
//     do "Esqueci minha senha", rtm_password_resets), que prova a posse do e-mail.
// "Agora não" fecha só nesta sessão: a conta segue logada por token neste aparelho.
import { useState, type CSSProperties } from 'react';
import { Button, Modal } from './ds';
import { ct } from '../state/career-i18n';
import { AccountError, confirmPasswordReset, hasSetupKey, refreshAccount, requestPasswordReset, setInitialPassword, type Account } from '../state/account';
import { track } from '../state/track';

const DISMISS_KEY = 'rtm-setpw-later';

export function SetPasswordPrompt({ account }: { account: Account }) {
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  const [viaEmail, setViaEmail] = useState(() => !hasSetupKey(account.email));
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [nick, setNick] = useState(account.nick || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (hidden) return null;

  const later = () => { try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* sem storage */ } setHidden(true); };
  const input: CSSProperties = { width: '100%' };
  const lbl: CSSProperties = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--em-muted)', display: 'block', marginBottom: '6px' };
  const pwOk = pw.length >= 6 && pw === pw2;

  const save = async () => {
    if (busy) return;
    if (pw.length < 6) { setErr(ct('A senha precisa de pelo menos 6 caracteres.')); return; }
    if (pw !== pw2) { setErr(ct('As senhas não são iguais — confira os dois campos.')); return; }
    setBusy(true); setErr('');
    try {
      if (viaEmail) {
        await confirmPasswordReset(account.email, code.trim(), pw);
        await refreshAccount();
      } else {
        await setInitialPassword(pw, nick.trim());
      }
      track('password_set', { via: viaEmail ? 'email' : 'setup' });
    } catch (e) {
      if (e instanceof AccountError && e.data.reset) setViaEmail(true);
      setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.'));
    }
    setBusy(false);
  };
  const sendCode = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await requestPasswordReset(account.email); setCodeSent(true); } catch (e) { setErr(e instanceof Error ? e.message : ct('Erro. Tente de novo.')); }
    setBusy(false);
  };

  return (
    <Modal open onClose={later} title={ct('Pagamento confirmado! Falta criar sua senha')} size="sm">
      <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--em-muted)' }}>
        {ct('Sua vitalícia já está ativa em')} <b>{account.email}</b>. {ct('Crie uma senha pra entrar em outros aparelhos.')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!viaEmail && <div><label style={lbl}>{ct('Nick de manager')}</label><input style={input} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="br4z1l_zera" maxLength={24} /></div>}
        {viaEmail && !codeSent && (
          <Button variant="gold" disabled={busy} style={{ width: '100%' }} onClick={() => void sendCode()}>
            {busy ? ct('Aguarde…') : ct('Enviar código pro meu e-mail')}
          </Button>
        )}
        {viaEmail && codeSent && <div><label style={lbl}>{ct('Código (6 dígitos, chegou no e-mail)')}</label><input style={input} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" /></div>}
        {(!viaEmail || codeSent) && (
          <>
            <div><label style={lbl}>{ct('Senha')}</label><input style={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={ct('mínimo 6 caracteres')} type="password" autoComplete="new-password" /></div>
            <div><label style={lbl}>{ct('Confirme a senha')}</label><input style={input} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={ct('digite a senha de novo')} type="password" autoComplete="new-password" onKeyDown={(e) => e.key === 'Enter' && void save()} /></div>
            <Button variant="gold" disabled={busy || !pwOk || (viaEmail && !/^\d{6}$/.test(code))} style={{ width: '100%' }} onClick={() => void save()}>
              {busy ? ct('Aguarde…') : ct('Salvar e jogar')}
            </Button>
          </>
        )}
      </div>
      {err && <p style={{ color: '#e2574c', fontSize: '0.8rem', margin: '12px 0 0' }}>{err}</p>}
      <button type="button" onClick={later} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--em-muted)', cursor: 'pointer', fontSize: '0.76rem', textDecoration: 'underline', fontFamily: 'inherit' }}>
        {ct('Agora não (continuo logado neste aparelho)')}
      </button>
    </Modal>
  );
}
