// "Major da Semana" — tela da Weekend League (fase B, cliente).
// Uma tela só: janela + countdown, meu run (X/10, W-L, faixas de recompensa,
// inscrever/resgatar) e o top-20 da janela. Os resultados entram sozinhos:
// toda ranqueada 1v1 jogada com a inscrição ativa é espelhada pro servidor
// (wlMirrorReport) e só conta quando os dois lados batem — aqui é leitura.
import { useCallback, useEffect, useState } from 'react';
import { Panel, Button } from '../ds';
import type { Account } from '../../state/account';
import {
  fetchWlStatus, wlRegister, wlClaim, WL_MAX_MATCHES,
  type WlStatus, type WlClaimOutcome,
} from '../../state/weekendLeague';
import { ct } from '../../state/career-i18n';
import { setCheckoutSrc, trackPaywallView } from '../../state/track';

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

export function WeekendLeague({ account, onHub }: { account: Account | null; onHub: () => void }) {
  const paid = !!account?.paid;
  const [status, setStatus] = useState<WlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<WlClaimOutcome | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!paid) { setLoading(false); return; }
    setLoading(true);
    setError('');
    fetchWlStatus()
      .then((s) => setStatus(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : ct('Erro de conexão. Tente de novo.')))
      .finally(() => setLoading(false));
  }, [paid]);
  useEffect(() => { load(); }, [load]);

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

  const doClaim = () => {
    if (!status || busy) return;
    setBusy(true);
    setError('');
    wlClaim(status.window.id)
      .then((r) => {
        setClaimed(r);
        setStatus((s) => (s && s.entry ? { ...s, entry: { ...s.entry, claimed: true } } : s));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : ct('Erro de conexão. Tente de novo.')))
      .finally(() => setBusy(false));
  };

  const back = (
    <div style={{ display: 'flex', gap: '12px' }}>
      <button type="button" onClick={onHub} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>⇤ {ct('Hub online')}</button>
    </div>
  );

  // funil: conta grátis viu a trava da vitalícia do Major da Semana
  useEffect(() => { if (!paid) trackPaywallView('wl-lock'); }, [paid]);

  // ------------------------------------------------ grátis: trava vitalícia
  if (!paid) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {back}
        <Panel title={ct('Major da Semana')} accent="gold">
          <div style={{ textAlign: 'center', padding: '26px 10px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '34px' }}>🔒</span>
            <b style={{ fontSize: '16px', color: 'var(--em-text)' }}>{ct('O Major da Semana é da conta vitalícia')}</b>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--em-muted)', lineHeight: 1.5, maxWidth: '420px' }}>
              {ct('Torneio semanal com recompensas em créditos e cartas do Ultimate. Ative a conta com save na nuvem para participar.')}
            </p>
            {/* valor concreto da vitalícia + âncora de preço (pagamento único) */}
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--em-gold, #e8c170)', lineHeight: 1.5, maxWidth: '420px', fontWeight: 600 }}>
              ✓ {ct('Major da Semana · Road to Pro completo · mercado entre managers · saves na nuvem em 5 slots')}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--em-text)', fontWeight: 800 }}>
              R$ 20 · {ct('pagamento único, acesso vitalício — sem mensalidade')}
            </p>
            <a href="/" onClick={() => setCheckoutSrc('wl-lock')} style={{ color: 'var(--rtm-link)', fontWeight: 700, fontSize: '13px' }}>{ct('Ativar conta →')}</a>
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

  const { window: win, entry, standings, rewardTiers } = status;
  const games = entry ? entry.wins + entry.losses : 0;
  const claimable = !!entry && !entry.claimed && entry.wins >= 1 && (!win.open || entry.runComplete);
  const startsMs = Date.parse(win.startsAt);
  const endsMs = Date.parse(win.endsAt);
  const myNick = (account?.nick ?? '').toLowerCase();

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {back}

      {/* cabeçalho da janela + countdown */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--em-border-strong)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/mirage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.2 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(216,169,67,.16), rgba(13,17,22,.92) 60%)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '18px', padding: '20px 24px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '34px' }}>🏟️</span>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--em-gold)', fontWeight: 800 }}>{ct('Weekend League · quinta a sábado')}</div>
            <h1 style={{ margin: '2px 0', fontFamily: 'inherit', fontSize: '26px', fontWeight: 800, color: 'var(--em-text)' }}>{ct('Major da Semana')}</h1>
            <div style={{ fontSize: '12.5px', color: 'var(--em-muted)' }}>{ct('Até 10 ranqueadas 1v1 de quinta a sábado. Quanto mais vitórias, maior a recompensa.')}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: '8px', background: 'rgba(18,22,27,.6)', border: `1px solid ${win.open ? '#29c47a' : 'var(--em-border-strong)'}` }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 800, color: win.open ? '#29c47a' : 'var(--em-muted)' }}>
              {win.open ? ct('Janela aberta') : ct('Janela fechada')}
            </div>
            <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '17px', color: 'var(--em-text)', whiteSpace: 'nowrap' }}>
              {win.open
                ? `${ct('fecha em')} ${fmtLeft(endsMs - now)}`
                : now < startsMs
                  ? `${ct('abre quinta · em')} ${fmtLeft(startsMs - now)}`
                  : ct('abre quinta')}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--em-red, #c0392b)', background: 'rgba(192,57,43,.08)', color: 'var(--em-text)', fontSize: '12.5px' }}>{error}</div>
      )}

      {/* meu run */}
      <Panel title={ct('Meu run')} accent="gold">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {entry ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {([[ct('Partidas'), `${games}/${WL_MAX_MATCHES}`, 'var(--em-text)'], [ct('Vitórias'), String(entry.wins), '#29c47a'], [ct('Derrotas'), String(entry.losses), 'var(--em-red, #c0392b)'], [ct('Divisão'), entry.division || '—', 'var(--em-gold)']] as [string, string, string][]).map(([k, v, c]) => (
                <div key={k} style={{ textAlign: 'center', padding: '8px 16px', borderRadius: '6px', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--em-muted)', fontWeight: 700 }}>{k}</div>
                  <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '17px', color: c }}>{v}</div>
                </div>
              ))}
              <div style={{ flex: 1, minWidth: '180px', fontSize: '12px', color: 'var(--rtm-faint)', lineHeight: 1.5 }}>
                {win.open && !entry.runComplete && !entry.claimed && ct('Jogue Ranked 1v1 com a inscrição ativa: cada duelo confirmado pelos dois lados entra sozinho no seu run.')}
                {entry.runComplete && !entry.claimed && ct('Run completo! Resgate sua recompensa.')}
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--em-muted)', lineHeight: 1.5 }}>
              {win.open
                ? ct('Inscreva-se para valer nesta semana. Depois é só jogar Ranked 1v1: os resultados contam automaticamente (quando os dois lados confirmam).')
                : ct('Você não participou desta janela. A inscrição abre junto com a janela, na quinta.')}
            </p>
          )}

          {/* faixas de recompensa */}
          <div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--em-muted)', fontWeight: 700, marginBottom: '8px' }}>{ct('Faixas de recompensa (paga a maior atingida)')}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {rewardTiers.map((t) => {
                const reached = !!entry && entry.wins >= t.minWins;
                return (
                  <div key={t.minWins} title={ct(t.name)} style={{
                    padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                    border: `1px solid ${reached ? 'var(--em-gold)' : 'var(--em-border-strong)'}`,
                    background: reached ? 'rgba(216,169,67,.14)' : 'transparent',
                    color: reached ? 'var(--em-gold)' : 'var(--em-muted)',
                  }}>
                    {reached ? '✓ ' : ''}{t.minWins}+ {ct('vit')} · {fmtCredits(t.credits)} {ct('créditos')}{t.card ? ` + ${ct('carta')} ${t.card === 'tots' ? 'TOTS' : ct('ouro rara')}` : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ação principal por estado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {win.open && !entry && (
              <Button variant="gold" disabled={busy} onClick={doRegister}>{busy ? ct('Inscrevendo…') : ct('Inscrever-se no Major da Semana')}</Button>
            )}
            {claimable && (
              <Button variant="gold" disabled={busy} onClick={doClaim}>{busy ? ct('Resgatando…') : ct('Resgatar recompensa')}</Button>
            )}
            {entry?.claimed && (
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#29c47a' }}>
                {ct('Resgatado ✓')}{claimed ? ` · +${fmtCredits(claimed.credits)} ${ct('créditos')} (${ct(claimed.tier.name)})` : ''}
              </span>
            )}
            {entry && !entry.claimed && !claimable && !win.open && entry.wins < 1 && (
              <span style={{ fontSize: '12.5px', color: 'var(--rtm-faint)' }}>{ct('Sem vitórias nesta janela — sem recompensa desta vez.')}</span>
            )}
          </div>
        </div>
      </Panel>

      {/* top 20 da janela */}
      <Panel title={ct('Classificação da semana · top 20')} accent="gold" flush>
        {standings.length === 0 ? (
          <div style={{ padding: '18px 16px', fontSize: '12.5px', color: 'var(--em-muted)' }}>{ct('Ninguém se inscreveu nesta janela ainda. Seja o primeiro!')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {standings.map((r, i) => {
                const you = !!myNick && r.nick.toLowerCase() === myNick;
                return (
                  <tr key={r.nick + i} style={{ background: you ? 'rgba(216,169,67,.1)' : (i % 2 ? 'var(--em-panel-2)' : 'var(--em-panel)'), boxShadow: you ? 'inset 3px 0 0 var(--em-gold)' : 'none' }}>
                    <td style={{ padding: '9px 14px', width: '44px', textAlign: 'center', fontFamily: 'inherit', fontWeight: 800, fontSize: '15px', color: i === 0 ? 'var(--em-gold)' : i < 3 ? 'var(--em-text)' : 'var(--rtm-faint)' }}>{r.rank}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <b style={{ fontFamily: 'inherit', fontSize: '14.5px', color: you ? 'var(--em-gold)' : 'var(--em-text)' }}>{r.nick}</b>
                        {you && <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: '#06121d', background: 'var(--em-gold)', padding: '2px 7px', borderRadius: '999px' }}>{ct('Você')}</span>}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--em-muted)', fontSize: '11.5px', fontWeight: 700 }}>{r.division}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: 'var(--em-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#29c47a' }}>{r.wins}V</span> <span style={{ color: 'var(--rtm-faint)' }}>–</span> <span style={{ color: 'var(--em-red, #c0392b)' }}>{r.losses}D</span>
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
