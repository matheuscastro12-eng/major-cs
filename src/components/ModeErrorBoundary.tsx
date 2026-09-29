// Rede de segurança POR MODO [O0-12/FRON-02]: Carreira, Road to Pro, Ultimate e
// Diário têm cada um o seu boundary. Antes havia um só, global, e o único botão
// diferente de "Recarregar" apagava a CARREIRA ativa (inclusive na nuvem, com
// lápide) mesmo quando o crash era no Ultimate ou no RtP.
//
// Ordem das saídas, da mais segura pra mais destrutiva:
//   1. Voltar ao menu      — sai do modo; nada é apagado.
//   2. Baixar backup (JSON) — cópia do save deste modo, antes de qualquer reset.
//   3. Recarregar          — mesma tela de novo (limpa o guard do chunk loader).
//   4. Recomeçar o modo    — só o save DESTE modo, só NESTE aparelho: o principal
//      vai pra `.corrupt`, a nuvem não recebe lápide (trava 'reset' no sync).
// O texto de cada confirm diz exatamente isso.
import { Component, type ReactNode } from 'react';
import { captureError } from '../state/errlog';
import { getLang } from '../state/i18n';
import { confirm } from './ConfirmDialog';
import { downloadSaveBackup, type SaveMode } from '../state/saveRecovery';
import { getActiveSlot } from '../state/careerSaves';
import { resetSlotLocal } from '../state/gameStore';
import { resetUltimateLocal } from '../state/ultimate';
import { resetDailyProgress } from '../state/daily';
import { CHUNK_RELOAD_KEY, crashStyles as S } from './ErrorBoundary';

type Lang3 = { pt: string; en: string; es: string };

const MODE_NAME: Record<SaveMode, Lang3> = {
  career: { pt: 'a Carreira', en: 'Career mode', es: 'el modo Carrera' },
  rtp: { pt: 'o Road to Pro', en: 'Road to Pro', es: 'el Road to Pro' },
  ultimate: { pt: 'o Ultimate', en: 'Ultimate', es: 'el Ultimate' },
  daily: { pt: 'o Diário', en: 'the Daily', es: 'el Diario' },
};

const RESET_LABEL: Record<SaveMode, Lang3> = {
  career: { pt: 'Recomeçar este slot', en: 'Restart this slot', es: 'Reiniciar este slot' },
  rtp: { pt: 'Recomeçar o Road to Pro', en: 'Restart Road to Pro', es: 'Reiniciar el Road to Pro' },
  ultimate: { pt: 'Recomeçar o Ultimate', en: 'Restart Ultimate', es: 'Reiniciar el Ultimate' },
  daily: { pt: 'Recomeçar o dia', en: "Restart today's games", es: 'Reiniciar el día' },
};

// Fiel ao que o reset faz (ver resetSlotLocal/resetRtpLocal/resetUltimateLocal/
// resetDailyProgress). {slot} é trocado pelo número do slot ativo.
const RESET_CONFIRM: Record<SaveMode, Lang3> = {
  career: {
    pt: 'Apaga deste navegador o save do slot {slot} da Carreira e volta ao menu. Uma cópia fica guardada neste aparelho para diagnóstico. A cópia da nuvem NÃO é apagada agora: ela só é substituída quando você começar uma carreira nova neste slot. Os outros slots e modos não mudam. Baixe o backup antes, se quiser guardar o save.',
    en: 'Removes the Career save of slot {slot} from this browser and returns to the menu. A copy is kept on this device for diagnostics. The cloud copy is NOT deleted now: it is only replaced when you start a new career in this slot. Other slots and modes are untouched. Download the backup first if you want to keep the save.',
    es: 'Borra de este navegador la partida del slot {slot} de la Carrera y vuelve al menú. Queda una copia en este dispositivo para diagnóstico. La copia en la nube NO se borra ahora: solo se reemplaza cuando empieces una carrera nueva en este slot. Los otros slots y modos no cambian. Descarga la copia antes si quieres conservar la partida.',
  },
  rtp: {
    pt: 'Apaga deste navegador o seu jogador do Road to Pro e volta ao menu. Uma cópia fica guardada neste aparelho para diagnóstico. A cópia da nuvem NÃO é apagada agora: ela só é substituída quando você criar um jogador novo. Os outros modos não mudam. Baixe o backup antes, se quiser guardar o save.',
    en: 'Removes your Road to Pro player from this browser and returns to the menu. A copy is kept on this device for diagnostics. The cloud copy is NOT deleted now: it is only replaced when you create a new player. Other modes are untouched. Download the backup first if you want to keep the save.',
    es: 'Borra de este navegador tu jugador del Road to Pro y vuelve al menú. Queda una copia en este dispositivo para diagnóstico. La copia en la nube NO se borra ahora: solo se reemplaza cuando crees un jugador nuevo. Los otros modos no cambian. Descarga la copia antes si quieres conservar la partida.',
  },
  ultimate: {
    pt: 'Apaga deste navegador o seu clube do Ultimate (cartas, coins e progresso) e volta ao menu. Uma cópia fica guardada neste aparelho para diagnóstico. A cópia da nuvem NÃO é apagada agora: ela só é substituída quando você voltar a jogar o Ultimate. Os outros modos não mudam. Baixe o backup antes, se quiser guardar o save.',
    en: 'Removes your Ultimate club (cards, coins and progress) from this browser and returns to the menu. A copy is kept on this device for diagnostics. The cloud copy is NOT deleted now: it is only replaced when you play Ultimate again. Other modes are untouched. Download the backup first if you want to keep the save.',
    es: 'Borra de este navegador tu club del Ultimate (cartas, monedas y progreso) y vuelve al menú. Queda una copia en este dispositivo para diagnóstico. La copia en la nube NO se borra ahora: solo se reemplaza cuando vuelvas a jugar el Ultimate. Los otros modos no cambian. Descarga la copia antes si quieres conservar la partida.',
  },
  daily: {
    pt: 'Apaga o progresso de HOJE nos jogos do Diário e volta ao menu. Suas sequências e o resto do jogo não mudam. Nada é apagado na nuvem.',
    en: "Clears TODAY's progress in the Daily games and returns to the menu. Your streaks and the rest of the game are untouched. Nothing is deleted in the cloud.",
    es: 'Borra el progreso de HOY en los juegos del Diario y vuelve al menú. Tus rachas y el resto del juego no cambian. No se borra nada en la nube.',
  },
};

