import { CS2_REAL_2026 } from '/home/user/major-cs/src/data/bo3';
import { teamSeasonToTTeam } from '/home/user/major-cs/src/engine/ratings';
import { simulateSeries } from '/home/user/major-cs/src/engine/match';
import { makeRng } from '/home/user/major-cs/src/engine/rng';
import { MAP_POOL } from '/home/user/major-cs/src/types';
const get=(id:string)=>teamSeasonToTTeam(CS2_REAL_2026.find((t:any)=>t.id===id)!);
function run(ai:string,bi:string){const a=get(ai),b=get(bi);let w=0;
 for(let s=1000;s<2000;s++){const off=s%MAP_POOL.length;
  const maps=[0,1,2,3,4].map(i=>({map:MAP_POOL[(off+i)%MAP_POOL.length],pickedBy:-1 as const}));
  if(simulateSeries(makeRng(s),a,b,maps,3).winner===0)w++;}
 console.log(a.tag,a.strength.toFixed(1),'x',b.tag,b.strength.toFixed(1),'->',w,'/1000');}

run('bo3_team_648','bo3_team_655');
