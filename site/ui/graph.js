import {NODES,edges,layout} from '../pipeline/graph.js';

const NS='http://www.w3.org/2000/svg',W=132,H=58,GAP_MAIN=46,GAP_CROSS=18,PAD=12;
const el=(name,attrs={})=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};

// Left-to-right on wide screens, top-to-bottom on narrow ones. Doubles as the workflow editor: drag from a stage's
// port (●) onto another stage to make it run after it; select a connection and press Delete (or its ×) to remove it.
// Excluded stages stay in place, dimmed, so they can be included again. The editor only reports intent through
// onConnect/onDisconnect; the app validates, applies and calls setWorkflow.
export function mountGraph(root,status,{onSelect,onConnect,onDisconnect}={}){
  const narrow=matchMedia('(max-width: 700px)');
  let all=NODES,on=new Set(NODES.map(n=>n.id)),groups=new Map(),at=new Map(),paths=[],selected=null,edgeKey=null,svg=null,link=null;
  const label=id=>all.find(n=>n.id===id).label;
  function draw(){
    // Included stages take the first rows; excluded ones go below every included row, so no connection runs behind them.
    const vertical=narrow.matches,base=layout([...all.filter(n=>on.has(n.id)),...all.filter(n=>!on.has(n.id))]),pos=base.pos,layers=base.layers;
    const firstFree=Math.max(...[...pos].filter(([id])=>on.has(id)).map(([,p])=>p.row))+1,next=new Map();
    for(const n of all)if(!on.has(n.id)){const p=pos.get(n.id),row=next.get(p.layer)??firstFree;pos.set(n.id,{layer:p.layer,row});next.set(p.layer,row+1);}
    const rows=Math.max(...[...pos.values()].map(p=>p.row))+1;
    const place=id=>{const {layer,row}=pos.get(id),main=PAD+layer*((vertical?H:W)+GAP_MAIN),cross=PAD+row*((vertical?W:H)+GAP_CROSS);return vertical?{x:cross,y:main}:{x:main,y:cross};};
    const span=n=>PAD*2+n*(vertical?H:W)+(n-1)*GAP_MAIN,breadth=n=>PAD*2+n*(vertical?W:H)+(n-1)*GAP_CROSS;
    const width=vertical?breadth(rows):span(layers),height=vertical?span(layers):breadth(rows);
    svg=el('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':'Pipeline stage graph. Drag from a stage port onto another stage to connect them; select a connection and press Delete to remove it.'});
    svg.style.maxWidth=`${width}px`;if(vertical)svg.style.minWidth=`${width}px`;
    const defs=el('defs'),marker=el('marker',{id:'arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
    marker.append(el('path',{d:'M0,0 L8,4 L0,8 z',class:'arrowhead'}));defs.append(marker);svg.append(defs);
    // Edges are built in (main, cross) coordinates; long edges run along their own row, then turn in the last gap.
    const pt=(m,c)=>vertical?`${c},${m}`:`${m},${c}`,LEN=vertical?H:W,BREADTH=vertical?W:H;
    paths=[];
    for(const e of edges(all)){
      if(!on.has(e.from)||!on.has(e.to))continue;
      const a=pos.get(e.from),b=pos.get(e.to),c1=PAD+a.row*(BREADTH+GAP_CROSS)+BREADTH/2,c2=PAD+b.row*(BREADTH+GAP_CROSS)+BREADTH/2;
      const s=PAD+a.layer*(LEN+GAP_MAIN)+LEN,end=PAD+b.layer*(LEN+GAP_MAIN),bend=b.layer-a.layer>1?end-GAP_MAIN:s,mid=(bend+end)/2;
      // A connection drawn backwards (to an earlier layer) cannot exist: layout follows the edges.
      const d=`M${pt(s,c1)} L${pt(bend,c1)} C${pt(mid,c1)} ${pt(mid,c2)} ${pt(end,c2)}`,key=`${e.from}>${e.to}`;
      const g=el('g',{class:'link'});g.dataset.from=e.from;g.dataset.to=e.to;
      const p=el('path',{d,class:`edge${e.failover?' failover':''}`,'marker-end':'url(#arrow)'});p.dataset.from=e.from;p.dataset.to=e.to;
      const hit=el('path',{d,class:'edge-hit',tabindex:0,role:'button','aria-label':`${label(e.to)} runs after ${label(e.from)}. Press Delete to remove.`});
      const [mx,my]=pt(mid,(c1+c2)/2).split(',').map(Number),del=el('g',{class:'edge-del',transform:`translate(${mx},${my})`,role:'button','aria-label':`Remove: ${label(e.to)} runs after ${label(e.from)}`});
      del.append(el('circle',{r:9}),Object.assign(el('text',{'text-anchor':'middle',dy:'4'}),{textContent:'×'}));
      hit.onclick=ev=>{ev.stopPropagation();selectEdge(edgeKey===key?null:key);};
      hit.onkeydown=ev=>{if(ev.key==='Delete'||ev.key==='Backspace'){ev.preventDefault();onDisconnect?.(e.from,e.to);}else if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectEdge(key);}else if(ev.key==='Escape')selectEdge(null);};
      del.onclick=ev=>{ev.stopPropagation();onDisconnect?.(e.from,e.to);};
      g.append(p,hit,del);svg.append(g);paths.push(p);
    }
    groups=new Map();at=new Map();
    for(const n of all){
      const {x,y}=place(n.id);at.set(n.id,{x,y});const g=el('g',{class:`node${on.has(n.id)?'':' off'}`,transform:`translate(${x},${y})`,tabindex:0,role:'button'});g.dataset.stage=n.id;
      g.append(el('rect',{width:W,height:H,rx:10}),el('circle',{cx:16,cy:20,r:5,class:'dot'}));
      const name=el('text',{x:28,y:24,class:'label'});name.textContent=n.label;
      const state=el('text',{x:14,y:44,class:'state'});
      const title=el('title');g.append(name,state,title);
      if(on.has(n.id)&&n.id!=='export'){const port=el('circle',{class:'port',r:6,cx:vertical?W/2:W,cy:vertical?H:H/2,'aria-hidden':'true'});port.dataset.stage=n.id;port.addEventListener('pointerdown',ev=>startLink(ev,n.id,port));g.append(port);}
      g.onclick=()=>onSelect?.(n.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(n.id);}};
      svg.append(g);groups.set(n.id,g);
    }
    svg.addEventListener('click',()=>selectEdge(null));
    root.replaceChildren(svg);update();select(selected);selectEdge(edgeKey);
  }
  const point=ev=>{const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  function startLink(ev,from,port){
    if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();
    const start={x:+port.getAttribute('cx')+at.get(from).x,y:+port.getAttribute('cy')+at.get(from).y};
    link=el('path',{class:'link-preview'});svg.append(link);root.classList.add('connecting');
    const target=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('#'+CSS.escape(root.id)+' .node')?.dataset.stage;
    // Near an edge of the (scrollable) graph or the window, scroll so stages off screen can still be reached.
    const edgeScroll=e=>{const r=root.getBoundingClientRect(),dx=e.clientX<r.left+32?-14:e.clientX>r.right-32?14:0,dy=e.clientY<48?-14:e.clientY>innerHeight-48?14:0;if(dx)root.scrollBy(dx,0);if(dy)scrollBy(0,dy);};
    const move=e=>{edgeScroll(e);const p=point(e);link.setAttribute('d',`M${start.x},${start.y} L${p.x},${p.y}`);for(const [id,g] of groups)g.classList.toggle('drop',id===target(e)&&id!==from);};
    const end=e=>{removeEventListener('pointermove',move);removeEventListener('pointerup',end);removeEventListener('pointercancel',end);
      link?.remove();link=null;root.classList.remove('connecting');for(const g of groups.values())g.classList.remove('drop');
      const to=e.type==='pointerup'?target(e):null;
      // The pointerup can land on a stage and also click it; the connection, not a selection, is what was meant.
      const swallow=ev=>ev.stopPropagation();addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>removeEventListener('click',swallow,{capture:true}),0);
      if(to&&to!==from)onConnect?.(from,to);};
    addEventListener('pointermove',move);addEventListener('pointerup',end);addEventListener('pointercancel',end);move(ev);
  }
  function selectEdge(key){edgeKey=key;for(const g of svg?.querySelectorAll('.link')??[])g.classList.toggle('selected',`${g.dataset.from}>${g.dataset.to}`===key);}
  function update(){
    for(const [id,g] of groups){const s=status.get(id),n=all.find(x=>x.id===id),inc=on.has(id),text=inc?s.status:'not in workflow';g.dataset.tone=inc?s.tone:'idle';g.querySelector('.state').textContent=text.length>18?text.slice(0,17)+'…':text;g.querySelector('title').textContent=`${n.label} (${n.kind}): ${inc?s.status+(s.detail?' — '+s.detail:''):'not in this workflow'}`;g.setAttribute('aria-label',`${n.label}, ${text}`);}
    for(const p of paths)p.classList.toggle('active',status.get(p.dataset.from).tone!=='idle'&&status.get(p.dataset.to).tone!=='idle');
  }
  function select(id){selected=id;for(const [k,g] of groups)g.setAttribute('aria-pressed',String(k===id));}
  narrow.addEventListener('change',draw);draw();
  return {update,select,setWorkflow(nodes,enabled){all=nodes;on=new Set(enabled);if(edgeKey&&!edges(all).some(e=>`${e.from}>${e.to}`===edgeKey))edgeKey=null;draw();}};
}
