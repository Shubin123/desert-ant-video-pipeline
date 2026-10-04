// Declarative stage graph. Order in this list is the tie-breaker for execution order,
// so models still run one at a time in the same sequence as before.
// `needs` are inputs a stage cannot run without, `uses` are optional inputs, `gives` what it produces; the workflow
// editor checks them. Audio always comes from the source; a transcript or timeline can also come from the material.
export const NODES=[
  {id:'source',label:'Source',kind:'input',deps:[],role:'Decode the video locally; the original file is never modified.'},
  {id:'voz',label:'Voz',kind:'model',deps:['source'],gives:['words'],role:'Speech to timestamped words.',fallback:'Imported timestamped transcript'},
  {id:'ear',label:'Ear',kind:'model',deps:['source'],gives:['language'],role:'Spoken-language identification.',fallback:'English, flagged for review'},
  {id:'uhm',label:'Uhm',kind:'model',deps:['source'],gives:['fillers'],role:'Advisory filler detection; nothing is deleted automatically.',fallback:'Retain all source speech'},
  {id:'align',label:'Align',kind:'model',deps:['voz','ear'],needs:['words'],uses:['language'],gives:['words'],role:'Refine word timestamps.',fallback:'Original word timestamps'},
  {id:'clips',label:'Clips',kind:'model',deps:['align'],needs:['words'],gives:['highlights','clips-failure'],role:'Score highlight sentences.',fallback:'Laya, then complete-sentence proposal'},
  {id:'laya',label:'Laya',kind:'service',deps:['clips'],needs:['words'],uses:['clips-failure'],gives:['highlights'],failover:true,lane:1,role:'Text-only excerpt choice, used only when Clips fails.',fallback:'Deterministic complete-sentence proposal'},
  {id:'clear',label:'Clear',kind:'model',deps:['source'],gives:['audio'],role:'Speech enhancement.',fallback:'Original audio retained'},
  {id:'review',label:'Timeline',kind:'local',deps:['clips','laya','uhm','clear'],needs:['words'],uses:['highlights'],gives:['timeline'],role:'Exact-length plan with silent voice-over holds.'},
  {id:'export',label:'Export',kind:'local',deps:['review'],needs:['timeline'],uses:['audio'],role:'Frame-exact 30 fps H.264/AAC MP4.'},
];

export function order(nodes=NODES){
  const index=new Map(nodes.map((n,i)=>[n.id,i])),done=new Set(),out=[];
  for(const n of nodes)for(const d of n.deps)if(!index.has(d))throw Error(`${n.id} depends on unknown stage ${d}`);
  while(out.length<nodes.length){
    const next=nodes.find(n=>!done.has(n.id)&&n.deps.every(d=>done.has(d)));
    if(!next)throw Error('Stage graph has a cycle');
    done.add(next.id);out.push(next);
  }
  return out;
}

export function edges(nodes=NODES){
  const byId=new Map(nodes.map(n=>[n.id,n]));
  return nodes.flatMap(n=>n.deps.map(d=>({from:d,to:n.id,failover:!!(n.failover||byId.get(d).failover)})));
}

// Longest-path layering; returns positions in abstract layer/row units.
// A node's optional `lane` pins its row (Laya sits below the main chain as a visible detour).
export function layout(nodes=NODES){
  const depth=new Map();
  for(const n of order(nodes))depth.set(n.id,n.deps.length?1+Math.max(...n.deps.map(d=>depth.get(d))):0);
  const used=new Map(),pos=new Map(),take=(layer,row)=>{(used.get(layer)??used.set(layer,new Set()).get(layer)).add(row);};
  for(const n of nodes)if(Number.isInteger(n.lane)){pos.set(n.id,{layer:depth.get(n.id),row:n.lane});take(depth.get(n.id),n.lane);}
  for(const n of nodes){if(pos.has(n.id))continue;const layer=depth.get(n.id);let row=0;while(used.get(layer)?.has(row))row++;pos.set(n.id,{layer,row});take(layer,row);}
  return {pos,layers:Math.max(...depth.values())+1,rows:Math.max(...[...pos.values()].map(p=>p.row))+1};
}

// Transitive dependencies of a stage, and stages that depend on it.
export function ancestors(id,nodes=NODES){
  const byId=new Map(nodes.map(n=>[n.id,n])),out=new Set(),walk=x=>{for(const d of byId.get(x)?.deps??[])if(!out.has(d)){out.add(d);walk(d);}};
  if(!byId.has(id))throw Error(`Unknown stage ${id}`);walk(id);return out;
}
export function descendants(id,nodes=NODES){
  if(!nodes.some(n=>n.id===id))throw Error(`Unknown stage ${id}`);
  const out=new Set(),walk=x=>{for(const n of nodes)if(n.deps.includes(x)&&!out.has(n.id)){out.add(n.id);walk(n.id);}};
  walk(id);return out;
}
// Stages to execute for a graph run: 'stage' (one), 'upstream' (deps + self), 'downstream' (self + dependents).
export function selection(id,mode,nodes=NODES){
  if(!nodes.some(n=>n.id===id))throw Error(`Unknown stage ${id}`);
  if(mode==='stage')return new Set([id]);
  if(mode==='upstream')return new Set([...ancestors(id,nodes),id]);
  if(mode==='downstream')return new Set([id,...descendants(id,nodes)]);
  throw Error(`Unknown run mode ${mode}`);
}
