// Logo local do time do Major (public/logos) ou a sigla quando não houver.
import { logoForMajorTeam } from '../../data/media';
import type { MajorTeam } from '../../engine/majorSingapore';

export function TeamLogo({ team, size = 20 }: { team: MajorTeam | undefined; size?: number }) {
  if (!team) return null;
  const src = logoForMajorTeam(team.id);
  return src
    ? <img className="msg-logo" src={src} alt="" width={size} height={size} loading="lazy" />
    : <span className="msg-logo is-tag" style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.36)) }} aria-hidden>{team.tag}</span>;
}
