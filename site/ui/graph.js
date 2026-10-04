import {NODES,edges,layout} from '../pipeline/graph.js';

const NS='http://www.w3.org/2000/svg',W=132,H=58,GAP_MAIN=46,GAP_CROSS=18,PAD=12;
const el=(name,attrs={})=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};

// Left-to-right on wide screens, top-to-bottom on narrow ones.
export function mountGraph(root,status,{nodes=NODES,onSelect}={}){
  const narrow=matchMedia('(max-width: 700px)');
  let groups=new Map(),paths=[],selected=null;
  function draw(){
    const vertical=narrow.matches,{pos,layers,rows}=layout(nodes);
    const place=id=>{const {layer,row}=pos.get(id),main=PAD+layer*((vertical?H:W)+GAP_MAIN),cross=PAD+row*((vertical?W:H)+GAP_CROSS);return vertical?{x:cross,y:main}:{x:main,y:cross};};
    const span=n=>PAD*2+n*(vertical?H:W)+(n-1)*GAP_MAIN,breadth=n=>PAD*2+n*(vertical?W:H)+(n-1)*GAP_CROSS;
    const width=vertical?breadth(rows):span(layers),height=vertical?span(layers):breadth(rows);
    const svg=el('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':'Pipeline stage graph'});
    svg.style.maxWidth=`${width}px`;if(vertical)svg.style.minWidth=`${width}px`;
    const defs=el('defs'),marker=el('marker',{id:'arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
    marker.append(el('path',{d:'M0,0 L8,4 L0,8 z',class:'arrowhead'}));defs.append(marker);svg.append(defs);
    // Edges are built in (main, cross) coordinates; long edges run along their own row, then turn in the last gap.
    const pt=(m,c)=>vertical?`${c},${m}`:`${m},${c}`,LEN=vertical?H:W,BREADTH=vertical?W:H;
    paths=[];
    for(const e of edges(nodes)){
      const a=pos.get(e.from),b=pos.get(e.to),c1=PAD+a.row*(BREADTH+GAP_CROSS)+BREADTH/2,c2=PAD+b.row*(BREADTH+GAP_CROSS)+BREADTH/2;
      const s=PAD+a.layer*(LEN+GAP_MAIN)+LEN,end=PAD+b.layer*(LEN+GAP_MAIN),bend=b.layer-a.layer>1?end-GAP_MAIN:s,mid=(bend+end)/2;
      const d=`M${pt(s,c1)} L${pt(bend,c1)} C${pt(mid,c1)} ${pt(mid,c2)} ${pt(end,c2)}`;
      const p=el('path',{d,class:`edge${e.failover?' failover':''}`,'marker-end':'url(#arrow)'});p.dataset.from=e.from;p.dataset.to=e.to;svg.append(p);paths.push(p);
    }
    groups=new Map();
    for(const n of nodes){
      const {x,y}=place(n.id),g=el('g',{class:'node',transform:`translate(${x},${y})`,tabindex:0,role:'button'});g.dataset.stage=n.id;
      g.append(el('rect',{width:W,height:H,rx:10}),el('circle',{cx:16,cy:20,r:5,class:'dot'}));
      const label=el('text',{x:28,y:24,class:'label'});label.textContent=n.label;
      const state=el('text',{x:14,y:44,class:'state'});
      const title=el('title');g.append(label,state,title);
      g.onclick=()=>onSelect?.(n.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(n.id);}};
      svg.append(g);groups.set(n.id,g);
    }
    root.replaceChildren(svg);update();if(selected)select(selected);
  }
  function update(){
    for(const [id,g] of groups){const s=status.get(id),n=nodes.find(x=>x.id===id);g.dataset.tone=s.tone;g.querySelector('.state').textContent=s.status.length>18?s.status.slice(0,17)+'…':s.status;g.querySelector('title').textContent=`${n.label} (${n.kind}): ${s.status}${s.detail?' — '+s.detail:''}`;g.setAttribute('aria-label',`${n.label}, ${s.status}`);}
    for(const p of paths)p.classList.toggle('active',status.get(p.dataset.from).tone!=='idle'&&status.get(p.dataset.to).tone!=='idle');
  }
  function select(id){selected=id;for(const [k,g] of groups)g.setAttribute('aria-pressed',String(k===id));}
  narrow.addEventListener('change',draw);draw();
  return {update,select};
}
