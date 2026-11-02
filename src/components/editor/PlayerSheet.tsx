// [fase 4 · frente EDITOR] Ficha de edição de um jogador (estilo editor do FM):
// identidade, time, os 28 atributos em três grupos, os 8 ocultos e CA/PA.
// O CA é sempre recalculado dos atributos; o PA nunca fica abaixo dele.
import { useMemo, useState } from 'react';
import type { Role, TeamSeason } from '../../types';
import { MECHANICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, type AttrKey } from '../../engine/attributes';
import { HIDDEN_KEYS, type HiddenKey } from '../../engine/attrs/model';
import { DB_LIMITS, ROLES, FREE_TEAM_ID } from '../../engine/mundo/editor';
import { Alert, Button, Sheet, Stat } from '../ds/index';
import { NumField } from './NumField';
import { CaPaStars } from '../career/CaPaStars';
import { ct } from '../../state/career-i18n';
import { useLang } from '../../state/i18n';
import {
  attrLabel, countryName, countryOptions, draftAttrs, draftOvr, hiddenLabel, regionLabel, type PlayerDraft,
} from './editorHelpers';
import type { DbIssue } from '../../engine/mundo/editor';

export interface PlayerSheetProps {
  open: boolean;
  mode: 'edit' | 'create';
  /** oficial (restaurar) ou novo (apagar) */
  kind: 'official' | 'added';
  edited: boolean;
  initial: PlayerDraft;
  teams: TeamSeason[];
  /** problemas que o rascunho criaria (a tela calcula validando a base com ele) */
  check: (d: PlayerDraft) => DbIssue[];
  onSave: (d: PlayerDraft) => void;
  onReset?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function PlayerSheet(props: PlayerSheetProps) {
  if (!props.open) return null;
  return <PlayerSheetBody {...props} />;
}

function PlayerSheetBody({ mode, kind, edited, initial, teams, check, onSave, onReset, onDelete, onClose }: PlayerSheetProps) {
  const { lang } = useLang();
  const [d, setD] = useState<PlayerDraft>(initial);
  const set = <K extends keyof PlayerDraft>(k: K, v: PlayerDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setA = (k: AttrKey, v: number) => setD((x) => ({ ...x, a: { ...x.a, [k]: v } }));
  const setH = (k: HiddenKey, v: number) => setD((x) => ({ ...x, h: { ...x.h, [k]: v } }));
  const x = draftAttrs(d);
  const ovr = draftOvr(d);
  const nickOk = d.nick.trim().length >= 1 && d.nick.trim().length <= DB_LIMITS.nickLen;
  const issues = useMemo(() => (nickOk ? check(d) : []), [check, d, nickOk]);
  const canSave = nickOk && issues.length === 0;
  const countries = useMemo(() => countryOptions(teams), [teams]);
  const teamOpts = useMemo(
    () => teams.filter((t) => t.id !== FREE_TEAM_ID).sort((a, b) => a.team.localeCompare(b.team, 'pt-BR')),
    [teams],
  );

  const numInput = (value: number, lo: number, hi: number, onChange: (v: number) => void, label: string, band = true, wide = false, id?: string) => (
    <NumField value={value} min={lo} max={hi} onChange={onChange} label={label} band={band} wide={wide} id={id} />
  );
  const group = (title: string, keys: AttrKey[]) => (
    <div className="edb-group">
      <h4>{title}</h4>
      {keys.map((k) => (
        <div key={k} className="edb-attr">
          <label htmlFor={`edb-a-${k}`}>{attrLabel(k)}</label>
          {numInput(d.a[k], 1, 20, (v) => setA(k, v), attrLabel(k), true, false, `edb-a-${k}`)}
        </div>
      ))}
    </div>
  );

  const title = mode === 'create' ? ct('Novo jogador') : `${ct('Editar jogador')} · ${initial.nick}`;
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
          {kind === 'added' && mode === 'edit' && onDelete && <Button variant="danger" onClick={onDelete}>{ct('Apagar jogador')}</Button>}
          <span className="edb-foot__spacer" />
          <Button variant="secondary" onClick={onClose}>{ct('Cancelar')}</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => onSave(d)}>{mode === 'create' ? ct('Criar jogador') : ct('Salvar')}</Button>
        </div>
      )}
    >
      <div className="edb-form">
        <label className="edb-field">
          <span>{ct('Nick')}</span>
          <input className="edb-input" value={d.nick} maxLength={DB_LIMITS.nickLen} aria-invalid={!nickOk} onChange={(e) => set('nick', e.target.value)} />
        </label>
        <label className="edb-field">
          <span>{ct('Nome')}</span>
          <input className="edb-input" value={d.name} maxLength={DB_LIMITS.nameLen} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="edb-field">
          <span>{ct('País')}</span>
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
          <span>{ct('Idade')}</span>
          {numInput(d.age, 15, 45, (v) => set('age', v), ct('Idade'), false, true)}
        </label>
        <label className="edb-field">
          <span>{ct('Função')}</span>
          <select className="edb-select" value={d.role} onChange={(e) => set('role', e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="edb-field">
          <span>{ct('Função secundária')}</span>
          <select className="edb-select" value={d.role2} onChange={(e) => set('role2', e.target.value as Role | '')}>
            <option value="">{ct('Nenhuma')}</option>
            {ROLES.filter((r) => r !== d.role).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="edb-field edb-field--wide">
          <span>{ct('Time')}</span>
          <select className="edb-select" value={d.teamId} onChange={(e) => set('teamId', e.target.value)}>
            <option value={FREE_TEAM_ID}>{ct('Sem time (free agent)')}</option>
            {teamOpts.map((t) => <option key={t.id} value={t.id}>{t.team} ({t.tag})</option>)}
          </select>
        </label>
      </div>
      {!nickOk && <p className="edb-err">{ct('O nick é obrigatório (até 24 letras).')}</p>}

      <div className="edb-sec">{ct('Habilidade')}</div>
      <div className="edb-capa">
        <Stat label="OVR" value={ovr} />
        <Stat label={ct('CA')} value={x.ca} hint={ct('recalculado')} />
        <label className="edb-field">
          <span>{ct('PA')} (1–200)</span>
          {numInput(d.pa, 1, 200, (v) => set('pa', v), 'PA', false, true)}
        </label>
        <CaPaStars ca={x.ca} paRange={[x.pa, x.pa]} />
        {d.pa < x.ca && <span className="edb-dim">{ct('PA abaixo do CA: vale o CA')}</span>}
      </div>

      <div className="edb-sec">{ct('Atributos')} (1–20)</div>
      <div className="edb-attrs">
        {group(ct('Mecânica'), MECHANICAL_KEYS)}
        {group(ct('Mental'), MENTAL_KEYS)}
        {group(ct('Físico'), PHYSICAL_KEYS)}
      </div>

      <div className="edb-sec">{ct('Ocultos')} (1–20)</div>
      <p className="edb-dim">{ct('No jogo, os ocultos só aparecem por relatório de olheiro e pelo comportamento.')}</p>
      <div className="edb-attrs edb-attrs--hidden">
        {HIDDEN_KEYS.map((k) => (
          <div key={k} className="edb-attr">
            <label htmlFor={`edb-h-${k}`}>{hiddenLabel(k)}</label>
            {numInput(d.h[k], 1, 20, (v) => setH(k, v), hiddenLabel(k), true, false, `edb-h-${k}`)}
          </div>
        ))}
      </div>

      {issues.length > 0 && (
        <Alert tone="danger" title={ct('Não dá para salvar assim')}>
          <ul className="edb-issues">
            {issues.slice(0, 6).map((i) => <li key={`${i.code}${i.ref}`} className="edb-issue" data-level="error"><b>{ct(i.text)}</b>{i.ref && <small>{i.ref}</small>}</li>)}
          </ul>
        </Alert>
      )}
    </Sheet>
  );
}
