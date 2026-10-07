// [Major espetáculo] Cerimônia do fim do Major: troféu (desenho próprio),
// confete, MVP, foto do elenco em cards e os números do torneio. Também quando
// você NÃO é campeão: vice com consolo, ou "o Major de X" (quem brilhou).
import { useEffect, useMemo } from 'react';
import { Flag, PlayerAvatar } from '../../../components/ui';
import type { Tournament } from '../../../types';
import { Arena, Confetti, Trophy } from './Art';
import { play, useReducedMotion } from './audio';
import { mt } from './i18n';
import { gradePicks, majorNumbers } from './logic';
import { SoundToggle, TeamChip, teamLookup } from './parts';
import { loadBook } from './store';
import './major.css';

type Placement = 'champion' | 'runnerup' | 'semi' | 'quarters' | 'playoffs' | 'swiss';

export interface CeremonyProps {
  result: { tournament: Tournament; placement: Placement; champion: boolean; rmrOut?: boolean };
  org: { name: string; tag: string } | null | undefined;
  split: number;
  /** campeão do Major pelo mundo (quando o seu Major acabou antes da final) */
  worldChampion?: { id: string; tag: string } | null;
}

const PLACE: Record<Placement, string> = {
  champion: 'Campeão do Major', runnerup: 'Vice-campeão', semi: 'Semifinalista', quarters: 'Quartas de final', playoffs: 'Top 16 · Stage 3', swiss: 'Fase suíça',
};

