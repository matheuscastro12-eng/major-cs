// Duelo Online do Ultimate (PvP 1v1): dois usuários reais, cada um com seu
// squad PERSISTENTE. Reusa o lobby existente (/api/lobby, mode 'ultimate'):
// create/join por código → host inicia → ambos enviam o snapshot do squad
// (action pick + coluna squad) → status 'done' → os DOIS clientes simulam a
// MESMA série com o run_seed da sala (determinístico) → replay no palco do
// Ultimate (o pai cuida via onPlay). Revanche = nextSeason (novo run_seed).
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLobby, lobbyApi, listOpenLobbies, type LobbyState, type OpenRoom, type UltimatePvpSquad } from '../../state/online';
import { ct } from '../../state/career-i18n';
import { Copy, Globe, LogOut, Plus, RefreshCw, Swords, Users, Zap } from 'lucide-react';

export interface DuelPlayArgs {
  code: string;
  runSeed: number;
  mySquad: UltimatePvpSquad;
  oppSquad: UltimatePvpSquad;
  oppNick: string;
  myFirst: boolean; // ordem canônica (nick menor primeiro) — igual nos 2 clientes
}

export function UltimateDuel({ nick, squad, ready, onPlay }: {
  nick: string;
  squad: UltimatePvpSquad;
  ready: boolean;               // squad completo (5 cartas)?
  onPlay: (args: DuelPlayArgs) => void;
}) {
  const [view, setView] = useState<'menu' | 'room'>('menu');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [state, setState] = useState<LobbyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sentRef = useRef('');    // já enviei meu squad neste ciclo (code:status-run)
  const playedRef = useRef(new Set<string>()); // partidas já entregues ao pai (code:run_seed)

  const refreshRooms = useCallback(async () => {
    const all = await listOpenLobbies();
    setRooms(all.filter((r) => r.mode === 'ultimate'));
  }, []);
  useEffect(() => { if (view === 'menu') void refreshRooms(); }, [view, refreshRooms]);

  // ── poll do estado da sala (ETag/304 dentro do fetchLobby) ──
  useEffect(() => {
    if (view !== 'room' || !code) return;
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      const s = await fetchLobby(code, state?.lobby.code === code);
      if (!alive) return;
      if (s === 'gone') { setError(ct('A sala expirou ou foi encerrada.')); setView('menu'); setState(null); setCode(''); return; }
      if (s && s !== 'unchanged') setState(s);
    };
    void poll();
    const status = state?.lobby.status ?? 'waiting';
    const ms = status === 'waiting' || status === 'drafting' ? 3500 : 12000;
    const t = window.setInterval(poll, ms);
    return () => { alive = false; window.clearInterval(t); };
  }, [view, code, state?.lobby.status, state?.lobby.code]);

  // ── heartbeat (presença) ──
  useEffect(() => {
    if (view !== 'room' || !code) return;
    const t = window.setInterval(() => { void lobbyApi({ action: 'ping', code, nick }); }, 25_000);
    return () => window.clearInterval(t);
  }, [view, code, nick]);

  // ── auto-envio do squad quando o host inicia (status 'drafting') ──
  useEffect(() => {
    if (!state || state.lobby.status !== 'drafting') return;
    const me = state.players.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (!me || me.done) return;
    const key = `${code}:${state.lobby.run_seed ?? state.lobby.seed}`;
    if (sentRef.current === key) return;
    sentRef.current = key;
    void lobbyApi({ action: 'pick', code, nick, picks: squad.cards.map((c) => c.pid), squad, done: true })
      .catch(() => { sentRef.current = ''; }); // falhou → tenta no próximo poll
  }, [state, code, nick, squad]);

  // ── partida pronta: 2 squads + status done → entrega pro pai (uma vez por seed) ──
  useEffect(() => {
    if (!state || state.lobby.status !== 'done') return;
    const actives = state.players.filter((p) => !p.spectator && p.squad && p.squad.cards.length === 5);
    if (actives.length < 2) return;
    const runSeed = Number(state.lobby.run_seed ?? state.lobby.seed) || 1;
    const key = `${code}:${runSeed}`;
    if (playedRef.current.has(key)) return;
    playedRef.current.add(key);
    const me = actives.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    const opp = actives.find((p) => p.nick.toLowerCase() !== nick.toLowerCase());
    if (!me?.squad || !opp?.squad) return;
    const myFirst = me.nick.toLowerCase() < opp.nick.toLowerCase();
    onPlay({ code, runSeed, mySquad: me.squad, oppSquad: opp.squad, oppNick: opp.squad.name || opp.nick, myFirst });
  }, [state, code, nick, onPlay]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      const r = await lobbyApi({ action: 'create', nick, mode: 'ultimate', pool: 'world', name: roomName.trim() || undefined, isPublic, ranked: true, ruleset: 'open' });
      if (r.ok && r.code) { setCode(r.code); setView('room'); setState(null); }
      else setError(r.error ?? ct('Não foi possível criar a sala.'));
    } catch { setError(ct('Sem conexão com o servidor.')); }
    setBusy(false);
  };

  const join = async (c: string) => {
    const target = c.trim().toUpperCase();
    if (target.length !== 5) { setError(ct('Código deve ter 5 letras.')); return; }
    setBusy(true); setError('');
    try {
      const r = await lobbyApi({ action: 'join', nick, code: target });
      if (r.ok) { setCode(target); setView('room'); setState(null); }
      else setError(r.error ?? ct('Não foi possível entrar.'));
    } catch { setError(ct('Sem conexão com o servidor.')); }
    setBusy(false);
  };

  const startDuel = async () => {
    setBusy(true); setError('');
    const r = await lobbyApi({ action: 'start', nick, code }).catch(() => ({ ok: false, error: ct('Sem conexão.') } as { ok: boolean; error?: string }));
    if (!r.ok) setError(r.error ?? ct('Não foi possível iniciar.'));
    setBusy(false);
  };

  const rematch = async () => {
    setBusy(true); setError('');
    const r = await lobbyApi({ action: 'nextSeason', nick, code, keepRoster: true }).catch(() => ({ ok: false, error: ct('Sem conexão.') } as { ok: boolean; error?: string }));
    if (!r.ok) setError(r.error ?? ct('Não foi possível pedir revanche.'));
    setBusy(false);
  };

  const leave = async () => {
    void lobbyApi({ action: 'leave', nick, code }).catch(() => undefined);
    setView('menu'); setState(null); setCode(''); setError('');
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'room') {
    const lobby = state?.lobby;
    const players = (state?.players ?? []).filter((p) => !p.spectator);
    const isHost = lobby ? lobby.host.toLowerCase() === nick.toLowerCase() : false;
    const status = lobby?.status ?? 'waiting';
    return (
      <div className="ut-duel">
        <div className="ut-duel__head">
          <span className="ut-duel__code" title={ct('Compartilhe este código com o rival')}>
            {code}
            <button className="ut-duel__copy" onClick={() => { void navigator.clipboard?.writeText(code); }} title={ct('Copiar código')}><Copy size={13} /></button>
          </span>
          <span className="ut-duel__status">
            {status === 'waiting' ? (players.length < 2 ? ct('Aguardando rival entrar…') : isHost ? ct('Rival na sala — inicie o duelo!') : ct('Aguardando o host iniciar…'))
              : status === 'drafting' ? ct('Trocando escalações…')
              : ct('Partida pronta')}
          </span>
          <button className="ut-btn ut-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.76rem' }} onClick={() => void leave()}><LogOut size={13} /> {ct('Sair')}</button>
        </div>

        <div className="ut-duel__players">
          {players.map((p) => {
            const isMe = p.nick.toLowerCase() === nick.toLowerCase();
            const sq = p.squad;
            const avg = sq && sq.cards.length ? Math.round(sq.cards.reduce((a, c) => a + c.ovr, 0) / sq.cards.length) : null;
            return (
              <div key={p.nick} className={`ut-duel__pl${isMe ? ' me' : ''}`}>
                <Users size={15} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ut-duel__plname">{sq?.name || p.nick}{isMe ? ` (${ct('você')})` : ''}{lobby && lobby.host.toLowerCase() === p.nick.toLowerCase() ? ' · HOST' : ''}</div>
                  <div className="ut-duel__plmeta">{sq ? `${avg} OVR · ${sq.elo} RP` : ct('escalação ainda não enviada')}</div>
                </div>
                {sq && <span className="ut-duel__ok">✓</span>}
              </div>
            );
          })}
          {players.length < 2 && <div className="ut-duel__pl empty"><Users size={15} /> <span style={{ color: 'var(--ut-muted)' }}>{ct('vaga aberta — compartilhe o código')}</span></div>}
        </div>

        {error && <div className="ut-duel__err">{error}</div>}

        {status === 'waiting' && isHost && (
          <button className="ut-jogar" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={busy || players.length < 2} onClick={() => void startDuel()}>
            <Zap size={16} /> {players.length < 2 ? ct('AGUARDANDO RIVAL…') : ct('INICIAR DUELO')}
          </button>
        )}
        {status === 'done' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {isHost && <button className="ut-jogar" style={{ flex: 1, justifyContent: 'center', padding: '11px' }} disabled={busy} onClick={() => void rematch()}><Swords size={15} /> {ct('REVANCHE')}</button>}
            {!isHost && <div style={{ flex: 1, textAlign: 'center', fontSize: '0.78rem', color: 'var(--ut-muted)', alignSelf: 'center' }}>{ct('O host pode pedir revanche — fique na sala.')}</div>}
          </div>
        )}
      </div>
    );
  }

  // ── menu: criar / entrar / salas abertas ──
  return (
    <div className="ut-duel">
      {!ready && <div className="ut-duel__err">{ct('Complete os 5 slots do seu squad (aba Squad) pra duelar online.')}</div>}
      <div className="ut-duel__grid">
        <div className="ut-duel__box">
          <div className="ut-duel__boxtitle"><Plus size={14} /> {ct('Criar sala')}</div>
          <input className="ut-duel__input" placeholder={ct('Nome da sala (opcional)')} maxLength={40} value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          <label className="ut-duel__chk"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> {ct('Sala pública (aparece na lista)')}</label>
          <button className="ut-jogar" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} disabled={busy || !ready} onClick={() => void create()}><Zap size={15} /> {ct('CRIAR DUELO')}</button>
        </div>
        <div className="ut-duel__box">
          <div className="ut-duel__boxtitle"><Globe size={14} /> {ct('Entrar com código')}</div>
          <input className="ut-duel__input" placeholder="ABCDE" maxLength={5} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase', letterSpacing: '4px', fontFamily: 'var(--ut-font-mono)', textAlign: 'center' }} />
          <button className="ut-btn ut-btn--gold" style={{ width: '100%' }} disabled={busy || !ready || joinCode.length !== 5} onClick={() => void join(joinCode)}>{ct('ENTRAR')}</button>
        </div>
      </div>

      {error && <div className="ut-duel__err">{error}</div>}

      <div className="ut-duel__boxtitle" style={{ marginTop: 6 }}><Swords size={14} /> {ct('Salas abertas')} <button className="ut-duel__copy" onClick={() => void refreshRooms()} title={ct('Atualizar')}><RefreshCw size={12} /></button></div>
      {rooms.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--ut-muted)', padding: '6px 2px' }}>{ct('Nenhuma sala aberta agora — crie a sua!')}</div>
      ) : (
        <div className="ut-duel__rooms">
          {rooms.map((r) => (
            <div key={r.code} className="ut-duel__room">
              <b>{r.name || r.code}</b>
              <span>{r.host} · {r.players}/{r.max}</span>
              <button className="ut-btn ut-btn--ghost" style={{ padding: '5px 13px', fontSize: '0.74rem' }} disabled={busy || !ready} onClick={() => void join(r.code)}>{ct('Entrar')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
