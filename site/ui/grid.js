import {NODES} from '../pipeline/graph.js';

export function mountGrid(root,status,{nodes=NODES,onSelect}={}){
  const byId=new Map(nodes.map(n=>[n.id,n])),cards=new Map();
  root.replaceChildren();
  for(const n of nodes){
    const card=document.createElement('button');card.type='button';card.className='stage-card';card.dataset.stage=n.id;
    card.innerHTML=`<span class="stage-head"><strong></strong><span class="kind"></span></span><span class="role"></span><span class="stage-status"><i class="dot"></i><span class="state"></span></span><span class="detail"></span><span class="meta"></span>`;
    card.querySelector('strong').textContent=n.label;
    card.querySelector('.kind').textContent=n.kind;
    card.querySelector('.role').textContent=n.role;
    card.querySelector('.meta').textContent=[n.deps.length&&`after ${n.deps.map(d=>byId.get(d).label).join(', ')}`,n.fallback&&`fallback: ${n.fallback}`].filter(Boolean).join(' · ');
    card.onclick=()=>onSelect?.(n.id);
    root.append(card);cards.set(n.id,card);
  }
  const update=()=>{for(const [id,card] of cards){const s=status.get(id);card.dataset.tone=s.tone;card.querySelector('.state').textContent=s.status;card.querySelector('.detail').textContent=s.detail;}};
  update();
  return {update,select(id){for(const [k,c] of cards)c.setAttribute('aria-pressed',String(k===id));}};
}
