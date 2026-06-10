import { useState } from 'react';
import type { TournamentPool } from '../types';

interface Props {
  onStart: (mode: 'classic' | 'almanac', teamName: string, pool: TournamentPool) => void;
  onAdmin: () => void;
  teamCount: number;
  playerCount: number;
  savedCampaign?: { name: string; phase: string } | null;
  onResume?: () => void;
}

export function Home({ onStart, onAdmin, teamCount, playerCount, savedCampaign, onResume }: Props) {
  const [mode, setMode] = useState<'classic' | 'almanac'>('classic');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [name, setName] = useState('');

  const start = () => onStart(mode, name.trim() || 'DREAM FIVE', pool);

  return (
    <div className="fade-in">
      <div className="hero">
        <h1>
          MAJOR<span>//</span>CS
        </h1>
        <p>
          Monte o time dos sonhos com lendas de todas as eras do Counter-Strike — do 1.6 ao CS2 — e
          dispute um Major completo em séries MD3 contra os maiores times da história.
        </p>

        {savedCampaign && (
          <div style={{ margin: '18px auto 0', maxWidth: 640 }}>
            <button className="btn gold big" style={{ width: '100%' }} onClick={onResume}>
              ▶ Continuar campanha — {savedCampaign.name}
              {savedCampaign.phase === 'done' ? ' (encerrada)' : ''}
            </button>
          </div>
        )}

        <div className="pool-cards">
          <button className={`pool-card world${pool === 'world' ? ' sel' : ''}`} onClick={() => setPool('world')}>
            <h3>🏆 Major Mundial</h3>
            <p>Todas as eras e regiões: do 1.6 ao CS2, monte o dream team global e vença o Major dos Sonhos.</p>
          </button>
          <button className={`pool-card br${pool === 'br' ? ' sel' : ''}`} onClick={() => setPool('br')}>
            <h3>🇧🇷 GC Masters</h3>
            <p>Só elencos brasileiros — de mibr 2006 e SK 2016 a Legacy e FURIA. O campeonato da pátria de chuteiras (e de headshot).</p>
          </button>
        </div>

        <div className="mode-cards">
          <button className={`mode-card${mode === 'classic' ? ' sel' : ''}`} onClick={() => setMode('classic')}>
            <h3>🎯 Modo Clássico</h3>
            <p>Os atributos de cada jogador ficam visíveis no draft. Monte o time com base nos dados.</p>
          </button>
          <button className={`mode-card${mode === 'almanac' ? ' sel' : ''}`} onClick={() => setMode('almanac')}>
            <h3>📕 Modo Almanaque</h3>
            <p>Atributos escondidos. Só o seu conhecimento da história do CS define as escolhas.</p>
          </button>
        </div>

        <div className="name-input">
          <input
            placeholder="Nome do seu time…"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
          />
          <button className="btn big" onClick={start}>
            Começar draft
          </button>
        </div>

        <div className="footnote">
          {teamCount} elencos históricos · {playerCount} jogadores · dados curados com base em{' '}
          <a href="https://liquipedia.net" target="_blank" rel="noreferrer">
            Liquipedia
          </a>{' '}
          e{' '}
          <a href="https://www.hltv.org" target="_blank" rel="noreferrer">
            HLTV
          </a>
          {' · '}
          <a
            href="#admin"
            onClick={(e) => {
              e.preventDefault();
              onAdmin();
            }}
          >
            Gerenciar base de dados
          </a>
        </div>
      </div>
    </div>
  );
}
