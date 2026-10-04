// LiteRT.js cannot expose INT64 inputs. These graphs use INT64 only for
// token IDs, masks, shape data and position indices, all within INT32 range.
// Narrow those tensors and their constants in memory; learned weights stay intact.
export function browserIndices(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),root=v.getUint32(0,true);
const field=(table,index)=>{const vt=table-v.getInt32(table,true),slot=4+index*2;if(slot>=v.getUint16(vt,true))return 0;const offset=v.getUint16(vt+slot,true);return offset?table+offset:0;};
const ref=(table,index)=>{const f=field(table,index);return f?f+v.getUint32(f,true):0;};
const tables=(table,index)=>{const vector=ref(table,index);if(!vector)return[];return Array.from({length:v.getUint32(vector,true)},(_,i)=>{const p=vector+4+i*4;return p+v.getUint32(p,true);});};
const bufferTables=tables(root,4),narrow=new Set(),other=new Set();
for(const graph of tables(root,2)){
 for(const tensor of tables(graph,0)){const type=field(tensor,1),b=field(tensor,2),index=b?v.getUint32(b,true):0;if(type&&v.getUint8(type)===4){v.setUint8(type,2);if(index)narrow.add(index);}else if(index)other.add(index);}
 for(const op of tables(graph,3)){const kind=field(op,3);if(kind&&v.getUint8(kind)===37){const options=ref(op,4);for(const index of[0,1]){const p=field(options,index);if(p&&v.getUint8(p)===4)v.setUint8(p,2);}}}
}
for(const index of narrow){if(other.has(index))throw Error('Index buffer shared with another tensor type');const b=bufferTables[index],vector=ref(b,0),offsetField=field(b,1),sizeField=field(b,2);let start,size;
 if(vector){start=vector+4;size=v.getUint32(vector,true);}else if(offsetField&&sizeField){start=Number(v.getBigUint64(offsetField,true));size=Number(v.getBigUint64(sizeField,true));}else continue;
 if(size%8||start<0||start+size>bytes.byteLength)throw Error('Invalid index buffer');
 for(let i=0;i<size/8;i++){const value=v.getBigInt64(start+i*8,true);if(value < -2147483648n||value>2147483647n)throw Error('Index value exceeds INT32 range');v.setInt32(start+i*4,Number(value),true);}
 if(vector)v.setUint32(vector,size/2,true);else v.setBigUint64(sizeField,BigInt(size/2),true);
}
return bytes;}