export function MajorCeremony({ result, org, split, worldChampion }: CeremonyProps) {
  const reduced = useReducedMotion();
  const t = result.tournament;
  const teamOf = useMemo(() => teamLookup(t.teams), [t.teams]);
  const nums = useMemo(() => majorNumbers(t.history, t.teams), [t]);
  const pk = useMemo(() => gradePicks(loadBook(org?.name ?? '', split), t.history), [org?.name, split, t.history]);
  const me = t.teams.find((x) => x.id === 'user');
  const champ = result.champion;
  const vice = result.placement === 'runnerup';
  const mvpExplicit = t.mvpId ? t.teams.flatMap((x) => x.players).find((p) => p.id === t.mvpId) : undefined;
  const mvp = mvpExplicit ? { nick: mvpExplicit.nick, country: mvpExplicit.country, teamId: t.teams.find((x) => x.players.some((p) => p.id === mvpExplicit.id))?.id ?? '' } : nums.mvp;
  const myBest = useMemo(() => {
    const n = majorNumbers(t.history, me ? [me] : [], 'user', 1);
    return n.mvp;
  }, [t.history, me]);
  useEffect(() => { play(champ ? 'fanfare' : 'consolation'); }, [champ]);
  if (result.rmrOut) return null;

  const hero = champ ? org?.name ?? '' : vice ? org?.name ?? '' : mvp?.nick ?? myBest?.nick ?? org?.name ?? '';
  const headline = champ
    ? mt('CAMPEÕES DO MAJOR')
    : vice ? mt('Vice-campeões do mundo')
      : `${mt('O Major de')} ${hero}`;
  const sub = champ
    ? mt('O troféu é de vocês. O nome entra para a história do CS.')
    : vice ? mt('Faltou uma série. Chegar à grande final de um Major é coisa de poucos — e a torcida viu.')
      : `${org?.name ?? ''}: ${mt(PLACE[result.placement])}. ${mt('O torneio teve dono, e a campanha fica no histórico da org.')}`;

  return (
    <section className={`mj-cer${champ ? ' champ' : vice ? ' vice' : ' other'}${reduced ? ' still' : ''}`} aria-label={mt('Cerimônia do Major')}>
      {champ && <Confetti count={reduced ? 0 : 56} off={reduced} />}
      {vice && <Confetti count={reduced ? 0 : 18} off={reduced} />}
      <Arena className="mj-cer-arena" live={champ} />
      <div className="mj-cer-top"><SoundToggle /></div>
      <div className="mj-cer-hero">
        {(champ || vice) && <Trophy size={champ ? 150 : 96} tone={champ ? 'gold' : 'silver'} className="mj-cer-trophy" />}
        <p className="mj-cer-kicker">{t.name.split(' · ')[0]}</p>
        <h2 className="mj-cer-title">{headline}</h2>
        <p className="mj-cer-sub">{sub}</p>
        {!champ && worldChampion && <p className="mj-cer-champ">{mt('Campeão:')} <b>{worldChampion.tag}</b></p>}
        {!champ && !worldChampion && t.championId && <p className="mj-cer-champ">{mt('Campeão:')} <TeamChip team={teamOf(t.championId)} /></p>}
      </div>

      <div className="mj-cer-grid">
        {mvp && (
          <article className="mj-cer-mvp">
            <span className="mj-cer-label">{mt('MVP do Major')}</span>
            <div className="mj-cer-mvp-row">
              <PlayerAvatar nick={mvp.nick} size={64} />
              <div>
                <b className="mj-cer-mvp-nick">{mvp.nick}</b>
                <small><Flag cc={mvp.country} /> {teamOf(mvp.teamId).tag}</small>
                {nums.mvp && (nums.mvp.nick === mvp.nick || (mvpExplicit && nums.mvp.id === mvpExplicit.id)) && <small>{mt('rating')} <b>{nums.mvp.rating.toFixed(2)}</b> · {nums.mvp.kills} {mt('abates')} · {nums.mvp.maps} {mt('mapas')}</small>}
              </div>
            </div>
          </article>
        )}
        <article className="mj-cer-nums">
          <span className="mj-cer-label">{mt('Números do torneio')}</span>
          <dl>
            <div><dt>{mt('Séries')}</dt><dd>{nums.series}</dd></div>
            <div><dt>{mt('Mapas')}</dt><dd>{nums.maps}</dd></div>
            <div><dt>{mt('Rounds')}</dt><dd>{nums.rounds}</dd></div>
            <div><dt>{mt('Prorrogações')}</dt><dd>{nums.overtimes}</dd></div>
            <div><dt>{mt('Sua campanha')}</dt><dd>{nums.userSeries.w}-{nums.userSeries.l} <small>({nums.userMaps.w}-{nums.userMaps.l} {mt('mapas')})</small></dd></div>
            <div><dt>Pick'em</dt><dd>{pk.score}/{pk.total}</dd></div>
          </dl>
          {nums.closest && <p className="mj-muted">{mt('Mapa mais apertado:')} {teamOf(nums.closest.a).tag} {nums.closest.score[0]}-{nums.closest.score[1]} {teamOf(nums.closest.b).tag} ({nums.closest.map})</p>}
          {nums.topFrag && <p className="mj-muted">{mt('Mais abates:')} {nums.topFrag.nick} ({nums.topFrag.kills})</p>}
        </article>
      </div>

      {me && (
        <div className="mj-cer-photo" aria-label={mt('Foto do elenco')}>
          <span className="mj-cer-label">{champ ? mt('A foto do título') : mt('O elenco no palco')}</span>
          <div className="mj-cer-cards">
            {me.players.slice(0, 5).map((p, i) => (
              <div key={p.id} className={`mj-pcard${myBest?.id === p.id ? ' star' : ''}`} style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
                <PlayerAvatar nick={p.nick} size={56} />
                <b>{p.nick}</b>
                <small><Flag cc={p.country} /> {p.role}</small>
                {myBest?.id === p.id && <em>{mt('destaque do time')}</em>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** campeão do Major no mundo (o seu Major pode ter acabado antes da final) */
export function majorWorldChampion(mundo: { results?: { eventId: string; placements: { teamId: string; place: number }[]; names?: Record<string, string> }[] } | null | undefined, split: number): { id: string; tag: string } | null {
  const ev = mundo?.results?.find((r) => r.eventId === `major:${split}`);
  const first = ev?.placements.find((p) => p.place === 1);
  if (!first || first.teamId === 'user') return null;
  return { id: first.teamId, tag: ev?.names?.[first.teamId] ?? (first.teamId.split(/[-_:]/)[0] || first.teamId).toUpperCase() };
}
