import { useMemo, useState } from 'react';
import { playerOvr } from '../engine/ratings';
import type { CoachStyle, Game, Player, Role, TeamSeason } from '../types';
import { COACH_STYLE_LABELS, MAP_LABELS, MAP_POOL } from '../types';
import { Flag, TeamBadge } from './ui';

const GAMES: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
const ROLES: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];
const STYLES: CoachStyle[] = ['tactical', 'aggressive', 'discipline'];

interface Props {
  dataset: TeamSeason[];
  onChange: (teams: TeamSeason[]) => void;
  onReset: () => void;
  onBack: () => void;
}

export function Admin({ dataset, onChange, onReset, onBack }: Props) {
  const [selId, setSelId] = useState<string | null>(dataset[0]?.id ?? null);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return dataset;
    return dataset.filter(
      (t) =>
        t.team.toLowerCase().includes(f) ||
        t.era.includes(f) ||
        t.game.toLowerCase().includes(f) ||
        t.players.some((p) => p.nick.toLowerCase().includes(f)),
    );
  }, [dataset, filter]);

  const sel = dataset.find((t) => t.id === selId) ?? null;

  const updateTeam = (id: string, patch: Partial<TeamSeason>) => {
    onChange(dataset.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const updatePlayer = (teamId: string, pid: string, patch: Partial<Player>) => {
    onChange(
      dataset.map((t) =>
        t.id === teamId ? { ...t, players: t.players.map((p) => (p.id === pid ? { ...p, ...patch } : p)) } : t,
      ),
    );
  };

  const addPlayer = (teamId: string) => {
    const team = dataset.find((t) => t.id === teamId);
    if (!team || team.players.length >= 7) return;
    const np: Player = {
      id: `${teamId}__novo${Math.floor(Math.random() * 1e6)}`,
      nick: 'novo_jogador',
      name: 'Nome Completo',
      country: 'br',
      role: 'Rifler',
      aim: 80,
      clutch: 78,
      consistency: 80,
      awp: 58,
      igl: 55,
    };
    updateTeam(teamId, { players: [...team.players, np] });
  };

  const deletePlayer = (teamId: string, pid: string) => {
    const team = dataset.find((t) => t.id === teamId);
    if (!team || team.players.length <= 5) return;
    updateTeam(teamId, { players: team.players.filter((p) => p.id !== pid) });
  };

  const addTeam = () => {
    const id = `custom${Math.floor(Math.random() * 1e6)}`;
    const nt: TeamSeason = {
      id,
      team: 'Novo Time',
      tag: 'NOVO',
      era: '2026',
      game: 'CS2',
      country: 'br',
      teamwork: 85,
      honors: 'Descrição da era do time',
      colors: ['#1a1a1a', '#61a8dd'],
      mapPrefs: {},
      coach: { nick: 'coach', name: 'Nome do Coach', country: 'br', rating: 80, style: 'tactical' },
      players: Array.from({ length: 5 }, (_, i) => ({
        id: `${id}__p${i}`,
        nick: `jogador${i + 1}`,
        name: 'Nome Completo',
        country: 'br',
        role: (i === 0 ? 'AWP' : i === 4 ? 'IGL' : 'Rifler') as Role,
        aim: 80,
        clutch: 78,
        consistency: 80,
        awp: i === 0 ? 88 : 58,
        igl: i === 4 ? 86 : 55,
      })),
    };
    onChange([nt, ...dataset]);
    setSelId(id);
  };

  const deleteTeam = (id: string) => {
    if (dataset.length <= 16) {
      alert('A base precisa de pelo menos 16 times para montar o Major.');
      return;
    }
    if (!confirm('Excluir este time da base?')) return;
    const next = dataset.filter((t) => t.id !== id);
    onChange(next);
    setSelId(next[0]?.id ?? null);
  };

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          Base de dados — times &amp; jogadores
          <span className="spacer" />
          <button className="btn ghost" onClick={addTeam}>
            + Novo time
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Restaurar a base original? Suas edições serão perdidas.')) onReset();
            }}
          >
            Restaurar padrão
          </button>
          <button className="btn" onClick={onBack}>
            ← Voltar
          </button>
        </div>
        <div className="panel-body">
          <div className="crm-layout">
            <div>
              <div className="field" style={{ marginBottom: 8 }}>
                <input placeholder="Buscar time, era ou jogador…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <div className="panel crm-list" style={{ marginBottom: 0 }}>
                {filtered.map((t) => (
                  <button key={t.id} className={`crm-item${t.id === selId ? ' sel' : ''}`} onClick={() => setSelId(t.id)}>
                    <TeamBadge tag={t.tag} colors={t.colors} size={22} />
                    <span style={{ flex: 1 }}>
                      {t.team} <span className="sub">{t.era}</span>
                      <br />
                      <span className="sub">
                        {t.game} · {t.players.length} jogadores
                      </span>
                    </span>
                    <Flag cc={t.country} />
                  </button>
                ))}
                {filtered.length === 0 && <div style={{ padding: 14 }} className="muted">Nada encontrado.</div>}
              </div>
            </div>

            {sel ? (
              <div>
                <div className="form-grid" style={{ marginBottom: 12 }}>
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <label>Time</label>
                    <input value={sel.team} onChange={(e) => updateTeam(sel.id, { team: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Tag</label>
                    <input value={sel.tag} maxLength={4} onChange={(e) => updateTeam(sel.id, { tag: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="field">
                    <label>Era</label>
                    <input value={sel.era} onChange={(e) => updateTeam(sel.id, { era: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Jogo</label>
                    <select value={sel.game} onChange={(e) => updateTeam(sel.id, { game: e.target.value as Game })}>
                      {GAMES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>País (ISO2)</label>
                    <input value={sel.country} maxLength={2} onChange={(e) => updateTeam(sel.id, { country: e.target.value.toLowerCase() })} />
                  </div>
                  <div className="field">
                    <label>Entrosamento (50-99)</label>
                    <input
                      type="number"
                      min={50}
                      max={99}
                      value={sel.teamwork}
                      onChange={(e) => updateTeam(sel.id, { teamwork: clampNum(e.target.value, 50, 99) })}
                    />
                  </div>
                  <div className="field">
                    <label>Cores</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="color" value={sel.colors[0]} onChange={(e) => updateTeam(sel.id, { colors: [e.target.value, sel.colors[1]] })} />
                      <input type="color" value={sel.colors[1]} onChange={(e) => updateTeam(sel.id, { colors: [sel.colors[0], e.target.value] })} />
                    </div>
                  </div>
                  <div className="field" style={{ gridColumn: 'span 4' }}>
                    <label>História / conquistas</label>
                    <input value={sel.honors} onChange={(e) => updateTeam(sel.id, { honors: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Coach (nick)</label>
                    <input value={sel.coach.nick} onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, nick: e.target.value } })} />
                  </div>
                  <div className="field">
                    <label>Coach (nome)</label>
                    <input value={sel.coach.name} onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, name: e.target.value } })} />
                  </div>
                  <div className="field">
                    <label>Coach país / rating</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={sel.coach.country}
                        maxLength={2}
                        style={{ width: 50 }}
                        onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, country: e.target.value.toLowerCase() } })}
                      />
                      <input
                        type="number"
                        min={50}
                        max={99}
                        value={sel.coach.rating}
                        onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, rating: clampNum(e.target.value, 50, 99) } })}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Estilo do coach</label>
                    <select
                      value={sel.coach.style}
                      onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, style: e.target.value as CoachStyle } })}
                    >
                      {STYLES.map((s) => (
                        <option key={s} value={s}>
                          {COACH_STYLE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 6 }}>
                  <label>Força por mapa (-3 a +3)</label>
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 14 }}>
                  {MAP_POOL.map((m) => (
                    <div className="field" key={m}>
                      <label>{MAP_LABELS[m]}</label>
                      <input
                        type="number"
                        min={-3}
                        max={3}
                        step={0.5}
                        value={sel.mapPrefs[m] ?? 0}
                        onChange={(e) => updateTeam(sel.id, { mapPrefs: { ...sel.mapPrefs, [m]: clampNum(e.target.value, -3, 3) } })}
                      />
                    </div>
                  ))}
                </div>

                <table className="crm-players">
                  <thead>
                    <tr>
                      <th>Nick</th>
                      <th>Nome</th>
                      <th>País</th>
                      <th>Função</th>
                      <th>Mira</th>
                      <th>Clutch</th>
                      <th>Const.</th>
                      <th>AWP</th>
                      <th>IGL</th>
                      <th>OVR</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sel.players.map((p) => (
                      <tr key={p.id}>
                        <td style={{ minWidth: 110 }}>
                          <input value={p.nick} onChange={(e) => updatePlayer(sel.id, p.id, { nick: e.target.value })} />
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <input value={p.name} onChange={(e) => updatePlayer(sel.id, p.id, { name: e.target.value })} />
                        </td>
                        <td style={{ width: 52 }}>
                          <input value={p.country} maxLength={2} onChange={(e) => updatePlayer(sel.id, p.id, { country: e.target.value.toLowerCase() })} />
                        </td>
                        <td>
                          <select value={p.role} onChange={(e) => updatePlayer(sel.id, p.id, { role: e.target.value as Role })}>
                            {ROLES.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        {(['aim', 'clutch', 'consistency', 'awp', 'igl'] as const).map((k) => (
                          <td key={k}>
                            <input
                              className="num"
                              type="number"
                              min={40}
                              max={99}
                              value={p[k]}
                              onChange={(e) => updatePlayer(sel.id, p.id, { [k]: clampNum(e.target.value, 40, 99) } as Partial<Player>)}
                            />
                          </td>
                        ))}
                        <td className="ovr-inline" style={{ textAlign: 'center' }}>
                          {playerOvr(p)}
                        </td>
                        <td>
                          <button
                            className="icon-btn"
                            title={sel.players.length <= 5 ? 'Mínimo de 5 jogadores' : 'Remover jogador'}
                            onClick={() => deletePlayer(sel.id, p.id)}
                            disabled={sel.players.length <= 5}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="btn ghost" onClick={() => addPlayer(sel.id)} disabled={sel.players.length >= 7}>
                    + Adicionar jogador
                  </button>
                  <span className="spacer" style={{ flex: 1 }} />
                  <button className="btn danger" onClick={() => deleteTeam(sel.id)}>
                    Excluir time
                  </button>
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  As alterações são salvas automaticamente no seu navegador. Os 5 primeiros jogadores da lista entram em quadra.
                </p>
              </div>
            ) : (
              <div className="muted">Selecione um time para editar.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function clampNum(v: string, min: number, max: number): number {
  const n = Number(v);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
