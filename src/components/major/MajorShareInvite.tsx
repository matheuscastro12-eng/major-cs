// CONVITE PARA COMPARTILHAR do Modo Major (components/ShareInvite.tsx) nos dois
// picos do modo: o pick'em pronto e o fim da campanha jogada. Reaproveita o
// desafio do #146 (link ?p= com &de=<nick>, o mesmo "Mostrar meu nick"), os
// cards PNG de majorShareCard.ts e o OG dinâmico do #147: no X, o link do
// palpite já mostra o card no preview, então ali não precisa baixar o PNG.
// Medição: share_card com os kinds de state/shareInvite.ts (pickem-*, campanha-*).
import { Fragment, type ReactNode } from 'react';
import { Swords, Trophy } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import { encodePicks, type MajorData, type MajorPicks, type MajorResult } from '../../engine/majorSingapore';
import type { CampaignSummary, MajorCampaign } from '../../engine/majorCampaign';
import { campaignText, fillTemplate, inviteKind, inviteMessage, inviteUrl } from '../../state/shareInvite';
import { shareCard, shareText } from '../../state/shareX';
import { ShareInvite } from '../ShareInvite';
import type { Challenge } from './MajorChallenge';
import { drawCampaignCard, drawMajorCard } from './majorShareCard';
import type { MajorKey } from './majorStrings';

const D = data as unknown as MajorData;
const TEAMS = new Map(D.teams.map((x) => [x.id, x]));
type T = (k: MajorKey) => string;

/** troca {chave} por um nó React (nome em destaque no meio da frase) */
function fillNode(tpl: string, vars: Record<string, ReactNode>): ReactNode[] {
  return tpl.split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return k && k in vars ? <Fragment key={i}>{vars[k]}</Fragment> : part;
  });
}

/** pick'em pronto: entra logo abaixo da chave, onde o campeão é escolhido */
export function PickemInvite({ t, picks, ch, reveal, onRevealed, onVisibleChange }: {
  t: T;
  /** o palpite do próprio jogador, completo */
  picks: MajorPicks;
  /** estado do desafio (MajorChallenge): o nick e o "Mostrar meu nick" valem aqui também */
  ch: Challenge;
  reveal?: boolean;
  onRevealed?: () => void;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const champ = TEAMS.get(picks.bracket[6])?.name ?? '';
  const code = encodePicks(D, picks);

  const dare = async () => {
    const url = inviteUrl('pickem', 'desafio', { code, nick: ch.sign ? ch.myNick : '' });
    const r = await shareText(inviteKind('pickem', 'desafio'), inviteMessage(fillTemplate(t('chText'), { champ }), url));
    return r === 'copy' ? t('chCopied') : r === 'native' ? t('invShared') : null;
  };
  const card = async () => {
    let dataUrl = '';
    try {
      dataUrl = drawMajorCard(D, picks, {
        champion: t('champion'), qf: t('qf'), sf: t('sf'), final: t('final'), stage: (n) => `Stage ${n}`, foot: t('cardFoot'),
      });
    } catch { /* canvas indisponível: o X ainda mostra o card pelo link */ }
    const r = await shareCard(inviteKind('pickem', 'card'), {
      dataUrl, filename: 'pickem-major-singapore.png', text: `${t('shareText')} ${champ} 🏆`,
      url: inviteUrl('pickem', 'card', { code }), preview: true,
    });
    return r === 'native' ? t('invShared') : null; // 'x': a aba do X abriu com o link
  };

  return (
    <ShareInvite
      title={t('invPickTitle')}
      icon={<Trophy size={16} />}
      lead={fillNode(t('invPickLead'), { champ: <strong>{champ}</strong> })}
      dareLabel={t('invDare')}
      cardLabel={t('invCard')}
      onDare={dare}
      onCard={card}
      reveal={reveal}
      onRevealed={onRevealed}
      onVisibleChange={onVisibleChange}
    >
      {ch.myNick && (
        <label className="mch-sign">
          <input type="checkbox" checked={ch.sign} onChange={(e) => ch.setSign(e.target.checked)} />
          <span>{fillNode(t('chSign'), { nick: <strong>{ch.myNick}</strong> })}</span>
        </label>
      )}
    </ShareInvite>
  );
}

/** campanha encerrada (campeão ou eliminado): logo abaixo do aviso do resultado */
export function CampaignInvite({ t, camp, result, summary, reveal, onRevealed }: {
  t: T;
  camp: MajorCampaign;
  result: MajorResult;
  summary: CampaignSummary;
  reveal?: boolean;
  onRevealed?: () => void;
}) {
  const c = { champion: result.playoffs.champion === camp.teamId, team: TEAMS.get(camp.teamId)?.name ?? camp.teamId, record: summary.record };

  const dare = async () => {
    const text = campaignText(c, { champ: t('invCampDareChamp'), run: t('invCampDareRun') });
    const r = await shareText(inviteKind('campanha', 'desafio'), inviteMessage(text, inviteUrl('campanha', 'desafio')));
    return r === 'copy' ? t('chCopied') : r === 'native' ? t('invShared') : null;
  };
  const card = async () => {
    let dataUrl = '';
    try {
      dataUrl = drawCampaignCard(D, camp, result, summary, {
        champion: t('champion'), record: t('record'), maps: t('mapsWL'), rating: t('avgRating'), mvp: t('mvp'), foot: t('cardFoot'),
      });
    } catch { /* canvas indisponível: segue só com o texto */ }
    const r = await shareCard(inviteKind('campanha', 'card'), {
      dataUrl, filename: 'campanha-major-singapore.png',
      text: campaignText(c, { champ: t('invCampCardChamp'), run: t('invCampCardRun') }), url: inviteUrl('campanha', 'card'),
    });
    if (r === 'native') return t('invShared');
    return r === 'x' && dataUrl ? t('invXHint') : null;
  };

  return (
    <ShareInvite
      title={t('invCampTitle')}
      icon={<Swords size={16} />}
      lead={campaignText(c, { champ: t('invCampLeadChamp'), run: t('invCampLeadRun') })}
      dareLabel={t('invDare')}
      cardLabel={t('invCard')}
      onDare={dare}
      onCard={card}
      reveal={reveal}
      onRevealed={onRevealed}
    />
  );
}
