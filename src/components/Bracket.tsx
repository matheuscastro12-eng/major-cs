import { getTeam } from '../engine/swiss';
import type { Pairing, Tournament, TTeam } from '../types';
import { TeamBadge } from './ui';
import { ct } from '../state/career-i18n';

interface MatchRef {
  pairing: Pairing;
  current: boolean;
}

// ---- bracket suíça estilo HLTV: colunas por record + caixas verde/vermelha ----

const SWISS_COLUMNS: string[][] = [
  ['0-0'],
  ['1-0', '0-1'],
  ['2-0', '1-1', '0-2'],
  ['2-1', '1-2'],
  ['2-2'],
];

function isRecord(label: string): boolean {
  return /^\d-\d$/.test(label);
}

function MatchCell({ t, item, onOpen, onPending }: { t: Tournament; item: MatchRef; onOpen?: (p: Pairing) => void; onPending?: (p: Pairing) => void }) {
  const a = getTeam(t, item.pairing.a);
  const b = getTeam(t, item.pairing.b);
  const r = item.pairing.result;
  const clickable = (!!r && !!onOpen) || (!r && item.current && !!onPending);
  return (
    <div
      className={`hb-match${item.current ? ' current' : ''}${clickable ? ' clickable' : ''}`}
      onClick={clickable ? () => r ? onOpen?.(item.pairing) : onPending?.(item.pairing) : undefined}
      title={clickable ? (r ? ct('Ver estatísticas da série') : ct('Jogar esta série')) : undefined}
    >
      <MatchTeamRow team={a} score={r?.mapScore[0]} loser={r ? r.winner === 1 : false} />
      <MatchTeamRow team={b} score={r?.mapScore[1]} loser={r ? r.winner === 0 : false} />
    </div>
  );
}

function MatchTeamRow({ team, score, loser }: { team: TTeam; score?: number; loser: boolean }) {
  return (
    <div className={`hb-row${loser ? ' loser' : ''}${team.isUser ? ' is-user' : ''}`}>
      <TeamBadge tag={team.tag} colors={team.colors} size={18} logoUrl={team.logoUrl} />
      <span className="hb-tag">{team.tag}</span>
      <span className="hb-score">{score ?? '–'}</span>
    </div>
  );
}

