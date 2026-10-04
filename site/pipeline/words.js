// Timestamped-word checks shared by the app and stage steps.
export function validateWords(value,duration){if(!Array.isArray(value)||!value.length)throw Error('No timestamped words found.');let previous=-Infinity;return value.map(w=>{const text=String(w.text??w.word??'').trim(),start=Number(w.start),end=Number(w.end);if(!text||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>duration+.1||start<previous)throw Error('Transcript has invalid text or timestamps.');previous=start;return {text,start,end};});}

// Align refines each word on its own, so neighbours can cross. Keep every refined word that stays valid and in order;
// revert only the conflicting ones (the one that drifted further) to their original, already ordered, timing.
export function repairAlignment(original,aligned,duration){
  if(!Array.isArray(aligned)||aligned.length!==original.length)throw Error(`Align returned ${Array.isArray(aligned)?aligned.length:'no'} words for ${original.length}`);
  const words=aligned.map((w,i)=>{const o=original[i],start=Number(w?.start),end=Number(w?.end);return w?.refined!==false&&Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>=start&&end<=duration+.1?{text:o.text,start,end,refined:true}:{text:o.text,start:o.start,end:o.end,refined:false};});
  for(let changed=true;changed;){changed=false;for(let i=1;i<words.length;i++)if(words[i].start<words[i-1].start){const drift=k=>Math.abs(words[k].start-original[k].start),j=words[i].refined&&words[i-1].refined?(drift(i)>=drift(i-1)?i:i-1):words[i].refined?i:i-1;words[j]={text:original[j].text,start:original[j].start,end:original[j].end,refined:false};changed=true;}}
  const kept=words.filter(w=>w.refined).length;
  return {words,kept,reverted:words.length-kept};
}
