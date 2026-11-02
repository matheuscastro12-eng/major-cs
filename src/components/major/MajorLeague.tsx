// MAJOR COM AMIGOS — liga privada do Pick'em. Todo mundo palpita o MESMO
// Major (seed da liga). O servidor guarda membros e palpites; o resultado e a
// pontuação saem do engine aqui no cliente, iguais para todos.
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eye, LogIn, Plus, RefreshCw, Send, Users } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import {
  decodePicks, encodePicks, picksComplete, scorePicks, simulateMajor,
  type MajorData, type MajorPicks,
} from '../../engine/majorSingapore';
import {
  createLeague, forgetLeague, getLeague, joinLeague, loadSavedLeagues, revealLeague, saveLeague, sendLeaguePicks,
  type LeagueResult, type LeagueView, type SavedLeague,
} from '../../state/majorLeagueApi';
import { useAccount } from '../../state/account';
import { shareUrl } from '../../state/shareLink';
import { track } from '../../state/track';
import { Alert, Button, EmptyState, Panel, Table, Tag, type Column } from '../ds';
import { MajorResultView } from './MajorResultView';
import type { MajorKey } from './majorStrings';

const D = data as unknown as MajorData;
type T = (k: MajorKey) => string;

function readLeagueParam(): string {
  try { return (new URLSearchParams(window.location.search).get('liga') ?? '').toUpperCase().slice(0, 6); } catch { return ''; }
}

interface RankRow { nick: string; me: boolean; points: number | null; detail: string }

