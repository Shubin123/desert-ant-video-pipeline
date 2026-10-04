// Drag-to-reorder for the children of a grid. Mouse/pen drag from anywhere outside form controls (or only from
// `handle` when given); touch drags only from `.grip` so the page still scrolls; Alt+Arrow keys move the focused item.
// Order is remembered per browser under `key`; storage failures are ignored.
export function move(list,from,to){const out=[...list],[item]=out.splice(from,1);out.splice(Math.max(0,Math.min(to,out.length)),0,item);return out;}

const read=key=>{try{return JSON.parse(localStorage.getItem(key))??null;}catch{return null;}};
const write=(key,value)=>{try{value?localStorage.setItem(key,JSON.stringify(value)):localStorage.removeItem(key);}catch{}};

export function sortable(container,{key,handle,label=el=>el.dataset.sortId,announce}={}){
  const items=()=>[...container.children].filter(el=>el.dataset.sortId);
  const ids=()=>items().map(el=>el.dataset.sortId);
  const initial=ids();
  const apply=order=>{const byId=new Map(items().map(el=>[el.dataset.sortId,el]));for(const id of [...order,...initial])if(byId.has(id)){container.append(byId.get(id));byId.delete(id);}};
  const saved=read(key);if(Array.isArray(saved))apply(saved);
  const commit=item=>{write(key,ids());announce?.(`${label(item)} moved to position ${items().indexOf(item)+1} of ${items().length}`);container.dispatchEvent(new CustomEvent('reorder',{detail:ids()}));};

  let drag=null;
  container.addEventListener('pointerdown',e=>{
    const item=e.target.closest('[data-sort-id]');
    if(!item||item.parentElement!==container||e.button!==0)return;
    const fromHandle=e.target.closest(handle??'.grip');
    if(e.pointerType==='touch'&&!e.target.closest('.grip'))return;
    if(handle&&!fromHandle)return;
    if(!fromHandle&&e.target.closest('input,select,textarea,a,video,pre,label,details'))return;
    drag={item,x:e.clientX,y:e.clientY,id:e.pointerId,active:false};
  });
  addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(!drag.active){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.active=true;drag.item.classList.add('dragging');container.classList.add('sorting');}
    e.preventDefault();
    // Scroll when dragging near the window edge so off-screen targets are reachable.
    if(e.clientY<48)scrollBy(0,-16);else if(e.clientY>innerHeight-48)scrollBy(0,16);
    const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-sort-id]');
    if(!over||over===drag.item||over.parentElement!==container)return;
    const list=items(),from=list.indexOf(drag.item),to=list.indexOf(over),r=over.getBoundingClientRect();
    const after=to>from?true:to<from?false:e.clientY>r.top+r.height/2;
    over.insertAdjacentElement(after?'afterend':'beforebegin',drag.item);
  },{passive:false});
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const {item,active}=drag;drag=null;
    if(!active)return;
    item.classList.remove('dragging');container.classList.remove('sorting');
    // A drag must not also count as a click on the item.
    const swallow=ev=>{ev.stopPropagation();ev.preventDefault();};
    addEventListener('click',swallow,{capture:true,once:true});
    setTimeout(()=>removeEventListener('click',swallow,{capture:true}),0);
    commit(item);
  };
  addEventListener('pointerup',end);addEventListener('pointercancel',end);
  container.addEventListener('keydown',e=>{
    const item=e.target.closest('[data-sort-id]');
    if(!item||item.parentElement!==container||!e.altKey||!e.key.startsWith('Arrow'))return;
    e.preventDefault();
    const list=items(),from=list.indexOf(item),to=from+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1);
    if(to<0||to>=list.length)return;
    apply(move(list,from,to).map(el=>el.dataset.sortId));e.target.focus();commit(item);
  });
  return {ids,reset(){apply(initial);write(key,null);announce?.('Layout reset');container.dispatchEvent(new CustomEvent('reorder',{detail:ids()}));}};
}
