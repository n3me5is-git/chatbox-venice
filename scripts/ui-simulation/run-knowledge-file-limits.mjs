import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'

export async function runKnowledgeFileLimits({evaluate,output}){
 const result=await evaluate(`(${async function(){
  const encoder=new TextEncoder(),limit=50*1024*1024
  function pdf(size){
   const body='BT /F1 12 Tf 50 750 Td (Enterprise knowledge source at fifty MiB.) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${body.length} >>\nstream\n${body}\nendstream`]
   let base='%PDF-1.4\n',offsets=[0];for(let n=0;n<objects.length;n++){offsets.push(base.length);base+=(n+1)+' 0 obj\n'+objects[n]+'\nendobj\n'}offsets.push(base.length)
   const prefix=padding=>base+'6 0 obj\n<< /Type /EmbeddedFile /Length '+padding+' >>\nstream\n',tail=(length,padding)=>'\nendstream\nendobj\nxref\n0 7\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+(length+padding+'\nendstream\nendobj\n'.length)+'\n%%EOF\n'
   let padding=size;for(let n=0;n<8;n++){const head=prefix(padding);padding=size-head.length-tail(head.length,padding).length}const head=prefix(padding),end=tail(head.length,padding),bytes=new Uint8Array(size);if(head.length+padding+end.length!==size)throw Error('Fixture length mismatch');bytes.set(encoder.encode(head));bytes.set(encoder.encode(end),head.length+padding);return bytes
  }
  const {parsePdfFileLocally}=await import('/src/renderer/packages/pdf-parser.ts'),start=performance.now()
  const text=await (async()=>{const bytes=pdf(limit);return parsePdfFileLocally(new File([bytes],'enterprise-large.pdf',{type:'application/pdf'}),{failOnPageError:true})})()
  let readOversize=false,rejected=false;try{await parsePdfFileLocally({name:'oversize.pdf',size:limit+1,arrayBuffer:async()=>{readOversize=true;throw Error('Oversized body was read')}})}catch(error){rejected=String(error.message)==='local_parser_file_too_large'}
  return {sourceBytes:limit,text,oversizeRejectedBeforeRead:rejected&&!readOversize,milliseconds:Math.round(performance.now()-start)}
 }.toString()})()`)
 assert.equal(result.sourceBytes,50*1024*1024)
 assert.match(result.text,/Enterprise knowledge source at fifty MiB/)
 assert.equal(result.oversizeRejectedBeforeRead,true)
 await writeFile(path.join(output,'knowledge-file-limits.json'),JSON.stringify(result,null,2))
}
