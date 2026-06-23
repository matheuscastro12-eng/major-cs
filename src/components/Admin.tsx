import { useMemo, useState } from 'react';
import { AdminNav } from './AdminNav';
import { logoForTeam } from '../data/media';
import { playerOvr } from '../engine/ratings';
import { adminPassword, lockAdmin } from './AdminGate';
import { invalidateDonors } from './Donate';
import { MetricsPanel } from './MetricsPanel';
import { clearDirty, exportDataset, fileToDataUrl, importDatasetFromFile, loadMapImages, recordDeletedTeam, saveDatasetToServer, saveMapImage } from '../state/crm';
import type { CoachStyle, Game, MapId, Player, Playstyle, Role, TeamSeason } from '../types';
import { COACH_STYLE_LABELS, derivePlaystyle, MAP_LABELS, MAP_POOL, PLAYSTYLE_ICONS, PLAYSTYLE_LABELS } from '../types';
import { Flag, MapThumb, TeamBadge } from './ui';
import { ct } from '../state/career-i18n';

const GAMES: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
const ROLES: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];
const PLAYSTYLES: Playstyle[] = ['aggressive', 'balanced', 'passive'];
const STYLES: CoachStyle[] = ['tactical', 'aggressive', 'discipline'];

interface Props {
  dataset: TeamSeason[];
  onChange: (teams: TeamSeason[]) => void;
  onReset: () => void;
  onBack: () => void;
  onLab?: () => void;
}

