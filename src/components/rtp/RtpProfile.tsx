import { useState, type CSSProperties } from 'react';
import { ct } from '../../state/career-i18n';
import { Flag } from '../ui';
import { RtpIcon } from './RtpIcon';
import { DashCard } from '../career/DashCard';
import { PERSONALITY_LABEL } from '../../engine/career/personality';
import { archetypeDef } from '../../engine/rtp/createSave';
import { TIER_NAME } from '../../engine/rtp/league';
import { ATTR_LABEL } from '../../engine/attributes';
import {
  perkTreeFor, canUnlock, unlockPerk, perkById, TRAITS,
  xpToNext, legacyScore, legacyTier, MILESTONES, milestoneProgress, MAX_LEVEL,
  type PerkDef, type PerkEffect, type PerkTree,
} from '../../engine/rtp/perks';
import { legendBoard, LEGEND_MARKS } from '../../engine/rtp/legends';
import type { RoadToProSave } from '../../engine/rtp/types';

// Descreve um efeito de perk/trait em chips curtos e legíveis.
function effectChips(e: PerkEffect): string[] {
  const out: string[] = [];
  if (e.attr) for (const [k, v] of Object.entries(e.attr)) out.push(`+${v} ${ATTR_LABEL[k as keyof typeof ATTR_LABEL] ?? k}`);
  if (e.matchFactor) out.push(`${e.matchFactor.label} +${e.matchFactor.delta}%`);
  if (e.tiltResist) out.push(`Anti-tilt +${Math.round(e.tiltResist * 100)}%`);
  if (e.trainingXpMult) out.push(`+${Math.round((e.trainingXpMult - 1) * 100)}% XP treino`);
  if (e.fameMult) out.push(`+${Math.round((e.fameMult - 1) * 100)}% fama`);
  return out;
}

const TREE_LABEL: Partial<Record<PerkTree, string>> = { universal: ct('Universal') };
const placeShort = (p: number) =>
  p === 1 ? ct('Campeão') : p === 2 ? ct('Vice') : p === 3 ? ct('Semi') : p === 5 ? ct('3º grupo') : ct('4º grupo');

