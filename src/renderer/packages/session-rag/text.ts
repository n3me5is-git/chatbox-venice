/** Incremental UTF-8 decoding lets KB reject an oversized extracted text
 * without allocating a full 50 MiB source as a JavaScript string. */
export function decodeRagText(bytes:Uint8Array,maximumChars=Infinity):string|undefined{
 const decoder=new TextDecoder('utf-8',{fatal:true});let text=''
 for(let offset=0;offset<bytes.length;offset+=65536){let part:string;try{part=decoder.decode(bytes.subarray(offset,offset+65536),{stream:true})}catch{return undefined}if(part.includes('\0'))return undefined;if(text.length+part.length>maximumChars)throw Error('Document text exceeds the indexing limit');text+=part}
 let tail:string;try{tail=decoder.decode()}catch{return undefined}if(tail.includes('\0'))return undefined;if(text.length+tail.length>maximumChars)throw Error('Document text exceeds the indexing limit');return text+tail
}