export function MajorLeague({ t, picks, onEditPicks }: { t: T; picks: MajorPicks; onEditPicks: () => void }) {
  const { account } = useAccount();
  const [saved, setSaved] = useState<SavedLeague[]>(loadSavedLeagues);
  const [invited] = useState(readLeagueParam);
  const [nick, setNick] = useState(saved[0]?.nick ?? account?.nick ?? '');
  const [code, setCode] = useState(invited);
  const [name, setName] = useState('');
  const [view, setView] = useState<LeagueView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const done = (r: LeagueResult, nk: string) => {
    setBusy(false);
    if (!r.ok) { setErr(r.error || t('leagueOffline')); return; }
    setErr('');
    setView(r.view);
    saveLeague({ code: r.view.league.code, nick: nk });
    setSaved(loadSavedLeagues());
  };
  const run = (p: Promise<LeagueResult>, nk = nick) => { setBusy(true); setErr(''); void p.then((r) => done(r, nk)); };

  // reabre a última liga (ou a do convite, se já estiver nela)
  useEffect(() => {
    const target = saved.find((s) => s.code === invited) ?? (invited ? null : saved[0]);
    if (target) { setNick(target.nick); run(getLeague(target.code), target.nick); }
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const complete = picksComplete(picks);
  const myCode = complete ? encodePicks(D, picks) : '';
  const me = view?.entries.find((e) => e.me);
  const sent = !!me && me.picks === myCode && complete;

  const result = useMemo(() => (view?.league.revealed ? simulateMajor(D, view.league.seed) : null), [view]);
  const ranking: RankRow[] = useMemo(() => {
    if (!view) return [];
    return view.entries.map((e) => {
      const p = e.picks ? decodePicks(D, e.picks) : null;
      if (!result || !p) return { nick: e.nick, me: e.me, points: null, detail: e.complete ? t('ready') : t('pending') };
      const s = scorePicks(p, result);
      return { nick: e.nick, me: e.me, points: s.points, detail: `S1 ${s.stage[0]} · S2 ${s.stage[1]} · S3 ${s.stage[2]} · PO ${s.playoff}/7${s.champion ? ` · ${t('champion')}` : ''}` };
    }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
  }, [view, result, t]);

  const cols: Column<RankRow>[] = [
    { key: 'pos', header: '#', num: true, cell: (_r, i) => (result ? i + 1 : '—') },
    { key: 'nick', header: 'Nick', cell: (r) => r.nick },
    { key: 'detail', header: '', dim: true, cell: (r) => r.detail },
    { key: 'pts', header: t('points'), num: true, cell: (r) => (r.points ?? '—') },
  ];

  const invite = async () => {
    if (!view) return;
    const link = shareUrl(`/major-singapore?liga=${view.league.code}`, 'major-league');
    try {
      await navigator.clipboard.writeText(`${t('leagueTitle')} · ${view.league.name}\n${t('leagueCode')}: ${view.league.code}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      track('major_league_invite', {});
    } catch { /* sem clipboard */ }
  };

  if (!view) {
    return (
      <div className="msg-stack">
        <Panel title={t('leagueTitle')}>
          <p className="msg-muted">{t('leagueIntro')}</p>
          {err && <Alert tone="danger">{err}</Alert>}
          <div className="msg-form">
            <label className="msg-field"><span>{t('nick')}</span>
              <input value={nick} maxLength={24} autoComplete="nickname" onChange={(e) => setNick(e.target.value)} />
            </label>
          </div>
          <div className="msg-league-forms">
            <form className="msg-form" onSubmit={(e) => { e.preventDefault(); run(joinLeague(code.trim().toUpperCase(), nick.trim())); track('major_league_join', {}); }}>
              <label className="msg-field"><span>{t('leagueCode')}</span>
                <input value={code} maxLength={6} autoCapitalize="characters" spellCheck={false} className="msg-code" onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </label>
              <Button type="submit" variant="primary" icon={<LogIn size={16} aria-hidden />} disabled={busy || code.trim().length !== 6 || nick.trim().length < 3}>{t('joinLeague')}</Button>
            </form>
            <form className="msg-form" onSubmit={(e) => { e.preventDefault(); run(createLeague(nick.trim(), name.trim(), myCode || undefined)); track('major_league_create', {}); }}>
              <label className="msg-field"><span>{t('leagueName')}</span>
                <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </label>
              <Button type="submit" icon={<Plus size={16} aria-hidden />} disabled={busy || nick.trim().length < 3}>{t('createLeague')}</Button>
            </form>
          </div>
        </Panel>
        {saved.length > 0 ? (
          <Panel title={t('members')}>
            <div className="msg-toolbar">
              {saved.map((s) => (
                <Button key={s.code} size="sm" icon={<Users size={16} aria-hidden />} onClick={() => { setNick(s.nick); run(getLeague(s.code), s.nick); }}>{s.code}</Button>
              ))}
            </div>
          </Panel>
        ) : <EmptyState icon={<Users size={28} />} title={t('leagueTitle')}>{t('leagueEmpty')}</EmptyState>}
      </div>
    );
  }

  const lg = view.league;
  return (
    <div className="msg-stack">
      <Panel
        title={`${lg.name} · ${lg.code}`}
        accent="gold"
        actions={(
          <div className="msg-toolbar">
            <Button size="sm" icon={copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} onClick={invite}>{copied ? t('copied') : t('copyCode')}</Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={16} aria-hidden />} disabled={busy} onClick={() => run(getLeague(lg.code))}>{t('refresh')}</Button>
          </div>
        )}
      >
        {err && <Alert tone="danger">{err}</Alert>}
        <p className="msg-muted">{t('leagueMajorNote')}</p>
        {!lg.revealed && (
          <div className="msg-toolbar">
            {complete
              ? <Button variant="primary" icon={sent ? <Check size={16} aria-hidden /> : <Send size={16} aria-hidden />} disabled={busy || sent} onClick={() => { run(sendLeaguePicks(lg.code, nick, myCode)); track('major_league_picks', {}); }}>{sent ? t('picksSent') : t('sendPicks')}</Button>
              : <Button onClick={onEditPicks}>{t('needComplete')}</Button>}
            {lg.isOwner && <Button variant="ghost" icon={<Eye size={16} aria-hidden />} disabled={busy} onClick={() => { if (window.confirm(t('revealHint'))) run(revealLeague(lg.code)); }}>{t('reveal')}</Button>}
          </div>
        )}
        {lg.revealed && <Tag tone="achievement">{t('champOfLeague')}: {D.teams.find((x) => x.id === result?.playoffs.champion)?.name}</Tag>}
      </Panel>

      <Panel title={lg.revealed ? t('ranking') : `${t('members')} (${view.entries.length})`}>
        <Table columns={cols} rows={ranking} rowKey={(r) => r.nick} isMe={(r) => r.me} caption={t('ranking')} zebra />
        {lg.revealed && <p className="msg-muted">{t('scoreRule')}</p>}
      </Panel>

      {result && <MajorResultView t={t} result={result} picks={me?.picks ? decodePicks(D, me.picks) ?? undefined : undefined} />}

      <div className="msg-toolbar">
        <Button size="sm" variant="ghost" onClick={() => { forgetLeague(lg.code); setSaved(loadSavedLeagues()); setView(null); }}>{t('leaveLeague')}</Button>
      </div>
    </div>
  );
}
