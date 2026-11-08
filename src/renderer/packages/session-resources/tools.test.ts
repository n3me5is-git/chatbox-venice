import { beforeEach,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({index:vi.fn(),write:vi.fn(),read:vi.fn(),list:vi.fn(),resize:vi.fn()}))
vi.mock('./files',()=>({sessionFiles:{index:state.index,write:state.write,list:async()=>[]}}))
vi.mock('./service',()=>({listSessionResources:state.list,readSessionResource:state.read}))
vi.mock('./python-tools',()=>({sessionPythonTool:async()=>({})}))
vi.mock('@/packages/mobile-work-mode/execution-service',()=>({capacitorExecution:{}}))
vi.mock('@/packages/pic_utils',()=>({getImageBase64AndResize:state.resize}))
import { buildSessionWorkspaceTools } from './tools'
const context={toolCallId:'view',messages:[],abortSignal:new AbortController().signal,context:{}}
beforeEach(()=>{
  vi.clearAllMocks();state.index.mockResolvedValue({files:[],removed:[]});state.write.mockResolvedValue({key:'session-file:encrypted-preview'})
  state.list.mockResolvedValue({items:[{id:'image:one',path:'images/one/1.png',name:'1.png',mime:'image/png',origin:'image',key:'picture:generated'}]})
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
  state.read.mockImplementation(async()=>({bytes:Uint8Array.from(png)}));state.resize.mockResolvedValue('data:image/webp;base64,AAECAw==')
})
it('lists and previews an existing generated image through the vision pipeline, saving only an encrypted working preview',async()=>{
  const record=vi.fn(async(input:any)=>({file_path:input.label,image_storage_key:await input.storeImage(input.dataUrl),media_type:'image/webp'})),reserve=vi.fn(),toModelOutput=vi.fn(async()=>({type:'text' as const,value:'Image attached'}))
  const tools=await buildSessionWorkspaceTools('chat',{record,reserve,toModelOutput})
  const output=await tools.session_file.execute!({action:'preview',path:'images/one/1.png'},context)
  expect(output).toMatchObject({image_storage_key:'session-file:encrypted-preview'});expect(reserve).toHaveBeenCalledOnce()
  expect(state.write).toHaveBeenCalledWith('chat',expect.stringMatching(/^previews\/.*\.webp$/),expect.any(Uint8Array),{mime:'image/webp'})
  expect(record).toHaveBeenCalledOnce();expect(state.resize).toHaveBeenCalledOnce()
})
it('refuses image transmission to a non-vision model and still permits listing local files',async()=>{
  const tools=await buildSessionWorkspaceTools('chat')
  expect(await tools.session_file.execute!({action:'list'},context)).toMatchObject({files:[{path:'images/one/1.png'}]})
  await expect(tools.session_file.execute!({action:'preview',path:'images/one/1.png'},context)).rejects.toThrow('vision-capable')
  expect(state.read).not.toHaveBeenCalled()
})
