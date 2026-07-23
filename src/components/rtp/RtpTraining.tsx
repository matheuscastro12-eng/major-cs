import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { DashCard } from '../career/DashCard';
import { RtpSetup } from './RtpSetup';
import { MiniGameModal } from './MiniGameModal';
import {
  MECHANICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, ATTR_LABEL, attrColor, type AttrKey,
} from '../../engine/attributes';
import {
  applyAction, WEEKLY_ACTIONS, MIN_TRAIN_ENERGY,
  type ActionKind, type ActionFeedback,
} from '../../engine/rtp/weekly';
import { gameForAction, type MiniGameDef } from '../../engine/rtp/minigames';
import type { RoadToProSave } from '../../engine/rtp/types';

const ATTR_GROUPS: { label: string; keys: AttrKey[] }[] = [
  { label: ct('Mecânica'), keys: MECHANICAL_KEYS },
  { label: ct('Mental'), keys: MENTAL_KEYS },
  { label: ct('Físico'), keys: PHYSICAL_KEYS },
];

export function RtpTraining({ save, onUpdate }: {
  save: RoadToProSave;
  onUpdate: (next: RoadToProSave) => void;
}) {
  const { player, life, world } = save;
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showAttrs, setShowAttrs] = useState(false);
  const [game, setGame] = useState<{ def: MiniGameDef; kind: ActionKind } | null>(null);

  const noActions = world.actionsLeft <= 0;
  const tooTired = life.energy < MIN_TRAIN_ENERGY;
  const isTrain = (k: ActionKind) => k.startsWith('train:');

  // Aplica a ação com um perf (do minijogo ou 1.0 pras ações instantâneas).
  const commitAction = (kind: ActionKind, perf: number) => {
    const res = applyAction(save, kind, perf);
    if (!res.ok) { setNote(res.reason ?? ct('Não foi possível.')); setFeedback(null); return; }
    setNote(null);
    setFeedback(res.feedback ?? null);
    onUpdate(res.save);
  };

  const doAction = (kind: ActionKind) => {
    // variant = tick do rng: o pool de minijogos daquela ação rotaciona por
    // semana (mira ↔ prefire, memória ↔ segurar o ângulo) — sem repetir sempre.
    const g = gameForAction(kind, save.rng.tick);
    if (g) { setGame({ def: g, kind }); return; }   // ação com minijogo → abre o modal
    commitAction(kind, 1.0);                          // instantânea (rest/social/stream)
  };

  return (
    <>
      <DashCard
        title={ct('Treino & rotina da semana')}
        actions={<span className="rtp-actions-left">{world.actionsLeft} {ct('ação(ões)')}</span>}
      >
        <div className="rtp-action-grid">
          {WEEKLY_ACTIONS.map((a) => {
            const disabled = noActions || (isTrain(a.kind) && tooTired);
            return (
              <button
                key={a.kind}
                type="button"
                className="rtp-action rtp-lift"
                disabled={disabled}
                title={isTrain(a.kind) && tooTired ? ct('Cansado demais pra treinar') : a.hint}
                onClick={() => doAction(a.kind)}
              >
                <span className="rtp-action-icon"><RtpIcon name={a.icon} size={22} /></span>
                <span className="rtp-action-label">{a.label}</span>
                <span className="rtp-action-hint">{a.hint}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="rtp-feedback">
            <b>{feedback.title}</b>
            <div className="rtp-feedback-lines">
              {feedback.lines.map((l, i) => <span key={i} className="rtp-feedback-chip">{l}</span>)}
            </div>
            {feedback.gains.length > 0 && (
              <div className="rtp-feedback-gains">
                {feedback.gains.map((g) => (
                  <span key={g.attr} className="rtp-gain">
                    {ATTR_LABEL[g.attr]} <b>{g.from}→{g.to}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {note && <div className="rtp-note">{note}</div>}
        {noActions && !note && (
          <div className="rtp-note" style={{ marginTop: 12 }}>{ct('Sem ações nesta semana — dispute a partida da rodada na aba Visão geral.')}</div>
        )}
      </DashCard>

      {/* Setup — periféricos + psicólogo (impactam treino e partida) */}
      <RtpSetup save={save} onUpdate={onUpdate} />

      {/* Atributos */}
      <DashCard
        title={ct('Atributos')}
        actions={
          <button type="button" className="rtp-link" onClick={() => setShowAttrs((v) => !v)}>
            {showAttrs ? ct('Ocultar') : ct('Mostrar')}
          </button>
        }
      >
        {showAttrs ? (
          <div className="rtp-attr-cols">
            {ATTR_GROUPS.map((g) => (
              <div key={g.label} className="rtp-attr-group">
                <div className="rtp-attr-grouphead">{g.label}</div>
                {g.keys.map((k) => (
                  <AttrRow key={k} label={ATTR_LABEL[k]} cur={player.attrs[k]} pot={player.potential[k]} xp={player.trainingXp[k] ?? 0} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="rtp-soon">{ct('Treine para evoluir rumo ao seu potencial (marca clara na barra).')}</div>
        )}
      </DashCard>

      {/* Minijogo da ação — bom desempenho extrai o ganho total do treino */}
      {game && (
        <MiniGameModal
          def={game.def}
          save={save}
          onApply={(perf) => { const k = game.kind; setGame(null); commitAction(k, perf); }}
          onCancel={() => setGame(null)}
        />
      )}
    </>
  );
}

// Linha de atributo: valor atual + barra preenchida + marca fantasma do potencial
// + resíduo de XP (progresso fracionário até o próximo ponto).
function AttrRow({ label, cur, pot, xp }: { label: string; cur: number; pot: number; xp: number }) {
  const curPct = (cur / 20) * 100;
  const xpPct = (Math.min(xp, 1) / 20) * 100;
  const potPct = (pot / 20) * 100;
  const capped = cur >= pot;
  return (
    <div className="rtp-attr">
      <span className="rtp-attr-name">{label}</span>
      <div className="rtp-attr-track">
        <div className="rtp-attr-fill" style={{ width: `${curPct}%`, background: attrColor(cur) }} />
        {!capped && xpPct > 0 && (
          <div className="rtp-attr-xp" style={{ left: `${curPct}%`, width: `${xpPct}%`, background: attrColor(cur) }} />
        )}
        {!capped && <div className="rtp-attr-cap" style={{ left: `${potPct}%` }} />}
      </div>
      <span className="rtp-attr-val" style={{ color: attrColor(cur) }}>{cur}</span>
    </div>
  );
}
