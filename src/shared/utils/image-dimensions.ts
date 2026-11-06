/** Read a bounded header before asking the browser to decode a large source. */
export function imageDimensions(bytes:Uint8Array):{width:number;height:number}|null {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(start:number,length:number)=>String.fromCharCode(...bytes.subarray(start,start+length));let width=0,height=0
 if(bytes.length>=24&&bytes[0]===137&&ascii(1,3)==='PNG'){width=view.getUint32(16);height=view.getUint32(20)}
 else if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
  const kind=ascii(12,4);if(kind==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}
  else if(kind==='VP8L'&&bytes[20]===47){const packed=view.getUint32(21,true);width=1+(packed&16383);height=1+((packed>>>14)&16383)}
  else if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}
 }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){let at=2;while(at+4<=bytes.length){if(bytes[at]!==255)return null;const marker=bytes[at+1];if(marker===255){at++;continue}if(marker===217||marker===218)break;const length=view.getUint16(at+2);if(length<2||at+length+2>bytes.length)return null;if(marker>=192&&marker<=207&&![196,200,204].includes(marker)&&length>=7){height=view.getUint16(at+5);width=view.getUint16(at+7);break}at+=length+2}}
 return width>0&&height>0&&width*height<=80000000?{width,height}:null
}
