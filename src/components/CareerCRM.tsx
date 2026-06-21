// CRM do modo carreira: editar os times e OVRs dos jogadores REAIS (bo3.gg).
// Acesso oculto via #carreira-crm. As edições ficam em localStorage e são
// aplicadas em runtime sobre CS2_REAL_2026 (sem reimportar a API).
import { useEffect, useMemo, useState } from 'react';
import type { Player, Role } from '../types';
import { CS2_REAL_2026 } from '../data/bo3';
import { applyBo3Edits, fetchBo3Edits, loadBo3Edits, mergeBo3Edits, pushBo3Edits, saveBo3Edits, type Bo3Edits, type PlayerEdit } from '../state/bo3-edits';
import { adminPassword } from './AdminGate';
import { AdminNav } from './AdminNav';
import { playerOvr } from '../engine/ratings';
import { logoForTeam } from '../data/media';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';

const ROLES: Role[] = ['AWP', 'IGL', 'Entry', 'Rifler', 'Support', 'Lurker'];
// stats individuais editáveis (rótulo curto + chave no Player)
const STATS: { key: keyof Pick<Player, 'aim' | 'awp' | 'igl' | 'clutch' | 'consistency'>; label: string }[] = [
  { key: 'aim', label: 'Mira' },
  { key: 'awp', label: 'AWP' },
  { key: 'igl', label: 'IGL' },
  { key: 'clutch', label: 'Clutch' },
  { key: 'consistency', label: 'Consist.' },
];

export function CareerCRM({ onExit }: { onExit: () => void }) {
  const [edits, setEdits] = useState<Bo3Edits>(() => loadBo3Edits());
  const [filter, setFilter] = useState('');
  const [selId, setSelId] = useState<string>(CS2_REAL_2026[0]?.id ?? '');
  const [dirty, setDirty] = useState(false); // tem alteração não salva?
  const [savedFlash, setSavedFlash] = useState('');
  const [saving, setSaving] = useState(false);

  // ao abrir, busca as edições GLOBAIS do servidor (fonte da verdade pra todos);
  // o cache local não sobrepõe o que está salvo no servidor.
  useEffect(() => {
    let alive = true;
    // servidor COMPLETA; o que está em edição local tem prioridade (não perde edição)
    fetchBo3Edits().then((srv) => {
      if (!alive || !srv) return;
      setEdits((local) => { const merged = mergeBo3Edits(srv, local); saveBo3Edits(merged); return merged; });
    });
    return () => { alive = false; };
  }, []);

  // times com as edições já aplicadas (pra mostrar o estado atual)
  const teams = useMemo(() => applyBo3Edits(CS2_REAL_2026, edits), [edits]);
  const visible = teams.filter((t) => !filter || t.team.toLowerCase().includes(filter.toLowerCase()) || t.tag.toLowerCase().includes(filter.toLowerCase()));
  const sel = teams.find((t) => t.id === selId) ?? teams[0];

  // mutador base: SEMPRE deriva do estado mais recente (forma funcional), senão
  // editar vários jogadores seguidos faz um sobrescrever o outro (o bug do "não
  // salva pra todos os jogadores").
  const mutate = (fn: (prev: Bo3Edits) => Bo3Edits) => { setEdits(fn); setDirty(true); setSavedFlash(''); };

  // salva GLOBAL (servidor, vale pra todos) + cache local. Precisa da senha admin
  // (já validada no AdminGate). Se o servidor falhar, avisa e mantém o cache local.
  const save = async () => {
    if (saving) return;
    setSaving(true);
    saveBo3Edits(edits); // cache local imediato
    const ok = await pushBo3Edits(edits, adminPassword());
    setSaving(false);
    setDirty(!ok);
    setSavedFlash(ok ? '✔ salvo pra todos' : '⚠ salvo só local (servidor falhou)');
    setTimeout(() => setSavedFlash(''), 4000);
  };

  const setPlayer = (pid: string, patch: Partial<PlayerEdit>) => {
    mutate((prev) => ({ ...prev, players: { ...prev.players, [pid]: { ...(prev.players[pid] ?? {}), ...patch } } }));
  };
  const setTeam = (tid: string, patch: { teamwork?: number; tag?: string; name?: string }) => {
    mutate((prev) => ({ ...prev, teams: { ...prev.teams, [tid]: { ...(prev.teams[tid] ?? {}), ...patch } } }));
  };
  const resetTeam = (tid: string) => {
    const base = CS2_REAL_2026.find((t) => t.id === tid);
    mutate((prev) => {
      const players = { ...prev.players };
      base?.players.forEach((p) => delete players[p.id]);
      const teams = { ...prev.teams }; delete teams[tid];
      return { players, teams };
    });
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
          {savedFlash && <span className={`small ${savedFlash.startsWith('✔') ? 'pos' : 'neg'}`} style={{ marginRight: 6 }}>{savedFlash}</span>}
          {dirty && !savedFlash && <span className="neg small" style={{ marginRight: 6 }}>alterações não salvas</span>}
          <button className="btn ghost" onClick={exportJson}>Exportar JSON</button>
          <button className={`btn gold${dirty && !saving ? '' : ' ghost'}`} disabled={!dirty || saving} onClick={save}>{saving ? 'Salvando…' : '💾 Salvar pra todos'}</button>
          <button className="btn" onClick={() => { if (!dirty || confirm('Há alterações não salvas. Sair mesmo assim?')) onExit(); }}>← Sair</button>
        </div>
        <div className="panel-body">
          <AdminNav current="/admin/carreira" />
          <p className="muted small" style={{ marginTop: 0 }}>
            Edite <b>OVR, função e cada stat</b> (mira/AWP/IGL/clutch/consist.) dos jogadores, e o nome/tag/entrosamento dos times.
            Ao <b>Salvar</b>, as mudanças vão pro servidor e valem <b>pra todos os usuários</b> do modo carreira (sem cache local sobrepondo).
            Ajustar uma stat sobrescreve o valor derivado do OVR.
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
                        <div className="crm-stats">
                          {STATS.map((s) => (
                            <label key={s.key} className="crm-ctrl">{s.label}
                              <input type="number" min={40} max={99} value={p[s.key]}
                                onChange={(e) => setPlayer(p.id, { [s.key]: Math.max(40, Math.min(99, +e.target.value || 40)) })} />
                            </label>
                          ))}
                        </div>
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
