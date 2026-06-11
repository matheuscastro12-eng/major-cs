// Valida o código de acesso ao beta fechado do modo carreira.
// O dono confirma a doação (PixGG/Ko-fi), envia o código ao apoiador, e ele
// libera o modo carreira aqui. Código fica no env BETA_CODE (fallback abaixo).
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (k: string, v: string) => void;
  },
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const expected = (clean(process.env.BETA_CODE) || 'MAJOR2026').toUpperCase();
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { code?: string };
  const code = String(body.code ?? '').trim().toUpperCase();
  res.status(200).json({ ok: code.length > 0 && code === expected });
}
