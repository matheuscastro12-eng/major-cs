import data from '/home/user/major-cs/src/data/major-singapore-2026.json';
import { phaseOdds } from '/home/user/major-cs/src/engine/majorSingapore';
const names=new Map((data as any).teams.map((t:any)=>[t.id,t.tag]));
const o=phaseOdds(data as any,1000);
for(const x of o.slice(0,10))console.log(names.get(x.id),'title',(x.title*100).toFixed(1),'playoffs',(x.playoffs*100).toFixed(1),'s1',x.s1==null?'-':(x.s1*100).toFixed(1));
console.log('--BR');
for(const x of o.filter(x=>['FURIA','LGC','MIBR','DEN','IMP'].includes(names.get(x.id) as string)))console.log(names.get(x.id),'title',(x.title*100).toFixed(1),'playoffs',(x.playoffs*100).toFixed(1),'s1',x.s1==null?'-':(x.s1*100).toFixed(1),'s2',x.s2==null?'-':(x.s2*100).toFixed(1));
