// "Major da Semana" — tela da Weekend League (fase B, cliente).
// Uma tela só: janela + countdown, meu run (X/10, W-L, faixas de recompensa,
// inscrever/resgatar) e o top-20 da janela. Os resultados entram sozinhos:
// toda ranqueada 1v1 jogada com a inscrição ativa é espelhada pro servidor
// (wlMirrorReport) e só conta quando os dois lados batem — aqui é leitura.
import { useCallback, useEffect, useState } from 'react';
import { Panel, Button } from '../ds';
import type { Account } from '../../state/account';
import {
  fetchWlStatus, wlRegister, WL_MAX_MATCHES,
  type WlStatus,
} from '../../state/weekendLeague';
import { ct } from '../../state/career-i18n';
import { setCheckoutSrc, trackPaywallView } from '../../state/track';
import { FounderCounter } from '../FounderCounter';

// countdown legível: "1d 4h", "6h 32min", "12min"
function fmtLeft(ms: number): string {
  const mins = Math.max(1, Math.floor(ms / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const fmtCredits = (n: number) => n.toLocaleString('pt-BR');

// Prêmios por COLOCAÇÃO no fim da janela (top 10). #1 = 70k; pago pelo dono no fecho.
const PLACEMENT_PRIZES = [70000, 40000, 25000, 15000, 10000, 7000, 5000, 4000, 3000, 2000];
const prizeForPlace = (rank: number): number => (rank >= 1 && rank <= PLACEMENT_PRIZES.length ? PLACEMENT_PRIZES[rank - 1] : 0);

export function WeekendLeague({ account, onHub, onPlay, onCreateAccount }: { account: Account | null; onHub: () => void; onPlay?: () => void; onCreateAccount?: () => void }) {
  const [status, setStatus] = useState<WlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!account) { setLoading(false); return; }
    setLoading(true);
    setError('');
    fetchWlStatus()
      .then((s) => setStatus(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : ct('Erro de conexão. Tente de novo.')))
      .finally(() => setLoading(false));
  }, [account]);
  useEffect(() => { load(); }, [load]);

  // funil: conta grátis jogando o Major da Semana vê o convite de vitalícia
  // (tela ficou 100% grátis pra todos — mas nunca tinha CTA nem instrumentação)
  useEffect(() => { if (account && !account.paid) trackPaywallView('wl-free'); }, [account]);

  // relógio do countdown (30s de passo é suficiente pra "fecha em Xh Ymin")
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const doRegister = () => {
    if (!status || busy) return;
    setBusy(true);
    setError('');
    wlRegister(status.window)
      .then((entry) => setStatus((s) => (s ? { ...s, entry } : s)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : ct('Erro de conexão. Tente de novo.')))
      .finally(() => setBusy(false));
  };

  // JOGAR: puxa a fila ranqueada (cai com outro online). Inscreve na janela antes
  // se ainda não estiver — o resultado da ranqueada conta sozinho pro Major.
  const doPlay = () => {
    if (!status || busy || !onPlay) return;
    if (status.entry) { onPlay(); return; }
    setBusy(true);
    setError('');
    wlRegister(status.window)
      .then((entry) => { setStatus((s) => (s ? { ...s, entry } : s)); onPlay(); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : ct('Erro de conexão. Tente de novo.')))
      .finally(() => setBusy(false));
  };

  const back = (
    <div style={{ display: 'flex', gap: '12px' }}>
      <button type="button" onClick={onHub} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>⇤ {ct('Hub online')}</button>
    </div>
  );

  // sem conta logada: convite pra criar conta GRÁTIS (o jogo abriu — sem paywall)
  if (!account) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {back}
        <Panel title={ct('Major da Semana')} accent="gold">
          <div style={{ textAlign: 'center', padding: '26px 10px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '34px' }}>🏟️</span>
            <b style={{ fontSize: '16px', color: 'var(--em-text)' }}>{ct('Entre pra jogar a Major da Semana')}</b>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--em-muted)', lineHeight: 1.5, maxWidth: '420px' }}>
              {ct('Torneio semanal (quarta a sábado) valendo coins — 70.000 pro campeão. Crie uma conta grátis pra entrar.')}
            </p>
            <a href="/" style={{ color: 'var(--rtm-link)', fontWeight: 700, fontSize: '13px' }}>{ct('Criar conta grátis / entrar →')}</a>
          </div>
        </Panel>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {back}
        <Panel title={ct('Major da Semana')} accent="gold">
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--em-muted)', fontSize: '13px' }}>{ct('Carregando a janela da semana…')}</div>
        </Panel>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {back}
        <Panel title={ct('Major da Semana')} accent="gold">
          <div style={{ textAlign: 'center', padding: '26px 10px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--em-red, #c0392b)', fontWeight: 700 }}>{error || ct('Não deu pra carregar o Major da Semana.')}</span>
            <Button variant="ghost" onClick={load}>{ct('Tentar de novo')}</Button>
          </div>
        </Panel>
      </div>
    );
  }

  const { window: win, entry, standings } = status;
  const games = entry ? entry.wins + entry.losses : 0;
  const startsMs = Date.parse(win.startsAt);
  const endsMs = Date.parse(win.endsAt);
  const myNick = (account?.nick ?? '').toLowerCase();
  const myPlace = myNick ? (standings.find((r) => r.nick.toLowerCase() === myNick)?.rank ?? 0) : 0;
  const myPrize = prizeForPlace(myPlace);

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {back}

      {/* cabeçalho da janela + countdown */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--em-border-strong)', background: '#0e141b' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/mirage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.18 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(216,169,67,.20), rgba(13,17,22,.86) 60%)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '18px', padding: '20px 24px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '34px' }}>🏟️</span>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--em-gold)', fontWeight: 800 }}>{ct('Weekend League · quarta a sábado')}</div>
            <h1 style={{ margin: '2px 0', fontFamily: 'inherit', fontSize: '26px', fontWeight: 800, color: '#f2f5f9' }}>{ct('Major da Semana')}</h1>
            <div style={{ fontSize: '12.5px', color: '#c2cad4' }}>{ct('Até 10 ranqueadas 1v1 de quarta a sábado. Quanto mais vitórias, maior a recompensa.')}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: '8px', background: 'rgba(9,12,16,.72)', border: `1px solid ${win.open ? '#29c47a' : 'var(--em-border-strong)'}` }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 800, color: win.open ? '#29c47a' : '#c2cad4' }}>
              {win.open ? ct('Janela aberta') : ct('Janela fechada')}
            </div>
            <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '17px', color: '#f2f5f9', whiteSpace: 'nowrap' }}>
              {win.open
                ? `${ct('fecha em')} ${fmtLeft(endsMs - now)}`
                : now < startsMs
                  ? `${ct('abre quarta · em')} ${fmtLeft(startsMs - now)}`
                  : ct('abre quarta')}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--em-red, #c0392b)', background: 'rgba(192,57,43,.08)', color: 'var(--em-text)', fontSize: '12.5px' }}>{error}</div>
      )}

      {/* convite pra vitalícia — só conta grátis (não trava nada aqui, o Major da
          Semana é 100% grátis). Mesma mensagem já usada no upsell in-game. */}
      {account && !account.paid && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px', borderRadius: '10px', background: 'rgba(216,169,67,.08)', border: '1px solid rgba(216,169,67,.3)' }}>
          <span style={{ flex: '1 1 320px', fontSize: '12.5px', color: 'var(--em-text)', lineHeight: 1.5 }}>
            {ct('Gostando do Major da Semana? No grátis, seu MMR ranqueado não conta pro ladder mundial — a conta vitalícia ativa o ladder de verdade e salva tudo na nuvem.')}{' '}
            <FounderCounter style={{ display: 'inline-block', marginLeft: 4 }} />
          </span>
          {onCreateAccount && (
            <button
              type="button"
              onClick={() => { setCheckoutSrc('wl-free'); onCreateAccount(); }}
              style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', background: 'var(--em-gold, #e8c170)', border: 'none', color: '#1a1205', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'inherit' }}
            >
              {ct('Criar conta vitalícia')} · R$20
            </button>
          )}
        </div>
      )}

      {/* meu run */}
      <Panel title={ct('Meu run')} accent="gold">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {entry ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {([[ct('Partidas'), `${games}/${WL_MAX_MATCHES}`, 'var(--em-text)'], [ct('Vitórias'), String(entry.wins), '#29c47a'], [ct('Derrotas'), String(entry.losses), 'var(--em-red, #c0392b)'], [ct('Saldo (SR)'), (entry.roundBalance >= 0 ? '+' : '') + entry.roundBalance, entry.roundBalance >= 0 ? '#29c47a' : 'var(--em-red, #c0392b)'], [ct('Divisão'), entry.division || '—', 'var(--em-gold)']] as [string, string, string][]).map(([k, v, c]) => (
                <div key={k} style={{ textAlign: 'center', padding: '8px 16px', borderRadius: '6px', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--em-muted)', fontWeight: 700 }}>{k}</div>
                  <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '17px', color: c }}>{v}</div>
                </div>
              ))}
              <div style={{ flex: 1, minWidth: '180px', fontSize: '12px', color: 'var(--rtm-faint)', lineHeight: 1.5 }}>
                {myPlace > 0
                  ? (myPlace <= 10
                      ? `${ct('Você está em')} ${myPlace}º — ${ct('valendo')} ${fmtCredits(myPrize)} ${ct('coins')}. ${ct('Suba mais na tabela!')}`
                      : `${ct('Você está em')} ${myPlace}º. ${ct('Entre no top 10 pra premiar!')}`)
                  : ct('Jogue ranqueada com a inscrição ativa: cada duelo confirmado te posiciona na tabela.')}
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--em-muted)', lineHeight: 1.5 }}>
              {win.open
                ? ct('Entre na fila, jogue ranqueada e suba na tabela: os prêmios vão pros 10 primeiros no fim da janela.')
                : ct('Você não participou desta janela. A inscrição abre junto com a janela, na quarta.')}
            </p>
          )}

          {/* prêmios por COLOCAÇÃO (top 10) — pagos no fim da janela */}
          <div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--em-muted)', fontWeight: 700, marginBottom: '8px' }}>{ct('Prêmios por colocação · top 10 (pagos no fim)')}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PLACEMENT_PRIZES.map((coins, i) => {
                const rank = i + 1;
                const mine = myPlace === rank;
                return (
                  <div key={rank} style={{
                    padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                    border: `1px solid ${mine ? 'var(--em-gold)' : rank <= 3 ? 'rgba(216,169,67,.5)' : 'var(--em-border-strong)'}`,
                    background: mine ? 'rgba(216,169,67,.18)' : 'transparent',
                    color: mine || rank <= 3 ? 'var(--em-gold)' : 'var(--em-muted)',
                  }}>
                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}º`} {fmtCredits(coins)} {ct('coins')}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ação principal: inscrever + JOGAR (puxa a fila ranqueada) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {win.open && onPlay && (
              <Button variant="gold" disabled={busy} onClick={doPlay}>{busy ? ct('Entrando…') : `⚡ ${entry ? ct('Jogar — puxar fila') : ct('Entrar e jogar')}`}</Button>
            )}
            {win.open && !entry && !onPlay && (
              <Button variant="gold" disabled={busy} onClick={doRegister}>{busy ? ct('Inscrevendo…') : ct('Inscrever-se no Major da Semana')}</Button>
            )}
            {!win.open && (
              <span style={{ fontSize: '12.5px', color: 'var(--rtm-faint)' }}>{ct('Janela fechada. Prêmios pagos pra quem terminou no top 10.')}</span>
            )}
          </div>
        </div>
      </Panel>

      {/* top 20 da janela */}
      <Panel title={ct('Classificação · top 10 leva prêmio')} accent="gold" flush>
        {standings.length === 0 ? (
          <div style={{ padding: '18px 16px', fontSize: '12.5px', color: 'var(--em-muted)' }}>{ct('Ninguém se inscreveu nesta janela ainda. Seja o primeiro!')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {standings.map((r, i) => {
                const you = !!myNick && r.nick.toLowerCase() === myNick;
                const prize = prizeForPlace(r.rank);
                return (
                  <tr key={r.nick + i} style={{ background: you ? 'rgba(216,169,67,.1)' : (i % 2 ? 'var(--em-panel-2)' : 'var(--em-panel)'), boxShadow: you ? 'inset 3px 0 0 var(--em-gold)' : prize > 0 ? 'inset 3px 0 0 rgba(216,169,67,.4)' : 'none' }}>
                    <td style={{ padding: '9px 14px', width: '44px', textAlign: 'center', fontFamily: 'inherit', fontWeight: 800, fontSize: '15px', color: i === 0 ? 'var(--em-gold)' : i < 3 ? 'var(--em-text)' : 'var(--rtm-faint)' }}>{r.rank}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <b style={{ fontFamily: 'inherit', fontSize: '14.5px', color: you ? 'var(--em-gold)' : 'var(--em-text)' }}>{r.nick}</b>
                        {you && <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: '#06121d', background: 'var(--em-gold)', padding: '2px 7px', borderRadius: '999px' }}>{ct('Você')}</span>}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'inherit', fontWeight: 800, fontSize: '12.5px', color: 'var(--em-gold)', whiteSpace: 'nowrap' }}>{prize > 0 ? `${fmtCredits(prize)} 🪙` : ''}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: 'var(--em-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#29c47a' }}>{r.wins}V</span> <span style={{ color: 'var(--rtm-faint)' }}>–</span> <span style={{ color: 'var(--em-red, #c0392b)' }}>{r.losses}D</span> <span title={ct('Saldo de rounds (desempate)')} style={{ color: 'var(--rtm-faint)', fontSize: '11px', fontWeight: 700 }}>· {r.roundBalance >= 0 ? '+' : ''}{r.roundBalance}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
