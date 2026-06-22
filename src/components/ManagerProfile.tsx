// Perfil do manager — fiel ao ProfileScreen.jsx do design: banner de identidade +
// KPIs + detalhes + status da conta. Usa o manager (local), a conta (paga?) e o
// MMR do ranking online (dados reais).
import { useEffect, useState, type CSSProperties } from 'react';
import { Flag } from './ui';
import { Button, Panel } from './ds';
import { DivBadge } from './Leaderboard';
import { LegalLinks } from './Legal';
import { deleteAccount, exportAccountData, type Account } from '../state/account';
import { fetchMyRank, type MyRank } from '../state/ranking';
import type { Manager } from '../state/manager';
import { ct } from '../state/career-i18n';

export function ManagerProfile({ manager, account, onBack, onEdit, onUpgrade, onAccountDeleted, onManageSaves }: {
  manager: Manager;
  account: Account | null;
  onBack: () => void;
  onEdit: () => void;
  onUpgrade: () => void;
  onAccountDeleted: () => void;
  onManageSaves?: () => void;
}) {
  const paid = !!account?.paid;
  const [rank, setRank] = useState<MyRank | null>(null);
  const [dataBusy, setDataBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [dataError, setDataError] = useState('');
  useEffect(() => { if (paid) void fetchMyRank(manager.nick).then(setRank); }, [paid, manager.nick]);

  const downloadData = async () => {
    if (dataBusy) return;
    setDataBusy(true);
    setDataError('');
    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `road-to-major-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : ct('Não foi possível exportar agora.'));
    } finally {
      setDataBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (dataBusy || deleteConfirm !== 'EXCLUIR' || !deletePassword) return;
    setDataBusy(true);
    setDataError('');
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (error) {
      setDataError(error instanceof Error ? error.message : ct('Não foi possível excluir a conta.'));
      setDataBusy(false);
    }
  };

  const games = rank ? rank.wins + rank.losses : 0;
  const winRate = games ? Math.round((rank!.wins / games) * 100) : 0;
  const KPI: [string, string | number, string][] = [
    ['MMR', paid ? (rank?.mmr ?? '—') : '★', 'var(--rtm-gold)'],
    ['Divisão', paid ? (rank?.division ?? '—') : '—', 'var(--rtm-text-strong)'],
    ['Vitórias', rank ? `${rank.wins}-${rank.losses}` : '0-0', 'var(--rtm-green-bright)'],
    ['Win rate', `${winRate}%`, 'var(--rtm-text-strong)'],
    ['Pico', paid ? (rank?.peak ?? '—') : '—', 'var(--rtm-gold)'],
  ];

  const cond: CSSProperties = { fontFamily: 'var(--font-cond)', fontWeight: 800 };
  return (
    <div className="rtm-fade-in" style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* banner de identidade */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--rtm-border)', boxShadow: 'var(--rtm-shadow-banner)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/mirage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.22 }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(115deg, ${manager.accent}2e 0%, rgba(13,17,22,.92) 60%)` }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 26px', flexWrap: 'wrap' }}>
          <span style={{ width: '84px', height: '84px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '30px', color: '#fff', background: `linear-gradient(160deg, ${manager.accent}, #20303f)`, boxShadow: 'inset 0 0 0 3px rgba(255,255,255,.14)', flexShrink: 0 }}>{manager.nick.slice(0, 2).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, ...cond, fontSize: '34px', color: 'var(--rtm-text-strong)', letterSpacing: '.5px' }}>{manager.nick}</h1>
              {paid
                ? <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '3px 9px', borderRadius: '999px' }}>{ct('★ Conta vitalícia · apoiador')}</span>
                : <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--rtm-dim)', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', padding: '3px 9px', borderRadius: '999px' }}>{account ? ct('Grátis') : ct('Convidado')}</span>}
              {paid && rank && <DivBadge d={rank.division} />}
            </div>
            <div style={{ fontSize: '13.5px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <Flag cc={manager.country} /> {manager.name || manager.nick}{manager.age ? `, ${manager.age} ${ct('anos')}` : ''} · {manager.org}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <Button variant="ghost" size="sm" onClick={onEdit}>{ct('✎ Editar perfil')}</Button>
            <Button variant="ghost" size="sm" onClick={onBack}>{ct('⇤ Menu')}</Button>
          </div>
        </div>
        {/* KPIs */}
        <div className="rtm-kpis" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '1px solid var(--rtm-border-soft)' }}>
          {KPI.map(([k, v, c], i) => (
            <div key={k} style={{ padding: '14px 16px', textAlign: 'center', borderLeft: i ? '1px solid var(--rtm-border-soft)' : 'none', background: 'rgba(18,22,27,.4)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>{ct(k)}</div>
              <div style={{ ...cond, fontSize: '22px', color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rtm-career-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '16px', alignItems: 'start' }}>
        {/* esquerda: ranking online */}
        <Panel title={ct('Ranking online')} accent="gold">
          {paid ? (
            rank ? (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div><div style={{ ...cond, fontSize: '40px', color: 'var(--rtm-gold)' }}>{rank.mmr}</div><div className="muted small">MMR · {rank.division}</div></div>
                <div><div style={{ ...cond, fontSize: '22px', color: 'var(--rtm-text-strong)' }}>#{rank.rank}</div><div className="muted small">{ct('no mundo')}</div></div>
                <div><div style={{ ...cond, fontSize: '22px', color: 'var(--rtm-green-bright)' }}>{rank.wins}-{rank.losses}</div><div className="muted small">{ct('vitórias')} · {winRate}% win rate</div></div>
                <div><div style={{ ...cond, fontSize: '22px', color: 'var(--rtm-gold)' }}>{rank.peak}</div><div className="muted small">{ct('MMR de pico')}</div></div>
              </div>
            ) : <p className="muted small" style={{ margin: 0 }}>{ct('Jogue uma partida online ranqueada pra entrar no ladder.')}</p>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>{ct('O ranking persistente faz parte da conta com save. No grátis você joga online, mas os pontos não persistem.')}</p>
          )}
        </Panel>

        {/* direita: detalhes + conta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Panel title={ct('Detalhes')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              {([['Nick', manager.nick], ['Nome', manager.name || '—'], ['Idade', manager.age ? `${manager.age} ${ct('anos')}` : '—'], ['País', manager.country.toUpperCase()], ['Organização', manager.org]] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', paddingBottom: '9px', borderBottom: '1px solid var(--rtm-border-soft)' }}>
                  <span style={{ color: 'var(--rtm-dim)' }}>{ct(k)}</span><b style={{ color: 'var(--rtm-text-strong)' }}>{v}</b>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={ct('Conta')} accent={paid ? 'gold' : 'blue'}>
            {paid ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(216,169,67,.16)', border: '1px solid var(--rtm-gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rtm-gold)', fontSize: '18px' }}>★</span>
                  <div><div style={{ ...cond, fontWeight: 700, color: 'var(--rtm-text-strong)', fontSize: '15px' }}>{ct('Conta vitalícia ativa')}</div><div style={{ fontSize: '11.5px', color: 'var(--rtm-dim)' }}>{account?.email}</div></div>
                </div>
                {[ct('Pagamento único, acesso pra sempre'), ct('Até 5 carreiras salvas na nuvem'), ct('Ranking e MMR salvos no online'), ct('Histórico completo de partidas')].map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '9px', fontSize: '13px', color: 'var(--rtm-dim)', padding: '4px 0' }}><span style={{ color: 'var(--rtm-gold)', fontWeight: 800 }}>✓</span>{f}</div>
                ))}
                {onManageSaves && <Button variant="gold" size="sm" style={{ width: '100%', marginTop: '12px' }} onClick={onManageSaves}>{ct('Gerenciar minhas carreiras')}</Button>}
                <div className="account-data-actions">
                  <Button variant="ghost" size="sm" onClick={downloadData} disabled={dataBusy}>{dataBusy ? ct('Aguarde…') : ct('Exportar meus dados')}</Button>
                  <button type="button" className="account-delete-link" onClick={() => { setDeleteOpen(true); setDataError(''); }}>{ct('Excluir conta')}</button>
                </div>
                {dataError && !deleteOpen && <p className="account-data-error">{dataError}</p>}
                <LegalLinks className="account-legal-links" />
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--rtm-dim)', lineHeight: 1.5 }}>{ct('Você joga tudo de graça com save no navegador. A conta opcional paga a infraestrutura para guardar dados na nuvem e persistir o ranking online.')}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ ...cond, fontSize: '30px', color: 'var(--rtm-gold)' }}>R$20</span>
                  <span style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>{ct('uma vez, sem mensalidade')}</span>
                </div>
                <Button variant="gold" style={{ width: '100%' }} onClick={onUpgrade}>{ct('Ativar save na nuvem')}</Button>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {deleteOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => !dataBusy && setDeleteOpen(false)}>
          <section className="account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onClick={(event) => event.stopPropagation()}>
            <span className="account-delete-kicker">{ct('AÇÃO IRREVERSÍVEL')}</span>
            <h2 id="delete-account-title">{ct('Excluir conta e dados na nuvem?')}</h2>
            <p>{ct('Serão apagados o acesso da conta, saves na nuvem, ranking e histórico associado. O jogo continuará gratuito e os saves que já estão neste navegador não serão apagados.')}</p>
            <p>{ct('Essa ação não solicita reembolso automaticamente. Faça o pedido de estorno antes da exclusão, quando aplicável.')}</p>
            <label>
              {ct('Senha atual')}
              <input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" />
            </label>
            <label>
              {ct('Digite')} <b>EXCLUIR</b> {ct('para confirmar')}
              <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value.toUpperCase())} autoComplete="off" />
            </label>
            {dataError && <p className="account-data-error">{dataError}</p>}
            <div className="account-delete-actions">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={dataBusy}>{ct('Cancelar')}</Button>
              <button type="button" className="account-delete-confirm" disabled={dataBusy || deleteConfirm !== 'EXCLUIR' || !deletePassword} onClick={confirmDelete}>
                {dataBusy ? ct('Excluindo…') : ct('Excluir definitivamente')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
