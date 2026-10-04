import {NODES} from '../pipeline/graph.js';

// Cards are built once (their order belongs to the sortable layout); setWorkflow only updates what each card says.
export function mountGrid(root,status,{nodes=NODES,onSelect}={}){
  const byId=new Map(nodes.map(n=>[n.id,n])),cards=new Map();let on=new Set(nodes.map(n=>n.id)),deps=new Map(nodes.map(n=>[n.id,n.deps]));
  root.replaceChildren();
  for(const n of nodes){
    const card=document.createElement('button');card.type='button';card.className='stage-card';card.dataset.stage=n.id;card.dataset.sortId=n.id;
    card.innerHTML=`<span class="stage-head"><span class="grip" aria-hidden="true">⠿</span><strong></strong><span class="kind"></span></span><span class="role"></span><span class="stage-status"><i class="dot"></i><span class="state"></span></span><span class="detail"></span><span class="meta"></span>`;
    card.querySelector('strong').textContent=n.label;
    card.querySelector('.kind').textContent=n.kind;
    card.querySelector('.role').textContent=n.role;
    card.onclick=()=>onSelect?.(n.id);
    root.append(card);cards.set(n.id,card);
  }
  const update=()=>{for(const [id,card] of cards){const s=status.get(id),n=byId.get(id),inc=on.has(id),after=deps.get(id).filter(d=>on.has(d));
    card.classList.toggle('off',!inc);card.dataset.tone=inc?s.tone:'idle';card.querySelector('.state').textContent=inc?s.status:'not in workflow';card.querySelector('.detail').textContent=inc?s.detail:'Include it from its stage panel or the graph.';
    card.querySelector('.meta').textContent=[after.length&&`after ${after.map(d=>byId.get(d).label).join(', ')}`,n.fallback&&`fallback: ${n.fallback}`].filter(Boolean).join(' · ');}};
  update();
  return {update,select(id){for(const [k,c] of cards)c.setAttribute('aria-pressed',String(k===id));},setWorkflow(all,enabled){on=new Set(enabled);deps=new Map(all.map(n=>[n.id,n.deps]));update();}};
}
