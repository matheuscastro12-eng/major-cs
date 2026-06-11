// CRM de acesso ao beta do modo carreira: o dono vê os pedidos (nicks) e
// aceita ou recusa. Protegido pela senha de admin (#carreira-acessos).
import { useCallback, useEffect, useState } from 'react';
import { adminPassword } from './AdminGate';
import { decideAccess, listRequests, type BetaRequest } from '../state/beta';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado',
};

export function BetaAccessCRM({ onExit }: { onExit: () => void }) {
  const [reqs, setReqs] = useState<BetaRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    const r = await listRequests(adminPassword());
    if (r) setReqs(r);
    else setErr('Não foi possível carregar (login admin necessário, só funciona no site publicado).');
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (nick: string, decision: 'approve' | 'reject') => {
    setBusy(true);
    await decideAccess(adminPassword(), nick, decision);
    setBusy(false);
    load();
  };

  const pending = (reqs ?? []).filter((r) => r.status === 'pending');
  const decided = (reqs ?? []).filter((r) => r.status !== 'pending');

  const Row = ({ r }: { r: BetaRequest }) => (
    <div className={`access-row ${r.status}`}>
      <span className="access-nick">{r.nick}</span>
      <span className={`access-tag ${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
      <span className="spacer" />
      {r.status !== 'approved' && (
        <button className="btn gold small" disabled={busy} onClick={() => decide(r.nick, 'approve')}>✔ Aprovar</button>
      )}
      {r.status !== 'rejected' && (
        <button className="btn danger small" disabled={busy} onClick={() => decide(r.nick, 'reject')}>✕ Recusar</button>
      )}
    </div>
  );

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 720, margin: '24px auto' }}>
        <div className="panel-head">
          Acessos ao modo carreira (beta)
          <span className="spacer" />
          <button className="btn ghost" onClick={load} disabled={busy}>↻ Atualizar</button>
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          {err && <div className="neg small" style={{ marginBottom: 10 }}>{err}</div>}
          {reqs === null && !err && <div className="muted">Carregando…</div>}

          <div className="muted small section-label" style={{ marginTop: 0 }}>
            Pendentes ({pending.length})
          </div>
          {pending.length === 0 ? (
            <div className="muted small">Nenhum pedido pendente.</div>
          ) : (
            <div className="access-list">{pending.map((r) => <Row key={r.nick} r={r} />)}</div>
          )}

          {decided.length > 0 && (
            <>
              <div className="muted small section-label">Já decididos ({decided.length})</div>
              <div className="access-list">{decided.map((r) => <Row key={r.nick} r={r} />)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
