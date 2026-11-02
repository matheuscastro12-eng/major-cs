// Saúde do save: o que NÃO está sendo gravado agora, pra UI avisar o jogador.
//
// Motivação [O0-26/FRON-04]: quando a gravação local falhava (cota estourada que
// nem o resgate de cota resolve, Safari em aba privada), a Carreira preenchia
// `lastPersistError` e o Ultimate só logava — nenhuma tela lia. O jogador
// seguia horas jogando na memória e perdia tudo no F5, em silêncio.
//
// Duas famílias de problema, uma store só (o banner global lê daqui):
//   - localErrors: a gravação no localStorage falhou (por modo). O gameStore da
//     carreira espelha o `lastPersistError` aqui; o Ultimate espelha o
//     `persistError` novo; a campanha do Draft/Major reporta direto.
//   - cloudBlocks: um slot da nuvem parou de sincronizar de propósito —
//     'too-large' (413 do cloud-save, não adianta repetir) ou 'quota' (a nuvem
//     tem um save mais novo mas não coube no aparelho; o autosave daquele slot
//     fica bloqueado pra o save velho não sobrescrever o novo).
import { create } from 'zustand';

export type LocalSaveMode = 'career' | 'ultimate' | 'draft';
export type CloudBlockReason = 'too-large' | 'quota';

export interface CloudBlock {
  slot: string;       // slot da nuvem ('career', 'career-2', 'rtp', 'ultimate')
  localKey: string;   // chave do localStorage espelhada
  reason: CloudBlockReason;
  message: string;    // mensagem crua do servidor/navegador (diagnóstico)
  bytes?: number;     // tamanho do save que o servidor recusou (413)
  at: number;
}

interface SaveHealthState {
  localErrors: Partial<Record<LocalSaveMode, string>>;
  cloudBlocks: Record<string, CloudBlock>;
}

export const useSaveHealth = create<SaveHealthState>(() => ({ localErrors: {}, cloudBlocks: {} }));

// null = gravou certo (limpa o aviso daquele modo).
export function reportLocalSave(mode: LocalSaveMode, error: string | null): void {
  const cur = useSaveHealth.getState().localErrors;
  if ((cur[mode] ?? null) === error) return;
  const next = { ...cur };
  if (error) next[mode] = error; else delete next[mode];
  useSaveHealth.setState({ localErrors: next });
}

export function setCloudBlock(block: CloudBlock): void {
  useSaveHealth.setState((s) => ({ cloudBlocks: { ...s.cloudBlocks, [block.slot]: block } }));
}

export function clearCloudBlock(slot: string): void {
  const cur = useSaveHealth.getState().cloudBlocks;
  if (!cur[slot]) return;
  const next = { ...cur };
  delete next[slot];
  useSaveHealth.setState({ cloudBlocks: next });
}

export function getCloudBlock(slot: string): CloudBlock | null {
  return useSaveHealth.getState().cloudBlocks[slot] ?? null;
}

// "Tentar de novo" do banner: cada modo registra como regravar o estado atual.
const retries = new Map<LocalSaveMode, () => void>();
export function registerSaveRetry(mode: LocalSaveMode, fn: () => void): void {
  retries.set(mode, fn);
}
export function retryFailedSaves(): void {
  for (const mode of Object.keys(useSaveHealth.getState().localErrors) as LocalSaveMode[]) {
    try { retries.get(mode)?.(); } catch { /* a própria gravação reporta o erro de novo */ }
  }
}
