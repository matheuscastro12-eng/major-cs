import { CS2_REAL_2026 } from '/home/user/major-cs/src/data/bo3';
import { teamSeasonToTTeam } from '/home/user/major-cs/src/engine/ratings';
import { simulateSeries } from '/home/user/major-cs/src/engine/match';
import { makeRng } from '/home/user/major-cs/src/engine/rng';
import { MAP_POOL } from '/home/user/major-cs/src/types';
const find=(tag:string)=>{const t=(CS2_REAL_2026 as any[]).find(t=>(t.tag??t.name)?.toLowerCase()===tag.toLowerCase());if(!t)throw new Error(tag);return teamSeasonToTTeam(t)};
function run(x:string,y:string,bo=3){const a=find(x),b=find(y);let w=0;
 for(let s=1000;s<2000;s++){const off=s%MAP_POOL.length;
  const maps=[0,1,2,3,4].map(i=>({map:MAP_POOL[(off+i)%MAP_POOL.length],pickedBy:-1 as const}));
  if(simulateSeries(makeRng(s),a,b,maps,bo).winner===0)w++;}
 console.log(`bo${bo}`,a.tag,a.strength.toFixed(1),'x',b.tag,b.strength.toFixed(1),'->',w,'/1000');}
run('MOUZ','TS');run('FURIA','MOUZ',5);run('FURIA','TS',5);run('FURIA','FLC',3);
