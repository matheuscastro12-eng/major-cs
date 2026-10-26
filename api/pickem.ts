// PICK'EM do Major Singapore (server/pickem.ts + src/engine/majorSingapore/pickem.ts).
//   GET  ?action=state           → Stages (times, trava, resultado) + relógio do servidor
//   GET  ?action=board           → placar público (sem e-mail)
//   POST {token, action:'me'}    → meus palpites
//   POST {token, action:'save', stage, pick} → salva; 423 depois da trava
//   POST {password, action:'admin:*'} → admin (abrir Stage, resultado manual ou
//        bo3.gg, ganhadores em 'review' e ok manual do prêmio)
// Qualquer conta participa (grátis ou paga). A trava é do relógio do servidor.
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '../server/admin-auth.js';
import { respondMissingSecret, verifyAccountToken } from '../server/auth.js';
import { parseJsonBody } from '../server/http.js';
import { internalError } from '../server/internalError.js';
import { normalizeNick } from '../server/nick.js';
import {
  adminDecidePrize, adminProposeResult, adminProposeWinners, adminSetResult, adminUpsertStage, board, ensurePickemSchema,
  isStageId, listPrizes, listStages, myPicks, publicBoard, savePick, type SqlTag,
} from '../server/pickem.js';
import { fetchBo3Matches, playoffsFromBo3, swissFromBo3 } from '../server/pickem-bo3.js';
import { clientIp, rateLimitHit, respondLimited, type RateSql } from '../server/rate-limit.js';
import type { PickemStageId, StageResult, SwissResult } from '../src/engine/majorSingapore/pickem.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void }
interface Req { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | string[] | undefined> }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const NEXT: Partial<Record<PickemStageId, PickemStageId>> = { s1: 's2', s2: 's3', s3: 'playoffs' };

export default async function handler(req: Req, res: Res) {
  try { await handle(req, res); } catch (e) { internalError(res, 'pickem', e); }
}

async function handle(req: Req, res: Res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const neonSql = neon(dbUrl);
  const sql = neonSql as unknown as SqlTag;
  const rsql = neonSql as unknown as RateSql;
  await ensurePickemSchema(sql);

  if (req.method === 'GET') {
    const raw = req.query?.action;
    const action = String((Array.isArray(raw) ? raw[0] : raw) ?? 'state');
    if (action === 'board') {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      const ranked = await board(sql);
      res.status(200).json({ ok: true, total: ranked.length, board: publicBoard(ranked) });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const st = await listStages(sql);
    // resultado proposto (não confirmado) não sai no público
    res.status(200).json({ ok: true, serverNow: st.serverNow, stages: st.stages.map(({ proposedResult: _p, ...s }) => s) });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  const body = parseJsonBody(req.body) ?? {};
  const action = String(body.action ?? '');

  if (action.startsWith('admin:')) {
    if (!(await requireAdmin(rsql, body, req, res))) return;
    const stage = body.stage;
    const needStage = () => { if (!isStageId(stage)) { res.status(400).json({ ok: false, error: 'stage inválido' }); return false; } return true; };
    switch (action) {
      case 'admin:state': {
        const st = await listStages(sql);
        res.status(200).json({ ok: true, ...st, prizes: await listPrizes(sql) });
        return;
      }
      case 'admin:upsertStage': {
        if (!needStage()) return;
        const teams = Array.isArray(body.teams) ? body.teams.map(String).slice(0, 32) : [];
        await adminUpsertStage(sql, stage as PickemStageId, teams, String(body.locksAt ?? ''));
        res.status(200).json({ ok: true });
        return;
      }
      case 'admin:setResult': // fallback manual
      case 'admin:confirmResult': { // confirma o proposto pelo bo3.gg
        if (!needStage()) return;
        const st = (await listStages(sql)).stages.find((s) => s.stage === stage);
        const result = (action === 'admin:confirmResult' ? st?.proposedResult : body.result) as StageResult | null;
        if (!st || !result) { res.status(400).json({ ok: false, error: 'sem resultado' }); return; }
        await adminSetResult(sql, st.stage, result, action === 'admin:confirmResult' ? 'bo3' : 'manual');
        // abre o próximo Stage com os que avançaram (convidados + classificados)
        const next = NEXT[st.stage];
        const nx = next && (await listStages(sql)).stages.find((s) => s.stage === next);
        if (nx && nx.locksAt && 'advanced' in result) {
          const teams = [...new Set([...nx.teams, ...(result as SwissResult).advanced])];
          await adminUpsertStage(sql, nx.stage, teams, nx.locksAt);
        }
        res.status(200).json({ ok: true });
        return;
      }
      case 'admin:importBo3': {
        if (!needStage()) return;
        const slug = String(body.slug ?? '');
        const matches = await fetchBo3Matches(slug);
        const result = stage === 'playoffs' ? playoffsFromBo3(matches) : swissFromBo3(matches);
        await adminProposeResult(sql, stage as PickemStageId, result);
        res.status(200).json({ ok: true, proposed: result, matches: matches.length });
        return;
      }
      case 'admin:board': {
        res.status(200).json({ ok: true, board: (await board(sql)).slice(0, 200) });
        return;
      }
      case 'admin:proposeWinners': {
        res.status(200).json({ ok: true, winners: await adminProposeWinners(sql) });
        return;
      }
      case 'admin:decidePrize': {
        const d = String(body.decision ?? '');
        if (d !== 'approved' && d !== 'rejected' && d !== 'delivered') { res.status(400).json({ ok: false, error: 'decisão inválida' }); return; }
        const ok = await adminDecidePrize(sql, Number(body.rank), d, String(body.by ?? 'admin').slice(0, 40), String(body.note ?? '').slice(0, 200));
        res.status(ok ? 200 : 409).json({ ok });
        return;
      }
      default:
        res.status(400).json({ ok: false, error: 'ação desconhecida' });
        return;
    }
  }

  if (respondMissingSecret(res)) return;
  const email = verifyAccountToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta (grátis) pra fazer seus palpites.' }); return; }

  if (action === 'me') {
    res.status(200).json({ ok: true, picks: await myPicks(sql, email) });
    return;
  }
  if (action === 'save') {
    if (respondLimited(res, await rateLimitHit(rsql, [
      { key: `pickem:ip:${clientIp(req.headers)}`, limit: 120, windowSec: 3600 },
      { key: `pickem:email:${email}`, limit: 60, windowSec: 3600 },
    ]))) return;
    if (!isStageId(body.stage)) { res.status(400).json({ error: 'stage inválido' }); return; }
    const acc = await neonSql`SELECT nick FROM rtm_accounts WHERE email=${email}`;
    if (!acc.length) { res.status(401).json({ error: 'Conta não encontrada.' }); return; }
    const r = await savePick(sql, email, normalizeNick(acc[0].nick) || 'manager', body.stage, body.pick);
    if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
    res.status(200).json({ ok: true, savedAt: r.savedAt });
    return;
  }
  res.status(400).json({ error: 'ação desconhecida' });
}
