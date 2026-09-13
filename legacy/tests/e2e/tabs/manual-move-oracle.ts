import {reference} from '../../unit/adjust-reference.mjs';
import {lockedCourts} from './adjust-oracle';
import type {League} from './gen';
export function manualMoveExpected(L:League,id:number,target:number){
 const cur=L.current,p=L.players.find(p=>p.id===id),before=cur?.assignments;
 if(!cur||cur.completed)return {lineup:before,message:/Start an unfinished session/};
 if(!p?.approved||p.waitlisted)return {lineup:before,message:/Approve this player/};
 const source=Object.keys(before!).find(c=>before![c].includes(id));
 if(Number(source)===target)return {lineup:before,message:null};
 const locked=lockedCourts(cur);
 if(locked.includes(Number(source))||locked.includes(target))return {lineup:before,message:/scored court is locked/};
 const proposed=structuredClone(before!);for(let c=1;c<=6;c++)proposed[c]=(proposed[c]||[]).filter(pid=>pid!==id);if(target)proposed[target].push(id);
 const result=reference({nc:6,lineup:proposed,locked,closed:cur.closedCourts||[],absent:[],returning:[],late:[],partner:true});
 return result.ok?{lineup:result.lineup,message:/Court assignment saved/}:{lineup:before,message:/Nothing was changed|Only one player|no court|room|needs a court|invalid/i};
}
