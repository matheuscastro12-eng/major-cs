// [fase 3 · frente VESTIÁRIO] Telas do vestiário estilo FM:
//   - LineupPanel (Time › Elenco): os 5 titulares e o banco (6º/7º). Clique num
//     jogador e depois noutro para trocar de lugar; status por jogador no card.
//   - DinamicaView (Time › Dinâmica): hierarquia e influência, grupos sociais,
//     reunião de equipe, felicidade detalhada por fator, conflitos e pedidos.
// A simulação decide (engine/clube/vestiario.ts); aqui só se mostra e se escolhe.
import { useState } from 'react';
import {
  Armchair, Crown, Handshake, Megaphone, MessageCircle, ShieldAlert, Sparkles, Swords, Users, Waves,
} from 'lucide-react';
import { Panel, Table, Avatar, RoleChip, Ovr, Tag, Stat, Button, EmptyState, type Column } from '../../components/ds/index';
import { Flag } from '../../components/ui';
import { ConditionBar } from './TrainingTab';
import { ct } from '../../state/career-i18n';
import {
  STATUS_LABEL, STATUS_DESC, SQUAD_STATUSES, INFLUENCE_LABEL, UNREST_LABEL, MEETING_LABEL, MEETING_DESC,
  type HierarchyEntry, type MeetingKind, type MeetingResult, type SocialGroup, type UnrestLevel,
} from '../../engine/clube/vestiario';
import type { SquadStatus } from '../../engine/clube/model';
import { FM_PERSONALITY_LABEL, type FmPersonality } from '../../engine/career/personality';
import { HAPPINESS_FACTOR_LABEL, HAPPINESS_FACTOR_ORDER, type HappinessBreakdown, type HappinessFactorKey } from '../../engine/career/happiness';
import type { Player, Role } from '../../types';
import '../../styles/vestiario.css';

export interface VestRow {
  id: string;
  player: Player;
  nick: string;
  role: Role;
  country: string;
  ovr: number;
  age: number;
  status: SquadStatus;
  starter: boolean;
  injured: boolean;
  fitness?: number;
  morale: number;
  happiness: HappinessBreakdown;
  unrest: UnrestLevel;
  share: number | null;
  expected: number;
  fm: FmPersonality;
  influence: HierarchyEntry;
  lang: string;
}

export interface VestModel {
  split: number;
  rows: VestRow[];
  starters: string[];
  bench: string[];
  locked: boolean;
  groups: SocialGroup[];
  isolated: string[];
  conflicts: { a: string; b: string; since: number; severity: number; mediatedAt?: number; chance: number }[];
  meetingAvailable: boolean;
  lastMeeting?: { split: number; kind: MeetingKind; outcome: number } | null;
  meetingPreview: Record<MeetingKind, MeetingResult>;
  results01: number;
}

