// [fase 4 · frente EDITOR] Escolha da base de dados na criação da Carreira.
// Oficial (elencos reais + ajustes da equipe) ou uma base do editor. A base
// escolhida é copiada para o save (mundo.database) e fica congelada: editar ou
// apagar a base depois não muda esta Carreira. Só aparece antes de fundar.
import { Database, PencilRuler } from 'lucide-react';
import { Alert, Button, CardButton, Panel, Tag } from '../ds/index';
import { ct } from '../../state/career-i18n';
import type { StoredDb } from '../../state/customDb';
import type { CustomDatabase } from '../../engine/mundo/model';
import { databaseSummary, type CareerDbStatus } from '../../engine/mundo/editor';
import '../../styles/editor.css';

export function summaryLine(db: CustomDatabase): string {
  const s = databaseSummary(db);
  const parts: string[] = [];
  if (s.playerEdits) parts.push(`${s.playerEdits} ${s.playerEdits === 1 ? ct('jogador editado') : ct('jogadores editados')}`);
  if (s.teamEdits) parts.push(`${s.teamEdits} ${s.teamEdits === 1 ? ct('time editado') : ct('times editados')}`);
  if (s.addedPlayers) parts.push(`${s.addedPlayers} ${s.addedPlayers === 1 ? ct('jogador novo') : ct('jogadores novos')}`);
  if (s.addedTeams) parts.push(`${s.addedTeams} ${s.addedTeams === 1 ? ct('time novo') : ct('times novos')}`);
  return parts.length ? parts.join(' · ') : ct('Sem alterações ainda');
}

export function CareerDatabaseChoice({ databases, selectedId, status, onSelect, onOpenEditor }: {
  databases: StoredDb[];
  selectedId: string | null;
  status: CareerDbStatus;
  onSelect: (db: CustomDatabase | null) => void;
  onOpenEditor?: () => void;
}) {
  const gone = !!selectedId && (status === 'missing' || status === 'invalid');
  return (
    <Panel
      className="edb-choice"
      icon={<Database size={16} />}
      title={ct('Base de dados do mundo')}
      actions={onOpenEditor ? <Button size="sm" variant="ghost" icon={<PencilRuler size={15} aria-hidden />} onClick={onOpenEditor}>{ct('Abrir editor')}</Button> : undefined}
    >
      <p className="edb-note">{ct('Escolha antes de assumir um clube. A base fica congelada nesta carreira: editar ou apagar a base depois não muda o que já começou.')}</p>
      {gone && <Alert tone="warn">{ct('A base escolhida não está mais neste aparelho ou ficou inválida. Esta carreira usa a base oficial.')}</Alert>}
      <div className="edb-choice__grid" role="radiogroup" aria-label={ct('Base de dados do mundo')}>
        <CardButton role="radio" aria-checked={!selectedId || gone} selected={!selectedId || gone} onClick={() => onSelect(null)} className="edb-choice__card">
          <b>{ct('Oficial')}</b>
          <small>{ct('Elencos reais de setembro de 2026 com os ajustes da equipe do Road to Major')}</small>
        </CardButton>
        {databases.map(({ db, check }) => (
          <CardButton
            key={db.id}
            role="radio"
            aria-checked={selectedId === db.id && !gone}
            selected={selectedId === db.id && !gone}
            disabled={!check.ok}
            onClick={() => check.ok && onSelect(db)}
            className="edb-choice__card"
          >
            <b>{db.name} {!check.ok && <Tag tone="loss">{check.errors.length} {check.errors.length === 1 ? ct('erro') : ct('erros')}</Tag>}</b>
            <small>{check.ok ? summaryLine(db) : ct('Corrija os erros no editor para usar esta base')}</small>
          </CardButton>
        ))}
      </div>
      {databases.length === 0 && onOpenEditor && (
        <p className="edb-note edb-note--end">{ct('Quer mexer em jogadores, times e elencos antes de começar? Crie uma base no editor.')}</p>
      )}
    </Panel>
  );
}
