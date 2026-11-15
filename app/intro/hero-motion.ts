/** A three-row sliding puzzle. Each expanded gap is exactly one 90px cell. */
export const CYCLE_MS = 9000;
export const TILE_SIZE = 90;
export const PALETTE = ["#234a91", "#537fc4", "#d18a50", "#328c83", "#c6cfdd", "#192f59"];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export type HeroTile = { id: number; x: number; y: number; foreground: boolean; role: "resident" | "outgoing" | "incoming" };
type Position = { id: number; x: number; y: number };
const columns = [[0,1,2,3,4,5,6,7], [0,1,2,5,6,7], [0,1,2,3,4,5,6,7]];
const initialRoster = columns.map((cols, row) => cols.map(col => row * 8 + col));
function packed(roster: number[][]): Position[] {
  return roster.flatMap((ids, row) => ids.map((id, i) => ({ id, x: columns[row][i] * 90, y: row * 90 })));
}
// Different staggered masks leave single-cell vacancies without an empty column.
const openColumns = [[0,1,3,4,6,8,10,11], [1,3,5,7,9,11], [0,2,3,5,6,8,9,11]];
function noise(seed:number) { const n=Math.sin(seed*127.1+311.7)*43758.5453; return n-Math.floor(n); }
function expanded(roster:number[][], cycle:number):Position[] {
  const mirror=noise(cycle+7)>.5;
  const swap=noise(cycle+31)>.5;
  return roster.flatMap((ids,row)=>{
    const mask=openColumns[swap && row!==1 ? 2-row : row];
    const cols=mask.map(c=>mirror?11-c:c).sort((a,b)=>a-b);
    return ids.map((id,i)=>({id,x:cols[i]*90-180,y:row*90}));
  });
}
const cell=(x:number,y:number)=>`${x},${y}`;
function verticalPairs(tiles:Position[]) {
  const occupied=new Set(tiles.map(t=>cell(t.x,t.y)));
  const pairs:{up:Position;down:Position;lower:number}[]=[];
  for(const lower of [90,180]) {
    const ups=tiles.filter(t=>t.y===lower&&!occupied.has(cell(t.x,t.y-90)));
    const downs=tiles.filter(t=>t.y===lower-90&&!occupied.has(cell(t.x,t.y+90)));
    for(const up of ups) for(const down of downs) if(up.x!==down.x) pairs.push({up,down,lower});
  }
  return pairs;
}
function puzzleBeat(from:Position[], seed:number, exchange=false) {
  const occupied=new Set(from.map(t=>cell(t.x,t.y)));
  const pairs=verticalPairs(from).sort((a,b)=>noise(a.up.id+a.down.id*19+seed)-noise(b.up.id+b.down.id*19+seed));
  for(const pair of pairs) {
    const exchangeY=pair.lower===90?180:0;
    const reserved=new Set([cell(pair.up.x,pair.up.y),cell(pair.up.x,pair.up.y-90),cell(pair.down.x,pair.down.y),cell(pair.down.x,pair.down.y+90)]);
    const changes=new Map<number,{dx:number;dy:number}>([[pair.up.id,{dx:0,dy:-90}],[pair.down.id,{dx:0,dy:90}]]);
    const candidates=from.flatMap(tile=>[-90,90].map(dx=>({tile,dx})))
      .sort((a,b)=>noise(a.tile.id*13+a.dx+seed)-noise(b.tile.id*13+b.dx+seed));
    let horizontal=0;
    for(const {tile,dx} of candidates) {
      const target=cell(tile.x+dx,tile.y);
      if(horizontal>=4 || changes.has(tile.id) || (exchange&&tile.y===exchangeY)) continue;
      if(tile.x+dx < -180 || tile.x+dx > 810 || occupied.has(target) || reserved.has(target) || reserved.has(cell(tile.x,tile.y))) continue;
      // Reserve the complete two-cell corridor, preventing perpendicular paths crossing.
      changes.set(tile.id,{dx,dy:0});reserved.add(target);reserved.add(cell(tile.x,tile.y));horizontal++;
    }
    const to=from.map(t=>({...t,x:t.x+(changes.get(t.id)?.dx??0),y:t.y+(changes.get(t.id)?.dy??0)}));
    if((horizontal>0||exchange)&&verticalPairs(to).length) return {to,exchangeY};
  }
  throw new Error("No collision-free mixed-axis beat available");
}
function planCycle(roster:number[][],cycle:number) {
  const compact=packed(roster),open=expanded(roster,cycle);
  const first=puzzleBeat(open,cycle*101+1).to;
  const second=puzzleBeat(first,cycle*101+2).to;
  const third=puzzleBeat(second,cycle*101+3).to;
  const last=puzzleBeat(third,cycle*101+4,true);
  const lane=third.filter(t=>t.y===last.exchangeY).sort((a,b)=>a.x-b.x);
  const incoming={id:24+cycle,x:2000,y:last.exchangeY};
  const exchangeFrom:HeroTile[]=third.map(t=>({...t,foreground:t.id===lane[0].id,role:t.id===lane[0].id?"outgoing":"resident"}));
  exchangeFrom.push({...incoming,foreground:true,role:"incoming"});
  const exchangeTo:HeroTile[]=last.to.map(t=>{
    const index=lane.findIndex(l=>l.id===t.id);
    return {...t,x:index===0?-2000:index>0?lane[index-1].x:t.x,foreground:index===0,role:index===0?"outgoing":"resident"};
  });
  exchangeTo.push({...incoming,x:lane[lane.length-1].x,foreground:true,role:"incoming"});
  const afterExchange=exchangeTo.filter(t=>t.role!=="outgoing").map(({id,x,y})=>({id,x,y}));
  const nextRoster=[0,90,180].map(y=>afterExchange.filter(t=>t.y===y).sort((a,b)=>a.x-b.x).map(t=>t.id));
  const finish=packed(nextRoster);
  return {compact,open,first,second,third,exchangeFrom,exchangeTo,afterExchange,finish,nextRoster};
}
const plans = [planCycle(initialRoster, 0)];
function planFor(cycle:number) {
  while(plans.length <= cycle) plans.push(planCycle(plans[plans.length-1].nextRoster, plans.length));
  return plans[cycle];
}
function interpolate(from: Position[], to: Position[], p: number): HeroTile[] {
  const eased = ease(p);
  const targets = new Map(to.map(tile => [tile.id, tile]));
  return from.map(tile => {
    const target = targets.get(tile.id)!;
    return {...tile, x:mix(tile.x,target.x,eased), y:mix(tile.y,target.y,eased), foreground:false, role:"resident"};
  });
}
export function sampleHero(elapsed: number) {
  const cycle = Math.floor(Math.max(0, elapsed) / CYCLE_MS);
  const t = Math.max(0, elapsed) % CYCLE_MS;
  const plan = planFor(cycle);
  const expansion=t<800?0:t<1900?ease((t-800)/1100):t<6700?1:t<7900?1-ease((t-6700)/1200):0;
  let stage:string;
  let tiles:HeroTile[];
  if(t<800){stage="assembled";tiles=interpolate(plan.compact,plan.compact,0);}
  else if(t<1900){stage="expand";tiles=interpolate(plan.compact,plan.open,(t-800)/1100);}
  else if(t<3100){stage="move-1";tiles=interpolate(plan.open,plan.first,(t-1900)/850);}
  else if(t<4300){stage="move-2";tiles=interpolate(plan.first,plan.second,(t-3100)/850);}
  else if(t<5500){stage="move-3";tiles=interpolate(plan.second,plan.third,(t-4300)/850);}
  else if(t<6700){
    stage="move-4";
    tiles=interpolate(plan.exchangeFrom,plan.exchangeTo,(t-5500)/850).map((tile,i)=>({...tile,foreground:plan.exchangeFrom[i].foreground,role:plan.exchangeFrom[i].role}));
  }
  else if(t<7900){stage="pack";tiles=interpolate(plan.afterExchange,plan.finish,(t-6700)/1200);}
  else{stage="assembled";tiles=interpolate(plan.finish,plan.finish,0);}
  return {tiles,stage,frameX:-10-expansion*180,frameWidth:740+expansion*360};
}

const square="M0 0H90V90H0Z";
const circle="M45 0A45 45 0 1 1 45 90A45 45 0 1 1 45 0Z";
export function tileAppearance(id:number) {
  const kind=id%4;
  return {paths:kind===0?[circle]:kind===1?["M0 0H90L0 90Z","M90 0V90H0Z"]:kind===2?["M0 0H90A90 90 0 0 1 0 90Z"]:[square],colors:[PALETTE[id%6],PALETTE[(id+2)%6]]};
}