export interface VestActions {
  setStatus: (id: string, s: SquadStatus) => void;
  swap: (a: string, b: string) => void;
  holdMeeting: (k: MeetingKind) => void;
  mediate: (a: string, b: string) => void;
  talk: (id: string) => void;
  open: (p: Player) => void;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const toneOf = (v: number) => (v >= 60 ? 'win' : v >= 45 ? 'warn' : 'loss') as 'win' | 'warn' | 'loss';

function StatusSelect({ row, onChange, compact }: { row: VestRow; onChange: (s: SquadStatus) => void; compact?: boolean }) {
  return (
    <select
      className={`vest-status${compact ? ' vest-status--compact' : ''}`}
      value={row.status}
      onChange={(e) => onChange(e.target.value as SquadStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${ct('Status no elenco')}: ${row.nick}`}
      title={ct(STATUS_DESC[row.status])}
    >
      {SQUAD_STATUSES.map((s) => <option key={s} value={s}>{ct(STATUS_LABEL[s])}</option>)}
    </select>
  );
}

function UnrestTag({ level }: { level: UnrestLevel }) {
  if (level <= 0) return null;
  return <Tag tone={level >= 3 ? 'loss' : 'warn'}>{ct(UNREST_LABEL[level])}</Tag>;
}

// ─── Escalação e banco (Elenco) ───────────────────────────────────────────
export function LineupPanel({ model, actions }: { model: VestModel; actions: VestActions }) {
  const [picked, setPicked] = useState<string | null>(null);
  const byId = new Map(model.rows.map((r) => [r.id, r]));
  const click = (id: string) => {
    if (model.locked) return;
    if (!picked) { setPicked(id); return; }
    if (picked !== id) actions.swap(picked, id);
    setPicked(null);
  };
  const card = (id: string | undefined, idx: number, bench: boolean) => {
    const r = id ? byId.get(id) : undefined;
    if (!r) {
      return (
        <div key={`empty-${idx}`} className="vest-slot vest-slot--empty">
          <Armchair size={16} aria-hidden />
          <span>{bench ? ct('Vaga no banco') : ct('Vaga')}</span>
          <small>{ct('Contrate na janela ou promova da academia')}</small>
        </div>
      );
    }
    const on = picked === r.id;
    const swapTarget = picked && picked !== r.id;
    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        className={`vest-slot${bench ? ' vest-slot--bench' : ''}${on ? ' is-picked' : ''}${swapTarget ? ' is-target' : ''}${r.injured ? ' is-injured' : ''}`}
        onClick={() => click(r.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(r.id); } }}
        aria-pressed={on}
        aria-label={`${r.nick} · ${bench ? ct('Banco') : ct('Titular')}${on ? ` · ${ct('selecionado: escolha com quem trocar')}` : ''}`}
      >
        <div className="vest-slot__top">
          <span className="vest-slot__pos">{bench ? `${ct('Banco')} ${idx + 6}` : `${idx + 1}`}</span>
          <Ovr value={r.ovr} />
        </div>
        <Avatar name={r.nick} role={r.role} size={44} />
        <button type="button" className="vest-slot__nick" onClick={(e) => { e.stopPropagation(); actions.open(r.player); }}>
          <Flag cc={r.country} /> {r.nick}
        </button>
        <div className="vest-slot__meta">
          <RoleChip role={r.role} />
          {r.injured && <Tag tone="loss">{ct('Lesionado')}</Tag>}
          <UnrestTag level={r.unrest} />
        </div>
        <StatusSelect row={r} onChange={(s) => actions.setStatus(r.id, s)} compact />
        <div className="vest-slot__play" title={`${ct('Joga')} ${pct(r.share)} · ${ct('espera')} ${pct(r.expected)}`}>
          <span>{ct('Tempo de jogo')}</span>
          <span className="vest-meter" style={{ ['--mark' as string]: `${Math.round(r.expected * 100)}%` }}>
            <i style={{ width: `${Math.round((r.share ?? (r.starter ? 1 : 0)) * 100)}%` }} className={r.share != null && r.share < r.expected - 0.15 ? 'is-low' : undefined} />
          </span>
          <b>{pct(r.share)}</b>
        </div>
        {r.fitness != null && (
          <div className="vest-slot__play">
            <span>{ct('Condição')}</span>
            <ConditionBar compact fitness={r.fitness} />
          </div>
        )}
      </div>
    );
  };
  const injuredStarters = model.starters.filter((id) => byId.get(id)?.injured);
  return (
    <Panel
      icon={<Users size={16} />}
      title={ct('Escalação e banco')}
      className="vest-lineup"
      actions={model.locked ? <Tag tone="warn">{ct('Roster lock: escalação travada')}</Tag> : picked ? (
        <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>{ct('Cancelar troca')}</Button>
      ) : undefined}
    >
      <p className="vest-note">
        {picked
          ? `${ct('Agora clique em quem entra no lugar de')} ${byId.get(picked)?.nick ?? ''}.`
          : ct('Os 5 titulares jogam as séries. Clique num jogador e depois noutro para trocar de lugar (vale a partir da próxima série). O banco entra sozinho se um titular se machucar.')}
      </p>
      <div className="vest-starters" aria-label={ct('Titulares')}>
        {Array.from({ length: 5 }, (_, i) => card(model.starters[i], i, false))}
      </div>
      <div className="vest-bench-label"><Armchair size={14} aria-hidden /> {ct('Banco')} <small>{ct('perde ritmo, moral e valor se ficar muito tempo sem jogar')}</small></div>
      <div className="vest-bench" aria-label={ct('Banco')}>
        {Array.from({ length: 2 }, (_, i) => card(model.bench[i], i, true))}
      </div>
      {injuredStarters.length > 0 && (
        <p className="vest-warn">
          <ShieldAlert size={14} aria-hidden /> {injuredStarters.map((id) => byId.get(id)?.nick).join(', ')} {ct('lesionado(s): na partida entra o reserva do banco (ou um jovem da base).')}
        </p>
      )}
    </Panel>
  );
}

// ─── Dinâmica ─────────────────────────────────────────────────────────────
const FACTOR_SHORT: Record<HappinessFactorKey, string> = {
  playTime: 'Jogo', performance: 'Desemp.', results: 'Result.', role: 'Papel', contract: 'Contrato', wage: 'Salário',
  promises: 'Promessas', bond: 'Vínculo', staff: 'Comissão', chemistry: 'Química', social: 'Grupo', ambition: 'Ambição',
};

function FactorCell({ v }: { v: number | undefined }) {
  if (v == null) return <span className="vest-dim">—</span>;
  return <span className={`vest-factor vest-factor--${toneOf(v)}`}>{v}</span>;
}

const FIT_LABEL: Record<MeetingResult['fit'], string> = { good: 'Deve funcionar', ok: 'Efeito pequeno', bad: 'Vai soar mal' };

export function DinamicaView({ model, actions }: { model: VestModel; actions: VestActions }) {
  const byId = new Map(model.rows.map((r) => [r.id, r]));
  const nick = (id: string) => byId.get(id)?.nick ?? id;
  const n = model.rows.length || 1;
  const avgMorale = Math.round(model.rows.reduce((s, r) => s + r.morale, 0) / n);
  const avgHappy = Math.round(model.rows.reduce((s, r) => s + r.happiness.overall, 0) / n);
  const langTop = model.groups.filter((g) => g.kind === 'lang').reduce((m, g) => Math.max(m, g.members.length), 1);
  const requests = model.rows.filter((r) => r.unrest >= 2);
  const factors = HAPPINESS_FACTOR_ORDER.filter((k) => model.rows.some((r) => r.happiness.factors[k] != null));

  const cols: Column<VestRow>[] = [
    {
      key: 'nick', header: ct('Jogador'), sort: (r) => r.nick.toLowerCase(),
      cell: (r) => (
        <button type="button" className="vest-who" data-peek={`career:${r.player.id}`} onClick={() => actions.open(r.player)}>
          <Avatar name={r.nick} role={r.role} size={28} />
          <span className="vest-who__txt"><b>{r.nick}</b><small>{ct(STATUS_LABEL[r.status])} · {ct(FM_PERSONALITY_LABEL[r.fm])}</small></span>
        </button>
      ),
    },
    { key: 'overall', header: ct('Satisfação'), num: true, sort: (r) => r.happiness.overall, cell: (r) => <b className={`vest-factor vest-factor--${toneOf(r.happiness.overall)}`}>{r.happiness.overall}</b> },
    { key: 'morale', header: ct('Moral'), num: true, sort: (r) => r.morale, cell: (r) => r.morale },
    ...factors.map((k): Column<VestRow> => ({
      key: k, header: <abbr title={ct(HAPPINESS_FACTOR_LABEL[k])}>{ct(FACTOR_SHORT[k])}</abbr>, num: true,
      sort: (r) => r.happiness.factors[k] ?? -1, cell: (r) => <FactorCell v={r.happiness.factors[k]} />,
    })),
    { key: 'unrest', header: ct('Situação'), sort: (r) => r.unrest, cell: (r) => (r.unrest > 0 ? <UnrestTag level={r.unrest} /> : <span className="vest-dim">{ct('Tranquilo')}</span>) },
  ];

  const tiers: HierarchyEntry['tier'][] = ['leader', 'high', 'influential', 'none'];
  const hier = [...model.rows].sort((a, b) => b.influence.score - a.influence.score);
  return (
    <div className="vest-tab">
      <div className="vest-stats">
        <Stat label={ct('Moral média')} value={<span className={`vest-tone--${toneOf(avgMorale)}`}>{avgMorale}</span>} hint={ct('puxada pelos influentes')} />
        <Stat label={ct('Satisfação média')} value={<span className={`vest-tone--${toneOf(avgHappy)}`}>{avgHappy}</span>} hint={ct('12 fatores, 60 = como esperado')} />
        <Stat label={ct('Coesão')} value={`${langTop}/${model.rows.length}`} hint={langTop >= 4 ? ct('line nacional') : langTop >= 3 ? ct('núcleo forte') : ct('line mista')} />
        <Stat label={ct('Conflitos')} value={<span className={`vest-tone--${model.conflicts.length ? 'loss' : 'win'}`}>{model.conflicts.length}</span>} hint={model.conflicts.length ? ct('resolva em Conflitos') : ct('vestiário em paz')} />
      </div>

      {requests.length > 0 && (
        <Panel icon={<MessageCircle size={16} />} title={ct('Pedidos do elenco')} className="vest-requests">
          <ul className="vest-list">
            {requests.map((r) => (
              <li key={r.id}>
                <span className="vest-list__who"><Avatar name={r.nick} role={r.role} size={28} /> <b>{r.nick}</b></span>
                <span className="vest-list__what">
                  {r.unrest >= 3 ? ct('Quer ser negociado: cansou do banco.') : ct('Quer conversar sobre tempo de jogo.')}
                  {' '}<small>{ct('Joga')} {pct(r.share)} · {ct('status promete')} {pct(r.expected)}</small>
                </span>
                <Button size="sm" onClick={() => actions.talk(r.id)}>{ct('Conversar')}</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="vest-grid">
        <Panel icon={<Crown size={16} />} title={ct('Hierarquia e influência')} flush>
          <p className="vest-note vest-note--pad">{ct('Liderança, tempo de casa, qualidade e status definem quem manda no vestiário. A moral dos influentes arrasta a do grupo, pra cima ou pra baixo.')}</p>
          {tiers.map((t) => {
            const list = hier.filter((r) => r.influence.tier === t);
            if (!list.length) return null;
            return (
              <div key={t} className={`vest-tier vest-tier--${t}`}>
                <div className="vest-tier__label">{ct(INFLUENCE_LABEL[t])}</div>
                {list.map((r) => (
                  <div key={r.id} className="vest-tier__row">
                    <button type="button" className="vest-who" onClick={() => actions.open(r.player)}>
                      <Avatar name={r.nick} role={r.role} size={28} />
                      <span className="vest-who__txt"><b>{r.nick}</b><small>{ct(FM_PERSONALITY_LABEL[r.fm])}</small></span>
                    </button>
                    <span className="vest-meter vest-meter--wide" title={`${ct('Liderança')} ${r.influence.parts.leadership} · ${ct('Tempo de casa')} ${r.influence.parts.tenure} · ${ct('Qualidade')} ${r.influence.parts.ability} · ${ct('Status')} ${r.influence.parts.status}`}>
                      <i style={{ width: `${r.influence.score}%` }} />
                    </span>
                    <b className="vest-num">{r.influence.score}</b>
                    <span className={`vest-mood vest-mood--${toneOf(r.morale)}`} title={`${ct('Moral')} ${r.morale}`}>{r.morale}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </Panel>

        <Panel icon={<Users size={16} />} title={ct('Grupos sociais')}>
          <p className="vest-note">{ct('Quem fala a mesma língua entrosa mais rápido (química). Jogador sem ninguém da língua dele num elenco com língua dominante fica isolado e infeliz.')}</p>
          <div className="vest-groups">
            {model.groups.length === 0 && <span className="vest-dim">{ct('Nenhum grupo formado: line totalmente mista.')}</span>}
            {model.groups.map((g) => (
              <div key={g.key} className={`vest-group vest-group--${g.kind}`}>
                <b>{g.kind === 'lang' ? ct(g.label) : ct(g.label)}</b>
                <span>{g.members.map(nick).join(' · ')}</span>
              </div>
            ))}
            {model.isolated.map((id) => (
              <div key={`iso-${id}`} className="vest-group vest-group--isolated">
                <b>{ct('Isolado')}</b>
                <span>{nick(id)} · {ct(byId.get(id)?.lang ?? '')}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel icon={<Megaphone size={16} />} title={ct('Reunião de equipe')} className="vest-meeting">
        <p className="vest-note">
          {model.meetingAvailable
            ? ct('Uma por split. O efeito depende do momento do time e da personalidade de cada um; com o líder a favor, a mensagem pega mais.')
            : ct('Você já reuniu o grupo neste split. A próxima reunião fica disponível no próximo split.')}
        </p>
        <div className="vest-meeting__opts">
          {(['praise', 'demand', 'calm'] as MeetingKind[]).map((k) => {
            const pv = model.meetingPreview[k];
            const Icon = k === 'praise' ? Sparkles : k === 'demand' ? Swords : Waves;
            return (
              <button key={k} type="button" className={`vest-meet vest-meet--${pv.fit}`} disabled={!model.meetingAvailable} onClick={() => actions.holdMeeting(k)}>
                <span className="vest-meet__head"><Icon size={16} aria-hidden /> <b>{ct(MEETING_LABEL[k])}</b></span>
                <small>{ct(MEETING_DESC[k])}</small>
                <span className="vest-meet__fit">
                  {ct(FIT_LABEL[pv.fit])}
                  {pv.leaderId && <em>{pv.leaderBacks ? `${ct('líder a favor')}: ${nick(pv.leaderId)}` : `${ct('líder não compra')}: ${nick(pv.leaderId)}`}</em>}
                </span>
              </button>
            );
          })}
        </div>
        {model.lastMeeting && (
          <p className="vest-note vest-note--last">
            {ct('Última reunião')}: <b>{ct(MEETING_LABEL[model.lastMeeting.kind])}</b> ({ct('Split')} {model.lastMeeting.split}) · {ct('moral média')} {model.lastMeeting.outcome >= 0 ? '+' : ''}{model.lastMeeting.outcome}
          </p>
        )}
      </Panel>

      <Panel icon={<Sparkles size={16} />} title={ct('Felicidade por fator')} flush className="vest-happy">
        <Table<VestRow>
          columns={cols}
          rows={model.rows}
          rowKey={(r) => r.id}
          defaultSort={{ key: 'overall', dir: 'asc' }}
          caption={ct('Felicidade por fator')}
          empty={ct('Sem jogadores no elenco.')}
        />
        <p className="vest-note vest-note--pad">{ct('60 = como esperado. Verde agrada, vermelho incomoda. Tempo de jogo compara o que ele joga com o que o status promete.')}</p>
      </Panel>

      <Panel icon={<Handshake size={16} />} title={ct('Conflitos')} className="vest-conflicts">
        {model.conflicts.length === 0 ? (
          <EmptyState title={ct('Vestiário em paz')}>{ct('Atritos nascem de temperamento curto, língua diferente, química baixa e má fase. Quando aparecer, medie ou venda um dos dois.')}</EmptyState>
        ) : (
          <ul className="vest-list">
            {model.conflicts.map((c) => {
              const tried = c.mediatedAt === model.split;
              return (
                <li key={`${c.a}|${c.b}`}>
                  <span className="vest-list__who"><b>{nick(c.a)}</b> × <b>{nick(c.b)}</b></span>
                  <span className="vest-list__what">
                    <Tag tone={c.severity >= 3 ? 'loss' : 'warn'}>{ct('Gravidade')} {c.severity}/3</Tag>
                    <small>{ct('desde o split')} {c.since} · {ct('custa moral aos dois e química à dupla')}</small>
                  </span>
                  <Button size="sm" disabled={tried} onClick={() => actions.mediate(c.a, c.b)}>
                    {tried ? ct('Mediado neste split') : `${ct('Mediar')} · ${Math.round(c.chance * 100)}%`}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
