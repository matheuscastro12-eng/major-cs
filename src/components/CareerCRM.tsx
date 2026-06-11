// CRM do modo carreira: editar os times e OVRs dos jogadores REAIS (bo3.gg).
// Acesso oculto via #carreira-crm. As edições ficam em localStorage e são
// aplicadas em runtime sobre CS2_REAL_2026 (sem reimportar a API).
import { useMemo, useState } from 'react';
import type { Role } from '../types';
import { CS2_REAL_2026 } from '../data/teams';
import { applyBo3Edits, loadBo3Edits, saveBo3Edits, type Bo3Edits } from '../state/bo3-edits';
import { playerOvr } from '../engine/ratings';
import { logoForTeam } from '../data/media';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';

const ROLES: Role[] = ['AWP', 'IGL', 'Entry', 'Rifler', 'Support', 'Lurker'];

export function CareerCRM({ onExit }: { onExit: () => void }) {
  const [edits, setEdits] = useState<Bo3Edits>(() => loadBo3Edits());
  const [filter, setFilter] = useState('');
  const [selId, setSelId] = useState<string>(CS2_REAL_2026[0]?.id ?? '');

  // times com as edições já aplicadas (pra mostrar o estado atual)
  const teams = useMemo(() => applyBo3Edits(CS2_REAL_2026, edits), [edits]);
  const visible = teams.filter((t) => !filter || t.team.toLowerCase().includes(filter.toLowerCase()) || t.tag.toLowerCase().includes(filter.toLowerCase()));
  const sel = teams.find((t) => t.id === selId) ?? teams[0];

  const persist = (next: Bo3Edits) => { setEdits(next); saveBo3Edits(next); };

  const setPlayer = (pid: string, patch: { ovr?: number; role?: Role }) => {
    const cur = edits.players[pid] ?? {};
    persist({ ...edits, players: { ...edits.players, [pid]: { ...cur, ...patch } } });
  };
  const setTeam = (tid: string, patch: { teamwork?: number; tag?: string; name?: string }) => {
    const cur = edits.teams[tid] ?? {};
    persist({ ...edits, teams: { ...edits.teams, [tid]: { ...cur, ...patch } } });
  };
  const resetTeam = (tid: string) => {
    const players = { ...edits.players };
    const base = CS2_REAL_2026.find((t) => t.id === tid);
    base?.players.forEach((p) => delete players[p.id]);
    const t2 = { ...edits.teams }; delete t2[tid];
    persist({ players, teams: t2 });
  };

  const exportJson = () => {
    const data = JSON.stringify(applyBo3Edits(CS2_REAL_2026, edits), null, 1);
    navigator.clipboard?.writeText(data).then(
      () => alert('Times editados copiados! Cole em src/data/bo3-2026.json para tornar permanente.'),
      () => alert('Não foi possível copiar.'),
    );
  };

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 1100, margin: '20px auto' }}>
        <div className="panel-head">
          CRM da carreira · times e OVRs reais (bo3.gg)
          <span className="spacer" />
          <button className="btn ghost" onClick={exportJson}>Exportar JSON</button>
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Edite o OVR e a função de cada jogador, e o nome/tag/entrosamento dos times.
            As mudanças valem na hora no modo carreira (salvas neste navegador).
            Use <b>Exportar JSON</b> pra tornar permanente no código.
          </p>
          <div className="crm-grid">
            {/* lista de times */}
            <div className="crm-teams">
              <input placeholder="Buscar time…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="crm-team-list">
                {visible.map((t) => (
                  <button key={t.id} className={`crm-team${t.id === sel?.id ? ' on' : ''}`} onClick={() => setSelId(t.id)}>
                    <TeamBadge tag={t.tag} colors={t.colors} size={22} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                    <span className="crm-team-name"><Flag cc={t.country} /> {t.team}</span>
                    <span className="muted small">{t.teamwork}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* editor do time selecionado */}
            {sel && (
              <div className="crm-editor">
                <div className="crm-editor-head">
                  <TeamBadge tag={sel.tag} colors={sel.colors} size={40} logoUrl={sel.logoUrl ?? logoForTeam(sel)} />
                  <div className="crm-fields">
                    <label>Nome
                      <input value={sel.team} onChange={(e) => setTeam(sel.id, { name: e.target.value })} />
                    </label>
                    <label>Tag
                      <input value={sel.tag} maxLength={5} style={{ width: 80 }} onChange={(e) => setTeam(sel.id, { tag: e.target.value.toUpperCase() })} />
                    </label>
                    <label>Entrosamento
                      <input type="number" min={40} max={99} value={sel.teamwork} style={{ width: 80 }} onChange={(e) => setTeam(sel.id, { teamwork: Math.max(40, Math.min(99, +e.target.value || 40)) })} />
                    </label>
                  </div>
                  <span className="spacer" />
                  <button className="btn ghost small" onClick={() => resetTeam(sel.id)}>Resetar time</button>
                </div>

                <div className="crm-players">
                  {sel.players.map((p) => {
                    const ovr = playerOvr(p);
                    return (
                      <div key={p.id} className="crm-player">
                        <PlayerAvatar nick={p.nick} size={40} />
                        <OvrBadge ovr={ovr} />
                        <div className="crm-pinfo">
                          <div className="nick"><Flag cc={p.country} /> {p.nick}</div>
                          <div className="muted small">{p.name}</div>
                        </div>
                        <label className="crm-ctrl">OVR
                          <input type="number" min={50} max={99} value={ovr}
                            onChange={(e) => setPlayer(p.id, { ovr: Math.max(50, Math.min(99, +e.target.value || 50)) })} />
                        </label>
                        <label className="crm-ctrl">Função
                          <select value={p.role} onChange={(e) => setPlayer(p.id, { role: e.target.value as Role })}>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
