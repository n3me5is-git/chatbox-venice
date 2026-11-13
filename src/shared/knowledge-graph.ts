export type KnowledgeGraphNode={id:string;name:string;type:string}
export type KnowledgeGraphEdge={subject:string;object:string;predicate:string;fileId:string;sourceHash:string;textHash:string;anchor:{start:number;end:number;quote:string}}
/** One bounded deterministic layout. No animation loop, no per-frame force simulation. */
export function layoutKnowledgeGraph(input:KnowledgeGraphNode[],edges:Pick<KnowledgeGraphEdge,'subject'|'object'>[]){
 const nodes=[...input].sort((a,b)=>a.type.localeCompare(b.type)||a.id.localeCompare(b.id)).slice(0,150).map((node,index)=>({...node,x:400+Math.cos(index*2.399963)*Math.sqrt(index+1)*22,y:260+Math.sin(index*2.399963)*Math.sqrt(index+1)*16})),indices=new Map(nodes.map((node,index)=>[node.id,index])),links=edges.slice(0,300).flatMap(edge=>{const a=indices.get(edge.subject),b=indices.get(edge.object);return a===undefined||b===undefined?[]:[[a,b]]})
 for(let step=0;step<36;step++){const dx=new Float64Array(nodes.length),dy=new Float64Array(nodes.length)
  for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){const x=nodes[a].x-nodes[b].x,y=nodes[a].y-nodes[b].y,d=Math.max(30,x*x+y*y),f=140/d;dx[a]+=x*f;dy[a]+=y*f;dx[b]-=x*f;dy[b]-=y*f}
  for(const [a,b]of links){const x=nodes[b].x-nodes[a].x,y=nodes[b].y-nodes[a].y;dx[a]+=x*.018;dy[a]+=y*.018;dx[b]-=x*.018;dy[b]-=y*.018}
  nodes.forEach((node,index)=>{node.x=Math.max(35,Math.min(765,node.x+Math.max(-9,Math.min(9,dx[index]+(400-node.x)*.008))));node.y=Math.max(30,Math.min(490,node.y+Math.max(-9,Math.min(9,dy[index]+(260-node.y)*.008))))})
 }
 return nodes
}
