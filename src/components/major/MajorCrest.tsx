// Brasão de um time do Modo Major: logo local (public/logos, pelo nome/id) ou,
// sem arquivo, a sigla nas cores do time (TeamBadge). Nunca Liquipedia.
import { TeamBadge } from '../ui';
import { logoForName } from '../../data/media';

export interface CrestTeam { id: string; name: string; tag: string; colors?: [string, string] | string[] }

export const majorLogo = (team: Pick<CrestTeam, 'id' | 'name'>): string | undefined => logoForName(team.name, team.id);

export function MajorCrest({ team, size = 20 }: { team: CrestTeam | undefined; size?: number }) {
  if (!team) return null;
  const colors = (team.colors && team.colors.length >= 2 ? [team.colors[0], team.colors[1]] : ['var(--c-surface-3)', 'var(--c-ink)']) as [string, string];
  return <span className="msg-crest"><TeamBadge tag={team.tag} colors={colors} logoUrl={majorLogo(team)} size={size} /></span>;
}