function ResultBox({ t, tone, records, label }: { t: Tournament; tone: 'adv' | 'elim'; records: string[]; label: string }) {
  const teamsByRecord = (rec: string): TTeam[] => {
    const [w, l] = rec.split('-').map(Number);
    return t.teams
      .filter((tm) => tm.wins === w && tm.losses === l && tm.status === (tone === 'adv' ? 'advanced' : 'eliminated'))
      .sort((a, b) => b.strength - a.strength);
  };
  return (
    <div className={`hb-resultbox ${tone}`}>
      <div className="hb-resultbox-title">{label}</div>
      <div className="hb-resultcols">
        {records.map((rec) => (
          <div key={rec} className="hb-resultcol">
            <div className="hb-reclabel">{rec.replace('-', ':')}</div>
            {teamsByRecord(rec).map((tm) => (
              <div key={tm.id} className={`hb-token ${tone}${tm.isUser ? ' is-user' : ''}`}>
                <TeamBadge tag={tm.tag} colors={tm.colors} size={18} logoUrl={tm.logoUrl} />
                <span>{tm.tag}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SwissBracket({ t, onOpen, onPending }: { t: Tournament; onOpen?: (p: Pairing) => void; onPending?: (p: Pairing) => void }) {
  const byRecord = new Map<string, MatchRef[]>();
  for (const h of t.history) {
    if (isRecord(h.pairing.label)) {
      if (!byRecord.has(h.pairing.label)) byRecord.set(h.pairing.label, []);
      byRecord.get(h.pairing.label)!.push({ pairing: h.pairing, current: false });
    }
  }
  if (t.phase === 'swiss') {
    for (const p of t.pairings) {
      if (isRecord(p.label)) {
        if (!byRecord.has(p.label)) byRecord.set(p.label, []);
        byRecord.get(p.label)!.push({ pairing: p, current: true });
      }
    }
  }

  return (
    <div className="hb-scroll">
      {SWISS_COLUMNS.map((col, ci) => (
        <div key={ci} className="hb-col">
          {col.map((rec) => {
            const matches = byRecord.get(rec) ?? [];
            return (
              <div key={rec} className="hb-group">
                <div className="hb-reclabel">{rec.replace('-', ':')}</div>
                {matches.length === 0 ? (
                  <div className="hb-match empty">
                    <div className="hb-row ghost">?</div>
                    <div className="hb-row ghost">?</div>
                  </div>
                ) : (
                  matches.map((m, i) => <MatchCell key={i} t={t} item={m} onOpen={onOpen} onPending={onPending} />)
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="hb-col results">
        <ResultBox t={t} tone="adv" records={['3-0', '3-1', '3-2']} label={ct('Classificados')} />
        <ResultBox t={t} tone="elim" records={['0-3', '1-3', '2-3']} label={ct('Eliminados')} />
      </div>
    </div>
  );
}

function PlayoffBracket({ t, onOpen, onPending }: { t: Tournament; onOpen?: (p: Pairing) => void; onPending?: (p: Pairing) => void }) {
  const all: MatchRef[] = [
    ...t.history.filter((h) => !isRecord(h.pairing.label)).map((h) => ({ pairing: h.pairing, current: false })),
    ...t.pairings.map((p) => ({ pairing: p, current: true })),
  ];
  const find = (label: string) => all.find((item) => item.pairing.label === label);
  const columns = [
    { title: ct('Quartas'), labels: ['QF1', 'QF2', 'QF3', 'QF4'] },
    { title: ct('Semifinal'), labels: ['SF1', 'SF2'] },
    { title: ct('Final'), labels: ['FINAL'] },
  ];
  const champion = t.championId ? getTeam(t, t.championId) : undefined;

  return (
    <div className="hb-scroll playoff">
      {columns.map((col) => (
        <div key={col.title} className="hb-col">
          <div className="hb-reclabel">{col.title}</div>
          <div className="hb-group playoff-group">
            {col.labels.map((label) => {
              const item = find(label);
              return item ? (
                <MatchCell key={label} t={t} item={item} onOpen={onOpen} onPending={onPending} />
              ) : (
                <div key={label} className="hb-match empty">
                  <div className="hb-row ghost">?</div>
                  <div className="hb-row ghost">?</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="hb-col">
        <div className="hb-reclabel">{ct('Campeão')}</div>
        <div className="hb-resultbox adv" style={{ minWidth: 130 }}>
          <div className="hb-resultbox-title">{ct('🏆 Troféu')}</div>
          {champion ? (
            <div className={`hb-token adv${champion.isUser ? ' is-user' : ''}`} style={{ fontSize: 13 }}>
              <TeamBadge tag={champion.tag} colors={champion.colors} size={24} logoUrl={champion.logoUrl} />
              <span>{champion.name}</span>
            </div>
          ) : (
            <div className="hb-row ghost">?</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TournamentBracket({ t, onOpen, onPending }: { t: Tournament; onOpen?: (p: Pairing) => void; onPending?: (p: Pairing) => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        {t.phase === 'swiss' ? ct('Fase suíça') : ct('Playoffs')}
        <span className="spacer" />
        <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {t.phase === 'swiss' ? ct('Clique numa série encerrada para ver as estatísticas') : ct('Mata-mata MD3')}
        </span>
      </div>
      <div className="panel-body">{t.phase === 'swiss' ? <SwissBracket t={t} onOpen={onOpen} onPending={onPending} /> : <PlayoffBracket t={t} onOpen={onOpen} onPending={onPending} />}</div>
    </div>
  );
}
