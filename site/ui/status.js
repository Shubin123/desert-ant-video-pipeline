// Derives per-stage status from audit entries so the views never drift from the log.
const ALIAS={Laya:'laya','worked example':'source',example:'source',input:'source',transcript:'voz',timeline:'review',project:'export'};
const TONE={running:'running',passed:'passed','fallback passed':'passed',loaded:'passed',ready:'passed',imported:'fallback',fallback:'fallback',skipped:'fallback','needs review':'review',failed:'failed',unavailable:'failed',cancelled:'failed','needs attention':'failed','not needed':'idle'};

export function createStatus(){
  const stages=new Map(),subs=new Set();
  const emit=()=>{for(const fn of subs)fn();};
  return {
    get:id=>stages.get(id)??{tone:'idle',status:'waiting',detail:'',history:[]},
    push(entry){
      const id=ALIAS[entry.stage]??entry.stage,prev=stages.get(id)?.history??[];
      stages.set(id,{tone:TONE[entry.status]??'running',status:entry.status,detail:entry.detail,history:[...prev,entry]});emit();
    },
    reset(){stages.clear();emit();},
    subscribe(fn){subs.add(fn);return ()=>subs.delete(fn);},
  };
}
