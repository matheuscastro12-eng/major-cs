// LogoBuilderHost — T7.2. Host global pattern.

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { LogoBuilder } from './LogoBuilder';
import type { LogoConfig } from '../lib/logoBuilder';

interface State {
  initial?: Partial<LogoConfig>;
  onSave: (dataUrl: string, cfg: LogoConfig) => void;
}

type Listener = (next: State | null) => void;
const listeners = new Set<Listener>();
let current: State | null = null;

function setAll(next: State | null): void {
  current = next;
  for (const l of listeners) l(next);
}

export function openLogoBuilder(input: State): void {
  setAll(input);
}

export function LogoBuilderHost() {
  const [state, setState] = useState<State | null>(current);

  useEffect(() => {
    const l: Listener = (next) => setState(next);
    listeners.add(l);
    if (current !== state) setState(current);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => setAll(null);
  return (
    <Modal open={state != null} onClose={close} title="Editor de logo" size="lg">
      {state && (
        <LogoBuilder
          initial={state.initial}
          onSave={(dataUrl, cfg) => {
            state.onSave(dataUrl, cfg);
            close();
          }}
          onCancel={close}
        />
      )}
    </Modal>
  );
}
