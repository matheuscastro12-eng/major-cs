// Envio de e-mail transacional (reset de senha, aviso de rival). Extraído de
// api/account.ts pra ser reutilizado sem duplicar a escolha do provedor.
//
// GRÁTIS, na ordem: Resend (RESEND_API_KEY — 3k/mês no free tier) ou Gmail SMTP
// (GMAIL_USER + GMAIL_APP_PASSWORD — senha de app, sem domínio próprio). Nenhum
// configurado: `mailConfigured()` é false e `sendMail` devolve false sem lançar.
export interface MailMessage { to: string; subject: string; text: string; html?: string }

const env = (k: string) => (process.env[k] ?? '').trim();

export function mailConfigured(): boolean {
  return !!env('RESEND_API_KEY') || !!(env('GMAIL_USER') && env('GMAIL_APP_PASSWORD'));
}

/** Envia 1 e-mail. Nunca lança: devolve true/false (quem chama decide o que fazer). */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const resendKey = env('RESEND_API_KEY');
  const gmailUser = env('GMAIL_USER');
  const gmailPass = env('GMAIL_APP_PASSWORD');
  if (resendKey) {
    const from = env('RESET_EMAIL_FROM') || 'MAJOR//CS <nao-responda@roadtomajor.com.br>';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) }),
    }).catch(() => null);
    return !!r && r.ok;
  }
  if (gmailUser && gmailPass) {
    // Gmail SMTP (import dinâmico: só paga o peso quando este caminho roda)
    try {
      const { createTransport } = await import('nodemailer');
      const transport = createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
      await transport.sendMail({ from: `MAJOR//CS <${gmailUser}>`, to: msg.to, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) });
      return true;
    } catch { return false; }
  }
  return false;
}
