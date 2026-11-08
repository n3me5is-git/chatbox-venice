interface Action {send(data:unknown,options?:{target?:string}):Promise<unknown>;onMessage:(data:any,context:{peerId:string})=>void}
interface Room {makeAction(name:string):Action;onPeerJoin:(peerId:string)=>void;onPeerLeave:(peerId:string)=>void;leave():void}
declare const vendor:{joinRoom(config:Record<string,unknown>,room:string,callbacks?:Record<string,unknown>):Room;defaultRelayUrls:string[];qrcodegen:any;jsQR:(data:Uint8ClampedArray,width:number,height:number)=>{data:string}|null}
export default vendor
