/** Small real PDF with predictable page geometry and text, without a PDF-writing dependency. */
export function auditPdf(pages=3){
 const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],kids:number[]=[]
 for(let n=0;n<pages;n++){const page=objects.length+1,content=page+1;kids.push(page);objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 560] /Resources << /Font << /F1 3 0 R >> >> /Contents '+content+' 0 R >>');const text='BT /F1 20 Tf 40 500 Td (Enterprise report - page '+(n+1)+') Tj 0 -40 Td /F1 12 Tf (Local PDF rendering and extraction test.) Tj ET';objects.push('<< /Length '+text.length+' >>\nstream\n'+text+'\nendstream')}
 objects[1]='<< /Type /Pages /Kids ['+kids.map(n=>n+' 0 R').join(' ')+'] /Count '+pages+' >>'
 let result='%PDF-1.4\n';const offsets=[0];objects.forEach((object,n)=>{offsets.push(result.length);result+=(n+1)+' 0 obj\n'+object+'\nendobj\n'});const xref=result.length;result+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return new TextEncoder().encode(result)
}