export function Admin({ dataset, onChange, onReset, onBack, onLab }: Props) {
  const [selId, setSelId] = useState<string | null>(dataset[0]?.id ?? null);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const saveToServer = async () => {
    if (saving) return;
    if (!confirm(`${ct('Salvar estes')} ${dataset.length} ${ct('times no banco? Vai valer para TODOS os usuários e para qualquer campanha nova.')}`)) return;
    setSaving(true);
    setSaveMsg('');
    const r = await saveDatasetToServer(dataset, adminPassword());
    setSaving(false);
    if (r.ok) {
      clearDirty(); // a cópia local agora é igual à do servidor
      setSaveMsg('✅ ' + ct('Base salva no banco! Já vale para todos os jogadores.'));
    } else {
      setSaveMsg(`❌ ${ct('Falha ao salvar:')} ${r.error ?? ct('erro desconhecido')}`);
    }
  };

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
  const pendingTeams = useMemo(() => dataset.filter((t) => t.pending), [dataset]);

  const approveTeam = (id: string) => {
    onChange(dataset.map((t) => (t.id === id ? { ...t, pending: false } : t)));
  };
  const unapproveTeam = (id: string) => {
    onChange(dataset.map((t) => (t.id === id ? { ...t, pending: true } : t)));
  };
  const approveAll = () => {
    if (!confirm(`${ct('Aprovar todos os')} ${pendingTeams.length} ${ct('times pendentes?')}`)) return;
    onChange(dataset.map((t) => (t.pending ? { ...t, pending: false } : t)));
  };

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
      alert(ct('A base precisa de pelo menos 16 times para montar o Major.'));
      return;
    }
    if (!confirm(ct('Excluir este time da base?'))) return;
    recordDeletedTeam(id); // tombstone: o "Salvar no banco" apaga só este id
    const next = dataset.filter((t) => t.id !== id);
    onChange(next);
    setSelId(next[0]?.id ?? null);
  };

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          {ct('Base de dados - times & jogadores')}
          <span className="spacer" />
          <button className="btn" onClick={saveToServer} disabled={saving} title={ct('Grava a base no banco Neon: passa a valer para todos os usuários e campanhas novas')}>
            {saving ? '💾 ' + ct('Salvando…') : '💾 ' + ct('Salvar no banco (todos veem)')}
          </button>
          <button className="btn ghost" onClick={addTeam}>
            + {ct('Novo time')}
          </button>
          <button className="btn ghost" onClick={() => exportDataset(dataset)} title={ct('Baixa a base atual como JSON (backup / migrar entre domínios)')}>
            ⬇ {ct('Exportar')}
          </button>
          <span className="btn ghost upload-btn" title={ct('Carrega uma base de um arquivo JSON exportado')}>
            ⬆ {ct('Importar')}
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const teams = await importDatasetFromFile(file);
                  if (confirm(`${ct('Importar')} ${teams.length} ${ct('times deste arquivo? A base atual será substituída.')}`)) {
                    onChange(teams);
                    setSelId(teams[0]?.id ?? null);
                    alert(ct('Base importada com sucesso!'));
                  }
                } catch {
                  alert(ct('Arquivo inválido. Use um JSON exportado pelo próprio jogo.'));
                }
                e.target.value = '';
              }}
            />
          </span>
          {onLab && (
            <button className="btn ghost" onClick={onLab}>
              🧪 Lab
            </button>
          )}
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(ct('Restaurar a base original? Suas edições serão perdidas.'))) onReset();
            }}
          >
            {ct('Restaurar padrão')}
          </button>
          <button
            className="btn danger"
            title={ct('Bloqueia a área administrativa neste navegador')}
            onClick={() => {
              lockAdmin();
              onBack();
            }}
          >
            🔒 {ct('Sair')}
          </button>
          <button className="btn" onClick={onBack}>
            ← {ct('Voltar')}
          </button>
        </div>
        <div className="panel-body">
          <AdminNav current="/admin" />
          {saveMsg && (
            <div className={`crm-save-msg${saveMsg.startsWith('✅') ? ' ok' : ' err'}`}>{saveMsg}</div>
          )}
          {pendingTeams.length > 0 && (
            <div className="pending-banner">
              <span>
                ⏳ <b>{pendingTeams.length}</b> {pendingTeams.length === 1 ? ct('time aguardando') : ct('times aguardando')} {ct('aprovação — ficam ocultos para os jogadores até você liberar e')} <b>{ct('Salvar no banco')}</b>.
              </span>
              <span className="spacer" />
              <button className="btn ghost" onClick={() => setSelId(pendingTeams[0].id)}>
                {ct('Revisar')}
              </button>
              <button className="btn" onClick={approveAll}>
                ✅ {ct('Aprovar todos')}
              </button>
            </div>
          )}
          <div className="crm-layout">
            <div>
              <div className="field" style={{ marginBottom: 8 }}>
                <input placeholder={ct('Buscar time, era ou jogador…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <div className="panel crm-list" style={{ marginBottom: 0 }}>
                {filtered.map((t) => (
                  <button key={t.id} className={`crm-item${t.id === selId ? ' sel' : ''}`} onClick={() => setSelId(t.id)}>
                    <TeamBadge tag={t.tag} colors={t.colors} size={22} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                    <span style={{ flex: 1 }}>
                      {t.team} <span className="sub">{t.era}</span>
                      {t.pending && <span className="pending-tag">⏳ {ct('pendente')}</span>}
                      <br />
                      <span className="sub">
                        {t.game} · {t.players.length} {ct('jogadores')}
                      </span>
                    </span>
                    <Flag cc={t.country} />
                  </button>
                ))}
                {filtered.length === 0 && <div style={{ padding: 14 }} className="muted">{ct('Nada encontrado.')}</div>}
              </div>
            </div>

            {sel ? (
              <div>
                <div className={`approve-bar ${sel.pending ? 'is-pending' : 'is-live'}`}>
                  {sel.pending ? (
                    <>
                      <span>⏳ <b>{sel.team}</b> {ct('está pendente — invisível para os jogadores.')}</span>
                      <span className="spacer" />
                      <button className="btn" onClick={() => approveTeam(sel.id)}>✅ {ct('Aprovar e liberar')}</button>
                    </>
                  ) : (
                    <>
                      <span>✅ <b>{sel.team}</b> {ct('está liberado para os jogadores.')}</span>
                      <span className="spacer" />
                      <button className="btn ghost" onClick={() => unapproveTeam(sel.id)}>{ct('Tornar pendente')}</button>
                    </>
                  )}
                </div>
                <div className="form-grid" style={{ marginBottom: 12 }}>
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <label>{ct('Time')}</label>
                    <input value={sel.team} onChange={(e) => updateTeam(sel.id, { team: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>{ct('Tag')}</label>
                    <input value={sel.tag} maxLength={4} onChange={(e) => updateTeam(sel.id, { tag: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="field">
                    <label>{ct('Era')}</label>
                    <input value={sel.era} onChange={(e) => updateTeam(sel.id, { era: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>{ct('Jogo')}</label>
                    <select value={sel.game} onChange={(e) => updateTeam(sel.id, { game: e.target.value as Game })}>
                      {GAMES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>{ct('País (ISO2)')}</label>
                    <input value={sel.country} maxLength={2} onChange={(e) => updateTeam(sel.id, { country: e.target.value.toLowerCase() })} />
                  </div>
                  <div className="field">
                    <label>{ct('Entrosamento (50-99)')}</label>
                    <input
                      type="number"
                      min={50}
                      max={99}
                      value={sel.teamwork}
                      onChange={(e) => updateTeam(sel.id, { teamwork: clampNum(e.target.value, 50, 99) })}
                    />
                  </div>
                  <div className="field">
                    <label>{ct('Cores')}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="color" value={sel.colors[0]} onChange={(e) => updateTeam(sel.id, { colors: [e.target.value, sel.colors[1]] })} />
                      <input type="color" value={sel.colors[1]} onChange={(e) => updateTeam(sel.id, { colors: [sel.colors[0], e.target.value] })} />
                    </div>
                  </div>
                  <div className="field" style={{ gridColumn: 'span 4' }}>
                    <label>{ct('História / conquistas')}</label>
                    <input value={sel.honors} onChange={(e) => updateTeam(sel.id, { honors: e.target.value })} />
                  </div>
                  <div className="field" style={{ gridColumn: 'span 4' }}>
                    <label>{ct('Logo do time (upload)')}</label>
                    <div className="upload-row">
                      <span className="preview">
                        <TeamBadge tag={sel.tag} colors={sel.colors} size={40} logoUrl={sel.logoUrl ?? logoForTeam(sel)} />
                      </span>
                      <span className="btn ghost upload-btn">
                        📤 {ct('Enviar logo')}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const dataUrl = await fileToDataUrl(file, 160);
                              updateTeam(sel.id, { logoUrl: dataUrl });
                            } catch {
                              alert(ct('Não foi possível ler a imagem.'));
                            }
                            e.target.value = '';
                          }}
                        />
                      </span>
                      {sel.logoUrl && (
                        <button className="btn danger" onClick={() => updateTeam(sel.id, { logoUrl: undefined })}>
                          {ct('Remover logo')}
                        </button>
                      )}
                      <span className="muted small">{ct('PNG/JPG, redimensionada para 160px. Sem upload, usamos a logo da Liquipedia.')}</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>{ct('Coach (nick)')}</label>
                    <input value={sel.coach.nick} onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, nick: e.target.value } })} />
                  </div>
                  <div className="field">
                    <label>{ct('Coach (nome)')}</label>
                    <input value={sel.coach.name} onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, name: e.target.value } })} />
                  </div>
                  <div className="field">
                    <label>{ct('Coach país / rating')}</label>
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
                    <label>{ct('Estilo do coach')}</label>
                    <select
                      value={sel.coach.style}
                      onChange={(e) => updateTeam(sel.id, { coach: { ...sel.coach, style: e.target.value as CoachStyle } })}
                    >
                      {STYLES.map((s) => (
                        <option key={s} value={s}>
                          {ct(COACH_STYLE_LABELS[s])}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 6 }}>
                  <label>{ct('Força por mapa (-3 a +3)')}</label>
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
                      <th>{ct('Nick')}</th>
                      <th>{ct('Nome')}</th>
                      <th>{ct('País')}</th>
                      <th>{ct('Função')}</th>
                      <th>{ct('Estilo')}</th>
                      <th>{ct('Mira')}</th>
                      <th>{ct('Clutch')}</th>
                      <th>{ct('Const.')}</th>
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
                        <td>
                          <select
                            value={p.playstyle ?? derivePlaystyle(p.role)}
                            onChange={(e) => updatePlayer(sel.id, p.id, { playstyle: e.target.value as Playstyle })}
                          >
                            {PLAYSTYLES.map((s) => (
                              <option key={s} value={s}>
                                {PLAYSTYLE_ICONS[s]} {ct(PLAYSTYLE_LABELS[s])}
                              </option>
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
                            title={sel.players.length <= 5 ? ct('Mínimo de 5 jogadores') : ct('Remover jogador')}
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
                    + {ct('Adicionar jogador')}
                  </button>
                  <span className="spacer" style={{ flex: 1 }} />
                  <button className="btn danger" onClick={() => deleteTeam(sel.id)}>
                    {ct('Excluir time')}
                  </button>
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  {ct('As alterações são salvas automaticamente no seu navegador. Os 5 primeiros jogadores da lista entram em quadra.')}
                </p>
              </div>
            ) : (
              <div className="muted">{ct('Selecione um time para editar.')}</div>
            )}
          </div>
        </div>
      </div>

      <MetricsPanel />
      <MapImagesPanel />
      <DonorsAdminPanel />
    </div>
  );
}

// Registro manual de doações (PixGG não expõe API pública de histórico -
// você registra aqui o que cair na sua conta e o mural exibe para todos).
function DonorsAdminPanel() {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [source, setSource] = useState('pixgg');
  const [status, setStatus] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setStatus(ct('Salvando…'));
    try {
      const res = await fetch('/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword(),
          name: name.trim(),
          amount: Number(amount.replace(',', '.')) || 0,
          message: message.trim(),
          source,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        invalidateDonors();
        setStatus(`✔ ${name.trim()} ${ct('adicionado ao mural!')}`);
        setName('');
        setAmount('');
        setMessage('');
      } else if (res.status === 401) {
        setStatus(ct('Senha de admin inválida - saia e entre de novo na área administrativa.'));
      } else {
        setStatus(ct('Erro ao salvar.'));
      }
    } catch {
      setStatus(ct('API indisponível (em localhost o mural só funciona no deploy).'));
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">💜 {ct('Apoiadores - registrar doação')}</div>
      <div className="panel-body">
        <div className="form-grid">
          <div className="field">
            <label>{ct('Nome do doador')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ct('ex: Gaules')} />
          </div>
          <div className="field">
            <label>{ct('Valor (R$)')}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10,00" />
          </div>
          <div className="field">
            <label>{ct('Origem')}</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="pixgg">PixGG</option>
              <option value="kofi">Ko-fi</option>
              <option value="outro">{ct('Outro')}</option>
            </select>
          </div>
          <div className="field">
            <label>{ct('Mensagem (opcional)')}</label>
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button className="btn gold" onClick={submit} disabled={!name.trim()}>
            {ct('Adicionar ao mural')}
          </button>
          <span className="muted small">{status}</span>
        </div>
      </div>
    </div>
  );
}

// Upload das fotos dos mapas (sobrescreve a arte padrão em todo o app)
function MapImagesPanel() {
  const [, setVersion] = useState(0);
  const customs = loadMapImages();

  const upload = async (map: MapId, file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file, 640);
      saveMapImage(map, dataUrl);
      setVersion((v) => v + 1);
    } catch {
      alert(ct('Não foi possível ler a imagem.'));
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        {ct('Fotos dos mapas')}
        <span className="spacer" />
        <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {ct('Uploads substituem a arte padrão no veto e nas partidas (salvo no navegador)')}
        </span>
      </div>
      <div className="panel-body">
        <div className="map-upload-grid">
          {MAP_POOL.map((m) => (
            <div key={m} className="map-upload-card">
              <div className="img-wrap">
                <MapThumb map={m} />
              </div>
              <div className="mname">
                {MAP_LABELS[m]}
                {customs[m] && <span className="muted small"> · {ct('custom')}</span>}
              </div>
              <div className="actions">
                <span className="btn ghost upload-btn" style={{ padding: '4px 10px', fontSize: 11 }}>
                  📤 {ct('Foto')}
                  <input type="file" accept="image/*" onChange={(e) => upload(m, e.target.files?.[0])} />
                </span>
                {customs[m] && (
                  <button
                    className="btn danger"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={() => {
                      saveMapImage(m, null);
                      setVersion((v) => v + 1);
                    }}
                  >
                    {ct('Padrão')}
                  </button>
                )}
              </div>
            </div>
          ))}
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
