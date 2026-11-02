// [fase 4 · frente EDITOR] Ficha de um time: nome, tag, país (região), cores,
// entrosamento, técnico e o elenco (ordem = titulares primeiro). Tirar alguém
// do elenco manda para o mercado livre; trazer alguém tira do time antigo.
import { useMemo, useState } from 'react';
import { ArrowUp, Plus, Sparkles, X } from 'lucide-react';
import type { CoachStyle, Player, TeamSeason } from '../../types';
import { playerOvr } from '../../engine/ratings';
import { DB_LIMITS, COACH_STYLES, FREE_TEAM_ID, isSpecialTeam, type DbIssue } from '../../engine/mundo/editor';
import { Alert, Button, Ovr, RoleChip, Sheet, Tag } from '../ds/index';
import { Flag, TeamBadge } from '../ui';
import { ct } from '../../state/career-i18n';
import { useLang } from '../../state/i18n';
import { NumField } from './NumField';
import { COACH_STYLE_PT, countryName, countryOptions, regionLabel, type TeamDraft } from './editorHelpers';

export interface TeamSheetProps {
  open: boolean;
  mode: 'edit' | 'create';
  kind: 'official' | 'added';
  edited: boolean;
  teamId: string;
  initial: TeamDraft;
  /** todos os times com a base aplicada (para achar jogadores e o time de origem) */
  teams: TeamSeason[];
  /** jogadores gerados no rascunho (time novo), ainda fora da base */
  check: (d: TeamDraft, generated: Player[]) => DbIssue[];
  makeGenerated: (n: number, country: string, taken: Set<string>) => Player[];
  onSave: (d: TeamDraft, generated: Player[]) => void;
  onReset?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function TeamSheet(props: TeamSheetProps) {
  if (!props.open) return null;
  return <TeamSheetBody {...props} />;
}

function TeamSheetBody({ mode, kind, edited, teamId, initial, teams, check, makeGenerated, onSave, onReset, onDelete, onClose }: TeamSheetProps) {
  const { lang } = useLang();
  const [d, setD] = useState<TeamDraft>(initial);
  const [generated, setGenerated] = useState<Player[]>([]);
  const [q, setQ] = useState('');
  const set = <K extends keyof TeamDraft>(k: K, v: TeamDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setCoach = (patch: Partial<TeamDraft['coach']>) => setD((x) => ({ ...x, coach: { ...x.coach, ...patch } }));

  const byId = useMemo(() => {
    const m = new Map<string, { p: Player; t: TeamSeason }>();
    for (const t of teams) for (const p of t.players) m.set(p.id, { p, t });
    return m;
  }, [teams]);
  const genById = useMemo(() => new Map(generated.map((p) => [p.id, p] as const)), [generated]);
  const playerOf = (id: string): Player | undefined => genById.get(id) ?? byId.get(id)?.p;
  const countries = useMemo(() => countryOptions(teams), [teams]);

  const nameOk = d.team.trim().length >= 1 && d.team.trim().length <= DB_LIMITS.teamNameLen;
  const tagOk = d.tag.trim().length >= 1 && d.tag.trim().length <= DB_LIMITS.tagLen;
  const coachOk = d.coach.nick.trim().length >= 1;
  const special = isSpecialTeam({ id: teamId });
  const sizeOk = special || (d.roster.length >= DB_LIMITS.rosterMin && d.roster.length <= DB_LIMITS.rosterMax);
  const baseOk = nameOk && tagOk && coachOk && sizeOk;
  const issues = useMemo(() => (baseOk ? check(d, generated) : []), [baseOk, check, d, generated]);
  const canSave = baseOk && issues.length === 0;

  const inRoster = new Set(d.roster);
  const needle = q.trim().toLowerCase();
  const results = needle.length < 2 ? [] : [...byId.values()]
    .filter(({ p }) => !inRoster.has(p.id) && (p.nick.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)))
    .slice(0, 12);
  const move = (i: number) => setD((x) => {
    if (i <= 0) return x;
    const r = [...x.roster];
    [r[i - 1], r[i]] = [r[i], r[i - 1]];
    return { ...x, roster: r };
  });
  const remove = (id: string) => {
    setD((x) => ({ ...x, roster: x.roster.filter((r) => r !== id) }));
    setGenerated((g) => g.filter((p) => p.id !== id));
  };
  const add = (id: string) => setD((x) => (x.roster.includes(id) ? x : { ...x, roster: [...x.roster, id] }));
  const generate = () => {
    const missing = Math.max(1, DB_LIMITS.rosterMin - d.roster.length);
    const taken = new Set([...byId.keys(), ...generated.map((p) => p.id)]);
    const fresh = makeGenerated(missing, d.country, taken);
    setGenerated((g) => [...g, ...fresh]);
    setD((x) => ({ ...x, roster: [...x.roster, ...fresh.map((p) => p.id)] }));
  };

  const title = mode === 'create' ? ct('Novo time') : `${ct('Editar time')} · ${initial.team}`;
  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={title}
      closeLabel={ct('Fechar')}
      footer={(
        <div className="edb-foot">
          {kind === 'official' && edited && onReset && <Button variant="ghost" onClick={onReset}>{ct('Restaurar original')}</Button>}
          {kind === 'added' && mode === 'edit' && onDelete && <Button variant="danger" onClick={onDelete}>{ct('Apagar time')}</Button>}
          <span className="edb-foot__spacer" />
          <Button variant="secondary" onClick={onClose}>{ct('Cancelar')}</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => onSave(d, generated.filter((p) => d.roster.includes(p.id)))}>
            {mode === 'create' ? ct('Criar time') : ct('Salvar')}
          </Button>
        </div>
      )}
    >
      {!special && (
        <>
          <div className="edb-form">
            <label className="edb-field edb-field--wide">
              <span>{ct('Nome do time')}</span>
              <input className="edb-input" value={d.team} maxLength={DB_LIMITS.teamNameLen} aria-invalid={!nameOk} onChange={(e) => set('team', e.target.value)} />
            </label>
            <label className="edb-field">
              <span>{ct('Tag')}</span>
              <input className="edb-input" value={d.tag} maxLength={DB_LIMITS.tagLen} aria-invalid={!tagOk} onChange={(e) => set('tag', e.target.value.toUpperCase())} />
            </label>
            <div className="edb-field">
              <span>{ct('Cores')}</span>
              <div className="edb-field__row">
                <input type="color" className="edb-color" value={d.colors[0]} aria-label={ct('Cor principal')} onChange={(e) => set('colors', [e.target.value, d.colors[1]])} />
                <input type="color" className="edb-color" value={d.colors[1]} aria-label={ct('Cor secundária')} onChange={(e) => set('colors', [d.colors[0], e.target.value])} />
                <TeamBadge tag={d.tag || '?'} colors={d.colors} size={30} />
              </div>
            </div>
            <label className="edb-field edb-field--wide">
              <span>{ct('País da organização')} · {regionLabel(d.country)}</span>
              <select className="edb-select" value={d.country} onChange={(e) => set('country', e.target.value)}>
                {!countries.some((g) => g.ccs.includes(d.country)) && <option value={d.country}>{countryName(d.country, lang)}</option>}
                {countries.map((g) => (
                  <optgroup key={g.region} label={g.region === 'other' ? ct('Outros') : regionLabel(g.ccs[0])}>
                    {g.ccs.map((cc) => <option key={cc} value={cc}>{countryName(cc, lang)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="edb-field">
              <span>{ct('Entrosamento')} (40–95)</span>
              <NumField value={d.teamwork} min={40} max={95} onChange={(v) => set('teamwork', v)} label={ct('Entrosamento')} wide />
            </label>
          </div>
          {(!nameOk || !tagOk) && <p className="edb-err">{ct('Nome e tag (até 5 letras) são obrigatórios.')}</p>}

          <div className="edb-sec">{ct('Técnico')}</div>
          <div className="edb-form">
            <label className="edb-field">
              <span>{ct('Nick')}</span>
              <input className="edb-input" value={d.coach.nick} maxLength={DB_LIMITS.nickLen} aria-invalid={!coachOk} onChange={(e) => setCoach({ nick: e.target.value })} />
            </label>
            <label className="edb-field">
              <span>{ct('Nome')}</span>
              <input className="edb-input" value={d.coach.name} maxLength={DB_LIMITS.nameLen} onChange={(e) => setCoach({ name: e.target.value })} />
            </label>
            <label className="edb-field">
              <span>{ct('Estilo')}</span>
              <select className="edb-select" value={d.coach.style} onChange={(e) => setCoach({ style: e.target.value as CoachStyle })}>
                {COACH_STYLES.map((s) => <option key={s} value={s}>{ct(COACH_STYLE_PT[s])}</option>)}
              </select>
            </label>
            <label className="edb-field">
              <span>{ct('Nota')} (50–99)</span>
              <NumField value={d.coach.rating} min={50} max={99} onChange={(v) => setCoach({ rating: v })} label={ct('Nota do técnico')} wide />
            </label>
          </div>
        </>
      )}

      <div className="edb-sec">{ct('Elenco')} · {d.roster.length}{special ? '' : `/${DB_LIMITS.rosterMax}`}</div>
      {!special && <p className="edb-dim">{ct('Os 5 primeiros são os titulares. Quem sai do elenco vai para o mercado livre.')}</p>}
      <ul className="edb-roster">
        {d.roster.map((id, i) => {
          const p = playerOf(id);
          if (!p) return null;
          const from = byId.get(id)?.t;
          const newcomer = !initial.roster.includes(id);
          return (
            <li key={id} data-starter={!special && i < 5}>
              <span className="edb-roster__n">{i + 1}</span>
              <span className="edb-who">
                <span className="edb-who__txt">
                  <b>{p.nick}</b>
                  <small><Flag cc={p.country} /> {p.name}{newcomer && from && from.id !== teamId ? ` · ${ct('vem de')} ${from.id === FREE_TEAM_ID ? ct('mercado livre') : from.tag}` : ''}{genById.has(id) ? ` · ${ct('gerado')}` : ''}</small>
                </span>
              </span>
              <RoleChip role={p.role} />
              <Ovr value={playerOvr(p)} size="sm" />
              {!special && <Button variant="ghost" size="sm" iconOnly aria-label={`${ct('Subir')} ${p.nick}`} disabled={i === 0} onClick={() => move(i)}><ArrowUp size={15} aria-hidden /></Button>}
              <Button variant="ghost" size="sm" iconOnly aria-label={`${ct('Tirar do elenco')} ${p.nick}`} onClick={() => remove(id)}><X size={15} aria-hidden /></Button>
            </li>
          );
        })}
      </ul>
      {!sizeOk && <p className="edb-err">{ct('O elenco precisa de 5 a 10 jogadores.')}</p>}

      {!special && (
        <div className="edb-pick">
          <div className="edb-field__row">
            <input className="edb-input edb-grow" placeholder={ct('Buscar jogador para o elenco…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={ct('Buscar jogador para o elenco')} />
            {mode === 'create' && <Button variant="secondary" icon={<Sparkles size={15} aria-hidden />} onClick={generate}>{ct('Gerar jovens')}</Button>}
          </div>
          {results.length > 0 && (
            <ul className="edb-pick__list">
              {results.map(({ p, t }) => (
                <li key={p.id}>
                  <span className="edb-who">
                    <span className="edb-who__txt">
                      <b>{p.nick}</b>
                      <small><Flag cc={p.country} /> {t.id === FREE_TEAM_ID ? ct('Sem time') : t.team}</small>
                    </span>
                  </span>
                  <RoleChip role={p.role} />
                  <Ovr value={playerOvr(p)} size="sm" />
                  <Button variant="secondary" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => { add(p.id); setQ(''); }}>{ct('Trazer')}</Button>
                </li>
              ))}
            </ul>
          )}
          {needle.length >= 2 && results.length === 0 && <span className="edb-dim">{ct('Nenhum jogador encontrado.')}</span>}
        </div>
      )}

      {issues.length > 0 && (
        <Alert tone="danger" title={ct('Não dá para salvar assim')}>
          <ul className="edb-issues">
            {issues.slice(0, 6).map((i) => <li key={`${i.code}${i.ref}`} className="edb-issue" data-level="error"><b>{ct(i.text)}</b>{i.ref && <small>{i.ref}</small>}</li>)}
          </ul>
        </Alert>
      )}
      {mode === 'edit' && kind === 'official' && edited && <Tag tone="accent">{ct('Editado nesta base')}</Tag>}
    </Sheet>
  );
}
