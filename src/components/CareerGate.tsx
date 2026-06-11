// Porta de entrada do modo carreira (beta fechado controlado pelo dono):
// o usuário pede acesso com o nick; o dono aprova/recusa no CRM de acessos.
// Quem tem código de liberação (rtm-beta-v1) entra direto.
import { useEffect, useRef, useState } from 'react';
import { useLang } from '../state/i18n';
import {
  type BetaStatus, checkAccess, hasCodeAccess, requestAccess, saveCareerNick, savedCareerNick,
} from '../state/beta';

type Lang = 'pt' | 'en' | 'es';
const L: Record<Lang, Record<string, string>> = {
  pt: {
    title: 'Modo Carreira · Beta fechado', intro: 'O acesso é liberado manualmente. Coloque seu nick para pedir acesso; assim que eu aprovar, o modo carreira abre aqui.',
    nick: 'Seu nick', ph: 'ex: fallenzera', send: 'Pedir acesso', sending: 'Enviando…',
    pendingT: 'Pedido enviado!', pendingB: 'Seu acesso está em análise. Deixe esta página aberta: ela libera sozinha quando eu aprovar.',
    rejectedT: 'Acesso não liberado', rejectedB: 'Seu pedido não foi aprovado por enquanto. Apoie o projeto e fale comigo no Twitter para liberar.',
    again: 'Pedir de novo com outro nick', back: '← Voltar', checking: 'Verificando acesso…', needNick: 'Coloque um nick.',
  },
  en: {
    title: 'Career Mode · Closed beta', intro: 'Access is granted manually. Enter your nick to request access; once I approve it, Career Mode opens here.',
    nick: 'Your nick', ph: 'ex: fallenzera', send: 'Request access', sending: 'Sending…',
    pendingT: 'Request sent!', pendingB: 'Your access is under review. Keep this page open: it unlocks by itself once I approve.',
    rejectedT: 'Access not granted', rejectedB: 'Your request was not approved for now. Support the project and message me on Twitter to get access.',
    again: 'Request again with another nick', back: '← Back', checking: 'Checking access…', needNick: 'Enter a nick.',
  },
  es: {
    title: 'Modo Carrera · Beta cerrada', intro: 'El acceso se concede manualmente. Pon tu nick para pedir acceso; en cuanto lo apruebe, el Modo Carrera se abre aquí.',
    nick: 'Tu nick', ph: 'ej: fallenzera', send: 'Pedir acceso', sending: 'Enviando…',
    pendingT: '¡Pedido enviado!', pendingB: 'Tu acceso está en revisión. Deja esta página abierta: se desbloquea sola cuando lo apruebe.',
    rejectedT: 'Acceso no concedido', rejectedB: 'Tu pedido no fue aprobado por ahora. Apoya el proyecto y escríbeme en Twitter para conseguir acceso.',
    again: 'Pedir de nuevo con otro nick', back: '← Volver', checking: 'Verificando acceso…', needNick: 'Pon un nick.',
  },
};

export function CareerGate({ children, onExit }: { children: React.ReactNode; onExit: () => void }) {
  const { lang } = useLang();
  const t = L[(['pt', 'en', 'es'].includes(lang) ? lang : 'pt') as Lang];
  const codeOk = hasCodeAccess();
  const [nick, setNick] = useState(savedCareerNick());
  const [status, setStatus] = useState<BetaStatus | 'loading'>(codeOk ? 'approved' : 'loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pollRef = useRef<number | undefined>(undefined);

  // checa o status inicial e fica de olho enquanto pendente
  useEffect(() => {
    if (codeOk) return;
    let alive = true;
    const run = async () => {
      const n = savedCareerNick();
      if (!n) { setStatus('none'); return; }
      const s = await checkAccess(n);
      if (alive) setStatus(s);
    };
    run();
    pollRef.current = window.setInterval(run, 8000);
    return () => { alive = false; window.clearInterval(pollRef.current); };
  }, [codeOk]);

  if (status === 'approved' || codeOk) return <>{children}</>;

  const submit = async () => {
    if (busy) return;
    const n = nick.trim();
    if (!n) { setErr(t.needNick); return; }
    setBusy(true);
    setErr('');
    saveCareerNick(n);
    try {
      const s = await requestAccess(n);
      setStatus(s);
    } catch {
      setErr('Erro de conexão. Tente de novo.');
    }
    setBusy(false);
  };

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 520, margin: '40px auto' }}>
        <div className="panel-head">
          {t.title}
          <span className="spacer" />
          <button className="btn" onClick={onExit}>{t.back}</button>
        </div>
        <div className="panel-body">
          {status === 'loading' && <div className="muted">{t.checking}</div>}

          {(status === 'none') && (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>{t.intro}</p>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>{t.nick}</label>
                <input value={nick} maxLength={24} placeholder={t.ph}
                  onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
              </div>
              <button className="btn gold big" style={{ width: '100%' }} onClick={submit} disabled={busy}>
                {busy ? t.sending : t.send}
              </button>
              {err && <div className="neg small" style={{ marginTop: 8 }}>{err}</div>}
            </>
          )}

          {status === 'pending' && (
            <div className="center">
              <div className="trophy" style={{ fontSize: 40 }}>⏳</div>
              <h2>{t.pendingT}</h2>
              <p className="muted">{t.pendingB}</p>
            </div>
          )}

          {status === 'rejected' && (
            <div className="center">
              <div className="trophy" style={{ fontSize: 40 }}>🔒</div>
              <h2>{t.rejectedT}</h2>
              <p className="muted">{t.rejectedB}</p>
              <button className="btn ghost" onClick={() => { saveCareerNick(''); setNick(''); setStatus('none'); }}>{t.again}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
