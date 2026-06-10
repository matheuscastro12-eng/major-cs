import { useState } from 'react';

const KEY = 'major-onboarded-v1';

export function shouldOnboard(): boolean {
  return localStorage.getItem(KEY) !== '1';
}

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [, setSeen] = useState(false);
  const close = () => {
    localStorage.setItem(KEY, '1');
    setSeen(true);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          👋 Bem-vindo ao Road to Major
          <span className="spacer" />
          <button className="icon-btn" onClick={close} aria-label="fechar">
            ✕
          </button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Monte o time dos sonhos com lendas de todas as eras do Counter-Strike e vença o Major.
            Em 3 passos:
          </p>
          <div className="onboarding-steps">
            <div className="ob-step">
              <span className="n">1</span>
              <div>
                <h4>🎲 Draft</h4>
                <p>
                  O dado sorteia 5 elencos históricos - escolha 1 jogador de cada, e depois um coach.
                  <b> Composição importa:</b> sem IGL ou sem AWPer o time desmorona. Monte funções
                  completas (entry, suporte) e fique de olho no OVR e na sinergia.
                </p>
              </div>
            </div>
            <div className="ob-step">
              <span className="n">2</span>
              <div>
                <h4>🗺️ Veto</h4>
                <p>
                  Cada série MD3 começa no ban/pick de mapas. Use o painel de análise ao lado: ele
                  mostra onde você é mais forte, a fase dos seus jogadores e o que banir com urgência.
                </p>
              </div>
            </div>
            <div className="ob-step">
              <span className="n">3</span>
              <div>
                <h4>🔫 Partida</h4>
                <p>
                  A simulação roda round a round com killfeed e economia reais. Você tem{' '}
                  <b>2 timeouts táticos por mapa</b> - use nos momentos de crise para virar rounds.
                  Vença a fase suíça (3 vitórias) e os playoffs para levantar o troféu.
                </p>
              </div>
            </div>
          </div>
          <div className="center">
            <button className="btn big" onClick={close}>
              Entendi, bora jogar! 🏆
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