export function RtpProfile({ save, onExit, onReset, onUpdate, onRetire }: {
  save: RoadToProSave;
  onExit: () => void;
  onReset: () => void;
  onUpdate: (next: RoadToProSave) => void;
  onRetire: () => void;
}) {
  const { player, history } = save;
  const prog = player.progression;
  const arch = archetypeDef(player.archetype);
  const avgRating = history.matchesPlayed > 0 ? history.ratingSum / history.matchesPlayed : 0;
  const kd = history.deaths > 0 ? history.kills / history.deaths : history.kills;

  const maxed = prog.level >= MAX_LEVEL;
  const xpNext = xpToNext(prog.level);
  const xpPct = maxed ? 100 : Math.round((prog.xp / xpNext) * 100);
  const legacy = legacyScore(save);
  const ms = milestoneProgress(save);

  // Perks agrupados por trilha (universal + a da função do jogador).
  const tree = perkTreeFor(player.role);
  const groups: PerkTree[] = ['universal', player.role];
  const ownedTraits = new Set(prog.traits);
  // Micro-feedback do desbloqueio (iter45): o gasto do ponto ganhava só o flip
  // visual da linha — agora tem confirmação explícita (mesmo estilo do treino).
  const [perkFlash, setPerkFlash] = useState<string | null>(null);
  const doUnlock = (id: string) => {
    if (!canUnlock(save, id).ok) return;
    setPerkFlash(perkById(id)?.label ?? id);
    onUpdate(unlockPerk(save, id));
  };

  const STATS: { label: string; value: string }[] = [
    { label: ct('Partidas'), value: `${history.matchesPlayed}` },
    { label: ct('Rating médio'), value: avgRating.toFixed(2) },
    { label: 'K/D', value: kd.toFixed(2) },
    { label: 'MVPs', value: `${history.mvps}` },
    { label: ct('Pico OVR'), value: `${history.peakOvr}` },
    { label: ct('Ranking mundial'), value: typeof save.world.worldRank === 'number' ? `#${save.world.worldRank}` : '—' },
    { label: ct('Legado'), value: `${legacy}` },
  ];
  const accolades = history.accolades ?? [];
  const timeline = history.timeline ?? [];
  // Dinastia & Lendas (RTP v15): placar vs o panteão + recordes vivos.
  const board = legendBoard(save);
  const records = history.records;

  return (
    <>
      {/* Identidade — nível / XP / legado */}
      <DashCard title={ct('Identidade')}>
        <div className="rtp-id-head">
          <div className="rtp-id-ring" style={{ '--pct': xpPct } as CSSProperties}>
            <b>{prog.level}</b><span>LVL</span>
          </div>
          <div className="rtp-id-meta">
            <div className="rtp-id-legacy">
              <b>{legacyTier(legacy)}</b>
              <span>{ct('Legado')} {legacy}</span>
            </div>
            <div className="rtp-id-xp">
              <div className="rtp-id-xpbar"><span style={{ width: `${xpPct}%` }} /></div>
              <small>{maxed ? ct('Nível máximo') : `${prog.xp} / ${xpNext} XP`}</small>
            </div>
            {prog.perkPoints > 0 && (
              <div className="rtp-id-points"><RtpIcon name="spark" size={12} /> {prog.perkPoints} {ct('ponto(s) de perk pra gastar')}</div>
            )}
          </div>
        </div>
        <div className="rtp-bio-tags" style={{ marginTop: 10 }}>
          <span className="rtp-bio-tag"><Flag cc={player.country} /> <b>{player.nick}</b></span>
          <span className="rtp-bio-tag"><b>{player.role}</b>{player.role2 ? ` / ${player.role2}` : ''}</span>
          <span className="rtp-bio-tag">{player.age} {ct('anos')}</span>
          <span className="rtp-bio-tag">{PERSONALITY_LABEL[player.personality]}</span>
          <span className="rtp-bio-tag"><RtpIcon name={arch.icon} size={12} /> {arch.label}</span>
        </div>
      </DashCard>

      {/* Vestiário — confiança do coach + entrosamento com os colegas */}
      <DashCard title={ct('Vestiário')}>
        {(() => { const c = Math.round(save.life.rel.coach); const col = c >= 66 ? 'var(--rtp-win)' : c >= 40 ? 'var(--rtp-warn)' : 'var(--rtp-loss)'; return (
          <div className="rtp-vest-coach">
            <span className="rtp-vest-k"><RtpIcon name="users" size={13} /> {ct('Confiança do coach')}</span>
            <div className="rtp-vest-bar"><i style={{ width: `${c}%`, background: col }} /></div>
            <b style={{ color: col }}>{c}</b>
          </div>
        ); })()}
        <div className="rtp-vest-mates">
          {save.team.teammates.map((m) => {
            const chem = Math.round(save.team.chem[m.sourcePlayerId] ?? 30);
            return (
              <div key={m.id} className="rtp-vest-mate">
                <span className="rtp-vest-mate-id"><Flag cc={m.country} /> <b>{m.nick}</b> <span>{m.role}</span></span>
                <div className="rtp-vest-bar sm"><i style={{ width: `${chem}%`, background: chem >= 60 ? 'var(--rtp-win)' : chem >= 35 ? 'var(--rtp-signal)' : 'var(--rtp-ink-faint)' }} /></div>
                <span className="rtp-vest-chem">{chem}</span>
              </div>
            );
          })}
        </div>
        <div className="rtp-soon" style={{ marginTop: 8 }}>{ct('Fase quente sobe seu status; fria te leva pro banco. A confiança do coach protege a vaga.')}</div>
      </DashCard>

      {/* Árvore de perks */}
      <DashCard title={ct('Árvore de perks')} actions={<span className="rtp-id-pointchip">{prog.perkPoints} pt</span>}>
        {perkFlash && (
          <div className="rtp-feedback rtp-setup-flash"><b><RtpIcon name="spark" size={13} /> {ct('Perk desbloqueado')}: {perkFlash}</b></div>
        )}
        {groups.map((g) => {
          const perks = tree.filter((p) => p.tree === g);
          if (!perks.length) return null;
          return (
            <div key={g} className="rtp-perkgroup">
              <div className="rtp-perkgroup-h">{TREE_LABEL[g] ?? g}</div>
              {perks.map((p) => <PerkRow key={p.id} perk={p} owned={prog.perks.includes(p.id)} check={canUnlock(save, p.id)} onUnlock={() => doUnlock(p.id)} />)}
            </div>
          );
        })}
      </DashCard>

      {/* Traits — identidade emergente */}
      <DashCard title={ct('Traits — identidade')}>
        <div className="rtp-traits">
          {TRAITS.map((t) => {
            const on = ownedTraits.has(t.id);
            return (
              <span key={t.id} className={`rtp-trait${on ? '' : ' ghost'}`} title={t.desc}>
                <RtpIcon name={t.icon} size={13} /> {t.label}
              </span>
            );
          })}
        </div>
        <div className="rtp-soon" style={{ marginTop: 8 }}>{ct('Traits se revelam pelo seu estilo de jogo — você não escolhe, você conquista.')}</div>
      </DashCard>

      {/* Marcos da carreira */}
      <DashCard title={ct('Marcos da carreira')} actions={<span className="rtp-id-pointchip">{ms.done}/{ms.total}</span>}>
        <div className="rtp-mslist">
          {MILESTONES.map((m) => {
            const done = m.done(save);
            return (
              <div key={m.id} className={`rtp-ms${done ? ' done' : ''}`}>
                <span className="rtp-ms-check"><RtpIcon name={done ? 'check' : m.icon} size={13} /></span>
                {m.label}
              </div>
            );
          })}
        </div>
      </DashCard>

      {/* Placar de lendas (RTP v15) — sua carreira vs o panteão, ao vivo */}
      <DashCard title={ct('Placar de lendas')} actions={<span className="rtp-id-pointchip">#{board.heroPos} {ct('de')} {board.rows.length}</span>}>
        <div className="rtp-tl">
          {board.rows.map((r, i) => (
            <div key={r.isHero ? '__hero' : r.nick} className={`rtp-tl-row${r.isHero ? ' champ' : ''}`}>
              <span className="rtp-tl-when">#{i + 1}</span>
              <div className="rtp-tl-info">
                <b><Flag cc={r.country} /> {r.nick}{r.isHero ? ` — ${ct('você')}` : ''}</b>
                <span>{r.m.majors} Majors · {r.m.titles} {ct('títulos elite')} · {r.m.weeksAtOne} {ct('sem. em #1')} · {r.m.mvps} MVPs{r.era ? ` · ${r.era}` : ''}</span>
              </div>
              <span className="rtp-tl-place">{r.pts} {ct('pts')}</span>
            </div>
          ))}
        </div>
        <div className="rtp-soon" style={{ marginTop: 8 }}>{ct('Majors, títulos de elite, semanas em #1 e MVPs pontuam. Passe as lendas e entre pra história.')}</div>
      </DashCard>

      {/* Recordes vivos (RTP v15) — as sequências que fazem uma dinastia */}
      <DashCard title={ct('Recordes vivos')}>
        <div className="rtp-statgrid">
          {[
            { label: ct('Títulos elite seguidos'), value: `${records?.titleStreak ?? 0} · ${ct('recorde')} ${records?.bestTitleStreak ?? 0}` },
            { label: ct('Majors consecutivos'), value: `${records?.majorStreak ?? 0} · ${ct('recorde')} ${records?.bestMajorStreak ?? 0}` },
            { label: ct('Semanas seguidas em #1'), value: `${records?.weeksAtOne ?? 0} · ${ct('recorde')} ${records?.bestWeeksAtOne ?? 0}` },
            { label: ct('Temporadas invictas'), value: `${records?.perfectSeasons ?? 0}` },
          ].map((s) => (
            <div key={s.label} className="rtp-statcell">
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="rtp-mslist" style={{ marginTop: 10 }}>
          {LEGEND_MARKS.map((m) => {
            const done = records?.broken.includes(m.id) ?? false;
            return (
              <div key={m.id} className={`rtp-ms${done ? ' done' : ''}`}>
                <span className="rtp-ms-check"><RtpIcon name={done ? 'check' : 'fame'} size={13} /></span>
                {m.label} <small style={{ opacity: 0.7 }}>· {ct('marca de')} {m.holder}</small>
              </div>
            );
          })}
        </div>
      </DashCard>

      <DashCard title={ct('Carreira — números')}>
        <div className="rtp-statgrid">
          {STATS.map((s) => (
            <div key={s.label} className="rtp-statcell">
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </DashCard>

      <DashCard title={ct('Conquistas')}>
        {history.trophies.length === 0 && history.awards.length === 0 ? (
          <div className="rtp-soon"><RtpIcon name="trophy" size={16} /> {ct('Sem títulos ainda. Suba de divisão e brilhe nos Majors.')}</div>
        ) : (
          <div className="rtp-trophies">
            {history.trophies.map((t, i) => (
              <span key={`t${i}`} className="rtp-trophy"><RtpIcon name="trophy" size={13} /> {t}</span>
            ))}
            {history.awards.map((a, i) => (
              <span key={`a${i}`} className="rtp-trophy award"><RtpIcon name="fame" size={13} /> {a}</span>
            ))}
          </div>
        )}
      </DashCard>

      {/* Linha do tempo (RTP v14) — a história da carreira, campeonato a campeonato */}
      <DashCard title={ct('Linha do tempo')}>
        {timeline.length === 0 ? (
          <div className="rtp-soon"><RtpIcon name="calendar" size={16} /> {ct('Sua história começa no primeiro campeonato fechado.')}</div>
        ) : (
          <div className="rtp-tl">
            {[...timeline].reverse().slice(0, 18).map((t, i) => (
              <div key={`${t.season}-${t.event}-${i}`} className={`rtp-tl-row${t.place === 1 ? ' champ' : ''}${t.major ? ' major' : ''}`}>
                <span className="rtp-tl-when">T{t.season}{t.major ? ' · MAJOR' : ` · E${t.event}`}</span>
                <div className="rtp-tl-info">
                  <b>{t.eventName}</b>
                  <span>{t.teamTag} · {ct('rating')} {t.rating.toFixed(2)}</span>
                </div>
                <span className={`rtp-tl-place p-${t.place}`}>{t.place === 1 ? <RtpIcon name="trophy" size={11} /> : null} {placeShort(t.place)}{t.award ? ` · ${t.award.toUpperCase()}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </DashCard>

      {/* Vitrine de prêmios individuais (RTP v13) — MVP/EVP por campeonato */}
      <DashCard title={ct('Vitrine de prêmios')}>
        {accolades.length === 0 ? (
          <div className="rtp-soon"><RtpIcon name="fame" size={16} /> {ct('Sem prêmios individuais ainda. Seja o destaque de um campeonato.')}</div>
        ) : (
          <div className="rtp-cabinet">
            {[...accolades].reverse().map((a) => (
              <div key={a.id} className={`rtp-award a-${a.kind}`}>
                <span className={`rtp-award-medal m-${a.kind}`}>{a.kind.toUpperCase()}</span>
                <div className="rtp-award-info">
                  <b>{a.eventName}</b>
                  <span>T{a.season} · {TIER_NAME[a.tier]} · {ct('rating')} {a.rating.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashCard>

      <div className="rtp-footer-actions">
        <button type="button" className="rtp-btn-ghost" onClick={onExit}><RtpIcon name="chevL" size={15} /> {ct('Menu')}</button>
        {player.age >= 24 && <button type="button" className="rtp-btn-ghost" onClick={onRetire}><RtpIcon name="trophy" size={14} /> {ct('Anunciar aposentadoria')}</button>}
        <button type="button" className="rtp-btn-ghost rtp-btn-danger" onClick={onReset}>{ct('Recomeçar carreira')}</button>
      </div>
    </>
  );
}

// ── Linha de perk (bloqueado / pronto / ativo) ──────────────────────────────
function PerkRow({ perk, owned, check, onUnlock }: {
  perk: PerkDef; owned: boolean; check: { ok: boolean; reason?: string }; onUnlock: () => void;
}) {
  const state = owned ? 'owned' : check.ok ? 'ready' : 'locked';
  const req = perk.reqPerk ? perkById(perk.reqPerk) : undefined;
  return (
    <div className={`rtp-perk ${state}`}>
      <span className="rtp-perk-icon"><RtpIcon name={perk.icon} size={17} /></span>
      <div className="rtp-perk-body">
        <div className="rtp-perk-name"><b>{perk.label}</b> <span className="rtp-perk-tier">T{perk.tier}</span></div>
        <p className="rtp-perk-desc">{perk.desc}</p>
        <div className="rtp-perk-eff">
          {effectChips(perk.effect).map((c, i) => <span key={i} className="rtp-perk-chip">{c}</span>)}
        </div>
      </div>
      {owned ? (
        <span className="rtp-perk-badge"><RtpIcon name="check" size={13} /> {ct('Ativo')}</span>
      ) : (
        <button type="button" className="rtp-perk-btn" disabled={!check.ok} onClick={onUnlock}>
          {check.ok ? <>{ct('Desbloquear')} · 1 pt</> : (req && !check.ok && check.reason?.startsWith('Requer "') ? `↑ ${req.label}` : check.reason)}
        </button>
      )}
    </div>
  );
}
