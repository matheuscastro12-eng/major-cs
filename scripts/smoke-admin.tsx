import { renderToString } from 'react-dom/server';
import { Admin } from '../src/components/Admin';
import { Scoreboard } from '../src/components/Scoreboard';
import { BASE_TEAMS } from '../src/data/teams';
import { simulateSeries } from '../src/engine/match';
import { teamSeasonToTTeam } from '../src/engine/ratings';
import { makeRng } from '../src/engine/rng';
import { autoVeto } from '../src/engine/veto';

const adminHtml = renderToString(
  <Admin dataset={BASE_TEAMS} onChange={() => {}} onReset={() => {}} onBack={() => {}} />,
);
if (!adminHtml.includes('crm-layout')) throw new Error('Admin nao renderizou o layout CRM');
console.log('Admin OK -', adminHtml.length, 'chars');

const rng = makeRng(42);
const a = teamSeasonToTTeam(BASE_TEAMS[0]);
const b = teamSeasonToTTeam(BASE_TEAMS[1]);
const series = simulateSeries(rng, a, b, autoVeto([a, b], rng));
const sbHtml = renderToString(<Scoreboard series={series} teams={[a, b]} />);
if (!sbHtml.includes('panel-head') || !sbHtml.includes(a.name) || !sbHtml.includes(b.name)) throw new Error('Scoreboard nao renderizou');
console.log('Scoreboard OK -', series.mapScore.join(':'), '-', series.maps.map((m) => `${m.map} ${m.score[0]}:${m.score[1]}`).join(', '));

let otCount = 0;
let maxKills = 0;
for (let i = 0; i < 200; i++) {
  const t1 = teamSeasonToTTeam(BASE_TEAMS[i % BASE_TEAMS.length]);
  const t2 = teamSeasonToTTeam(BASE_TEAMS[(i * 7 + 3) % BASE_TEAMS.length]);
  if (t1.id === t2.id) continue;
  const r = makeRng(1000 + i);
  const s = simulateSeries(r, t1, t2, autoVeto([t1, t2], r));
  for (const m of s.maps) {
    const max = Math.max(m.score[0], m.score[1]);
    const min = Math.min(m.score[0], m.score[1]);
    if (max < 13) throw new Error(`placar invalido ${m.score.join(':')}`);
    if (!m.ot && max === 13 && min === 12) throw new Error('13-12 sem OT e invalido');
    if (m.roundLog.length > 43) throw new Error(`mapa longo demais: ${m.roundLog.length} rounds`);
    if (m.killFeed.length === 0) throw new Error('killfeed vazio');
    for (const st of Object.values(m.stats)) maxKills = Math.max(maxKills, st.both.kills);
    if (m.ot) otCount++;
  }
}
if (maxKills >= 50) throw new Error(`50 bomb detectado: ${maxKills} kills`);
console.log('Motor OK - 200 series simuladas,', otCount, 'mapas foram para OT, maior frag:', maxKills);
