const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const file = path.resolve(__dirname, '../app/intro/hero-motion.ts');
const model = new Module(file, module);
model._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {sampleHero,CYCLE_MS,TILE_SIZE}=model.exports;
let samples=0, verticalMoves=0, previous=null;
const seen=new Set(); const exchangeStages=new Set();
for(let t=0;t<=CYCLE_MS*20;t+=10){
  const state=sampleHero(t); seen.add(state.stage);
  assert(state.tiles.length<=27);
  for(let i=0;i<state.tiles.length;i++){
    const a=state.tiles[i];
    assert(a.y>=-1e-8&&a.y+TILE_SIZE<=270+1e-8,'three-row escape');
    for(let j=i+1;j<state.tiles.length;j++){
      const b=state.tiles[j];
      assert(Math.abs(a.x-b.x)>=90-1e-8||Math.abs(a.y-b.y)>=90-1e-8,`collision: ${t}ms, ${a.id}/${b.id}`);
    }
    const prior=previous?.tiles.find(b=>b.id===a.id);
    if(prior){
      const dx=Math.abs(a.x-prior.x),dy=Math.abs(a.y-prior.y);
      assert(dx<1e-8||dy<1e-8,`diagonal movement at ${t}`);
      if(dy>1e-8) verticalMoves++;
      if(state.stage==='pack') assert(dy<1e-8,'vertical packing');
    }
    if(a.foreground){ exchangeStages.add(state.stage);
      assert(['move-2','move-4'].includes(state.stage));
      const lane=state.tiles.filter(b=>b.y===a.y).sort((a,b)=>a.x-b.x);
      if(a.role==='outgoing')assert.equal(a.id,lane[0].id,'exit not leftmost');
      if(a.role==='incoming')assert.equal(a.id,lane[lane.length-1].id,'entry not rightmost');
    }
  }
  previous=state;samples++;
}
assert(verticalMoves>100,'no vertical choreography');
assert.equal(seen.size,7); assert.deepEqual([...exchangeStages],['move-2','move-4']);
for(let cycle=0;cycle<20;cycle++){
  const expanded=sampleHero(cycle*CYCLE_MS+1900).tiles;
  for(const y of [0,90,180]){
    const lane=expanded.filter(t=>t.y===y).sort((a,b)=>a.x-b.x);
    for(let i=1;i<lane.length;i++) assert([0,90].includes(lane[i].x-lane[i-1].x-TILE_SIZE),'gap is not one cell');
  }
  for(let col=0;col<12;col++) assert(expanded.some(t=>t.x===col*90-180),'an entire expanded column is empty');
  for(const beat of [1900,3100,4300,5500]) {
    const start=sampleHero(cycle*CYCLE_MS+beat+100).tiles;
    const end=sampleHero(cycle*CYCLE_MS+beat+400).tiles;
    assert(start.some(a=>end.some(b=>b.id===a.id&&Math.abs(a.x-b.x)>1)),'beat has no horizontal motion');
    assert(start.some(a=>end.some(b=>b.id===a.id&&Math.abs(a.y-b.y)>1)),'beat has no simultaneous vertical motion');
  }
  for(const boundary of [800,1900,3100,4300,5500,6700,7900,9000]){
    const t=cycle*CYCLE_MS+boundary;
    const visible=s=>s.tiles.filter(a=>a.x>-1000&&a.x<1500);
    const before=visible(sampleHero(t-.001)),after=visible(sampleHero(t+.001));
    assert.equal(before.length,after.length);
    for(const a of before){
      const b=after.find(b=>b.id===a.id);assert(b,`identity jump at ${t}`);
      assert(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<.001,`position jump at ${t}`);
    }
  }
}
console.log(`PASS: ${samples} samples; scattered one-cell gaps; simultaneous horizontal + vertical motion on all four beats; no collisions, diagonal moves, boundary escapes, invalid exchanges, or loop jumps.`);
