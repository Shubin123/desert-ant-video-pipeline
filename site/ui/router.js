// Hash routes: #/<view> or #/<view>/<stage>. Only the pipeline map switches; the workflow panels stay mounted.
export function parse(hash){const [,view='',stage='']=hash.match(/^#\/([\w-]*)\/?([\w-]*)/)??[];return {view,stage};}

export function startRouter(views,{fallback,onStage}){
  const apply=()=>{
    const {view,stage}=parse(location.hash),active=views[view]?view:fallback;
    for(const [name,el] of Object.entries(views))el.hidden=name!==active;
    for(const a of document.querySelectorAll('[data-route]'))a.setAttribute('aria-current',a.dataset.route===active?'page':'false');
    onStage?.(stage||null,active);
  };
  addEventListener('hashchange',apply);apply();
  return {go(view,stage){const next=`#/${view}${stage?'/'+stage:''}`;if(location.hash!==next)location.hash=next;}};
}
