// Save na nuvem (conta vitalícia): sincroniza o save da carreira entre aparelhos.
// Modelo last-write-wins por timestamp do cliente. Só conta PAGA persiste.
// Ações (POST body.action): pull | push.
import { neon } from '@neondatabase/serverless';
import { respondMissingSecret, verifyAccountToken } from '../server/auth.js';
import { CloudSavePayloadError, decodeCloudSavePayload } from '../server/cloud-save-codec.js';
import { CLOUD_MAX_FUTURE_MS, clampUpdatedAt, cloudSlotAllowed } from '../server/cloud-save-policy.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

const rlBuckets = new Map<string, { count: number; resetAt: number }>();
let schemaReady = false;

function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (rlBuckets.size > 5000) rlBuckets.clear();
  const current = rlBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rlBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function clientIp(headers?: Record<string, string | string[] | undefined>): string {
  const raw = headers?.['x-forwarded-for'] ?? headers?.['x-real-ip'] ?? '';
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  return value.split(',')[0].trim() || 'unknown';
}

// token de conta: server/auth.ts (falha fechada sem APP_SECRET).
const verifyToken = verifyAccountToken;

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  if (respondMissingSecret(res)) return; // falha fechada (SEGU-10)
  const ip = clientIp(req.headers);
  if (rateLimited(`ip:${ip}`, 180)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  let body: Record<string, unknown>;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  const action = String(body.action ?? '');
  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra usar o save na nuvem.' }); return; }
  if (rateLimited(`account:${email}:${action}`, action === 'push' ? 30 : 60)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas sincronizações' });
    return;
  }

  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl);
  if (!schemaReady) {
    await sql`CREATE TABLE IF NOT EXISTS rtm_saves (email TEXT, slot TEXT, data TEXT, updated_at BIGINT DEFAULT 0, PRIMARY KEY (email, slot))`;
    schemaReady = true;
  }

  const acc = await sql`SELECT paid FROM rtm_accounts WHERE email=${email}`;
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  if (!acc[0].paid) { res.status(403).json({ error: 'unpaid', message: 'Este recurso faz parte da conta com save na nuvem.' }); return; }

  // [O0-29] só slots conhecidos (career, career-2..5, rtp, online, ultimate).
  const slot = String(body.slot ?? 'career').slice(0, 40);
  if (!cloudSlotAllowed(slot)) { res.status(400).json({ error: 'slot inválido' }); return; }

  if (action === 'pull') {
    const since = Number(body.since) || 0;
    const r = await sql`SELECT data, updated_at FROM rtm_saves WHERE email=${email} AND slot=${slot}`;
    if (!r.length) { res.status(200).json({ data: null, updatedAt: 0 }); return; }
    const data = String(r[0].data ?? '');
    const updatedAt = Number(r[0].updated_at ?? 0);
    // pull condicional: se o cliente já tem esta versão (ou mais nova) e NÃO é um
    // tombstone (''), devolve só o timestamp — sem o blob de até 2MB. Corta o Fast
    // Origin Transfer do login/sync quando o aparelho já está sincronizado.
    // Tombstone SEMPRE vai inteiro (é vazio) pra a exclusão continuar propagando.
    if (since > 0 && data !== '' && updatedAt <= since) { res.status(200).json({ unchanged: true, updatedAt }); return; }
    res.status(200).json({ data, updatedAt });
    return;
  }

  if (action === 'push') {
    let data: string;
    try {
      data = decodeCloudSavePayload(String(body.data ?? ''), body.encoding, body.originalBytes);
    } catch (error) {
      const message = error instanceof CloudSavePayloadError ? error.message : 'save inválido';
      res.status(413).json({ error: message });
      return;
    }
    // data vazio = tombstone (lápide) de exclusão. NÃO é erro: grava '' com o
    // timestamp pra que o last-write-wins marque o slot como apagado e ele não
    // ressuscite no próximo sync. Antes isso retornava 400 e o save voltava.
    // [O0-29] timestamp do cliente limitado a agora+5min: relógio adiantado não
    // tranca mais o slot pra sempre. Linha já envenenada (além da tolerância)
    // aceita ser sobrescrita — é assim que ela se cura.
    const now = Date.now();
    const updatedAt = clampUpdatedAt(body.updatedAt, now);
    const poisonedAfter = now + CLOUD_MAX_FUTURE_MS;
    const written = await sql`
      INSERT INTO rtm_saves (email, slot, data, updated_at) VALUES (${email}, ${slot}, ${data}, ${updatedAt})
      ON CONFLICT (email, slot) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at >= rtm_saves.updated_at OR rtm_saves.updated_at > ${poisonedAfter}
      RETURNING updated_at`;
    if (!written.length) {
      // o servidor tem versão mais nova: antes respondia ok:true e o save sumia em
      // silêncio. Agora 409 com o timestamp atual, pro cliente reconciliar (pull).
      const cur = await sql`SELECT updated_at FROM rtm_saves WHERE email=${email} AND slot=${slot}`;
      res.status(409).json({ error: 'conflict', conflict: true, updatedAt: Number(cur[0]?.updated_at ?? 0) });
      return;
    }
    res.status(200).json({ ok: true, updatedAt, deleted: !data });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