const STR = {
  title: { pt: 'Ops, {mode} quebrou', en: 'Oops, {mode} broke', es: 'Ups, {mode} se rompió' },
  body: {
    pt: 'Nada foi apagado: seu save continua gravado neste aparelho. Volte ao menu ou baixe uma cópia do save antes de tentar qualquer outra coisa.',
    en: 'Nothing was deleted: your save is still stored on this device. Go back to the menu or download a copy of the save before trying anything else.',
    es: 'No se borró nada: tu partida sigue guardada en este dispositivo. Vuelve al menú o descarga una copia de la partida antes de intentar otra cosa.',
  },
  menu: { pt: 'Voltar ao menu', en: 'Back to menu', es: 'Volver al menú' },
  backup: { pt: 'Baixar backup (JSON)', en: 'Download backup (JSON)', es: 'Descargar copia (JSON)' },
  backupOk: { pt: 'Backup baixado.', en: 'Backup downloaded.', es: 'Copia descargada.' },
  backupEmpty: { pt: 'Não há save deste modo neste aparelho.', en: 'There is no save for this mode on this device.', es: 'No hay partida de este modo en este dispositivo.' },
  reload: { pt: 'Recarregar', en: 'Reload', es: 'Recargar' },
  keep: { pt: 'Manter', en: 'Keep', es: 'Mantener' },
} as const;

const pick = (t: Lang3): string => t[getLang() as keyof Lang3] ?? t.pt;

interface Props { mode: SaveMode; onExit: () => void; children: ReactNode }
interface State { error: Error | null; backup: 'ok' | 'empty' | null }

export class ModeErrorBoundary extends Component<Props, State> {
  state: State = { error: null, backup: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }
  componentDidCatch(error: Error) {
    captureError(error, `react-${this.props.mode}`);
  }

  exit = () => {
    this.setState({ error: null, backup: null });
    this.props.onExit();
  };

  backup = () => {
    this.setState({ backup: downloadSaveBackup(this.props.mode) ? 'ok' : 'empty' });
  };

  reset = async () => {
    const { mode } = this.props;
    const slot = getActiveSlot();
    const ok = await confirm({
      title: pick(RESET_LABEL[mode]),
      message: pick(RESET_CONFIRM[mode]).replace('{slot}', String(slot)),
      confirmLabel: pick(RESET_LABEL[mode]),
      cancelLabel: pick(STR.keep),
      danger: true,
    });
    if (!ok) return;
    if (mode === 'career') resetSlotLocal(slot);
    else if (mode === 'ultimate') resetUltimateLocal();
    else if (mode === 'daily') resetDailyProgress();
    else (await import('../state/rtpSaves')).resetRtpLocal();
    this.exit();
  };

  render() {
    const { error, backup } = this.state;
    if (!error) return this.props.children;
    const { mode } = this.props;
    return (
      <div style={S.wrap} role="alert">
        <h2 style={S.title}>{pick(STR.title).replace('{mode}', pick(MODE_NAME[mode]))}</h2>
        <p style={S.body}>{pick(STR.body)}</p>
        <div style={S.row}>
          <button type="button" style={S.primary} onClick={this.exit}>{pick(STR.menu)}</button>
          <button type="button" style={S.ghost} onClick={this.backup}>{pick(STR.backup)}</button>
          <button
            type="button"
            style={S.ghost}
            onClick={() => {
              try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ok */ }
              location.reload();
            }}
          >
            {pick(STR.reload)}
          </button>
        </div>
        {backup && <div style={S.note}>{pick(backup === 'ok' ? STR.backupOk : STR.backupEmpty)}</div>}
        <div style={S.dangerRow}>
          <button type="button" style={S.danger} onClick={this.reset}>{pick(RESET_LABEL[mode])}</button>
        </div>
        <div style={S.detail}>{error.message}</div>
      </div>
    );
  }
}
