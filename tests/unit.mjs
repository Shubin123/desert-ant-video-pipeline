import assert from 'node:assert/strict';
import {validateTimeline,planFromSentences,layaChoice} from '../site/failover.js';
const p=planFromSentences([{text:'A full sentence.',start:1,end:6},{text:'Another.',start:8,end:13}],45);
assert.equal(validateTimeline(p,20).seconds,45);
assert.equal(p.segments.reduce((n,s)=>n+s.frames,0),1350);
assert.throws(()=>validateTimeline({...p,seconds:44},20));
assert.throws(()=>validateTimeline({...p,segments:[{hold:-1,frames:1350}]},20));
assert.throws(()=>validateTimeline({...p,segments:[{start:0,end:40,frames:1350}]},20));
await assert.rejects(layaChoice('text',{a:'one'},{enabled:false}),/consent/);
await assert.rejects(layaChoice('text',{a:'one'},{enabled:true,endpoint:'http://example.com'}),/HTTPS/);
console.log('PASS: exact timelines, invalid boundaries, consent and endpoint safety');
const originalFetch=globalThis.fetch;
try {
 globalThis.fetch=async()=>new Response(JSON.stringify({answers:{selection:{choice:'invented_option',confidence:.9}}}));
 await assert.rejects(layaChoice('text',{a:'one'},{enabled:true,endpoint:'https://example.com'}),/Invalid Laya/);
 globalThis.fetch=async()=>new Response(JSON.stringify({answers:{selection:{choice:'a',confidence:.1}}}));
 assert.equal((await layaChoice('text',{a:'one'},{enabled:true,endpoint:'https://example.com'})).needsReview,true);
 globalThis.fetch=async()=>new Response('Service unavailable',{status:503});
 await assert.rejects(layaChoice('text',{a:'one'},{enabled:true,endpoint:'https://example.com'}),/503/);
 console.log('PASS: injected invalid Laya answer, confidence gate, and server failure');
} finally {globalThis.fetch=originalFetch;}
