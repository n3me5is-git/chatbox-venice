import {IndexingStatus} from './IndexingStatus'
import {useSettingsStore} from '@/stores/settingsStore'
import {KnowledgeDocumentViewer} from './KnowledgeDocumentViewer'
import {collectionDirectories} from '@/packages/knowledge-collections/service'
import {knowledgeFolderAvailable} from '@/packages/knowledge-collections/linked-folder'
import {CollectionFolder} from './CollectionFolder'
import {KnowledgeGraph} from './KnowledgeGraph'
import {CollectionIntelligence,collectionIntelligence} from './CollectionIntelligence'
import {Accordion,ActionIcon,Checkbox,SimpleGrid,Switch,SegmentedControl,Tabs} from '@mantine/core'
import {IconArrowLeft,IconDots,IconPlus} from '@tabler/icons-react'
import {FeatureMenu as Menu} from '@/components/common/FeatureMenu'
import {CollectionDocuments} from './CollectionDocuments'
import {useOverlayManager} from '@/components/layout/Overlay'
import {settingsStore} from '@/stores/settingsStore'
import {Alert,Badge,Button,Card,Group,Loader,Stack,Text,TextInput} from '@mantine/core'
import {useEffect,useState,useSyncExternalStore} from 'react'
import {useTranslation} from 'react-i18next'
import {useQueryClient} from '@tanstack/react-query'
import {SettingsPage} from '@/components/settings/SettingsLayout'
import {AdaptiveModal} from '@/components/common/AdaptiveModal'
import {forkT as ft} from '@/i18n/fork'
import {knowledgeCollections as defaultStore} from '@/packages/knowledge-collections/service'
import type {KnowledgeCollections} from '@/packages/knowledge-collections/store'
import {defaultRagSettings} from '@/packages/session-rag/defaults'
import type {CollectionData,CollectionSummary} from '@/packages/knowledge-collections/store'
import type {RagSettings,RagIndex} from '@shared/session-rag'
import type {KnowledgeBase} from '@shared/types'
import {parseKnowledgeBaseModelString} from '@shared/utils/knowledge-base-model-parser'
import {RagSettingsSchema} from '@shared/session-rag'
import platform from '@/platform'
import {CollectionSettings,collectionConsentLabel} from './CollectionSettings'
import {CollectionProtection} from './CollectionProtection'
import {ModelSelectorV2} from '@/components/ModelSelectorV2'
import {legacyKnowledgeController} from '@/platform/knowledge-base/portable-controller'
import {lazy,Suspense} from 'react'
const LegacyManager=lazy(()=>import('./KnowledgeBase'))

const idleSubscribe=()=>()=>{},idleSnapshot=()=>0
export default function CollectionsPage({service=defaultStore}:{service?:KnowledgeCollections}={}){
 const [sourceFile,setSourceFile]=useState<number>()
 const [workspaceTab,setWorkspaceTab]=useState<string|null>('documents'),[homeTab,setHomeTab]=useState<string|null>('collections'),[previewKind,setPreviewKind]=useState<'parsed'|'passages'>('passages')
 const [createMode,setCreateMode]=useState('new'),[createFolder,setCreateFolder]=useState(false),[createEncrypted,setCreateEncrypted]=useState(true)
 const store=service
 useSyncExternalStore(store.progress?.subscribe||idleSubscribe,store.progress?.snapshot||idleSnapshot,store.progress?.snapshot||idleSnapshot)
 const progressProviders=useSettingsStore(state=>state.providers),indexJob=selected?store.progress?.get(selected):undefined
 useTranslation();const client=useQueryClient(),revision=useSyncExternalStore(store.vault.keys.subscribe,store.vault.keys.snapshot,store.vault.keys.snapshot)
 const [intelligence,setIntelligence]=useState(()=>collectionIntelligence({}))
 const [rerankMode,setRerankMode]=useState<'api'|'llm'>('api')
 const [rerankProvider,setRerankProvider]=useState(''),[rerankModel,setRerankModel]=useState('')
 const [graph,setGraph]=useState(false),[mountDialog,setMountDialog]=useState(false),[writeMount,setWriteMount]=useState(false),[allGraphs,setAllGraphs]=useState(false),[graphIds,setGraphIds]=useState<number[]>([]),[globalQuery,setGlobalQuery]=useState(''),[globalResults,setGlobalResults]=useState<Awaited<ReturnType<KnowledgeCollections['searchAcross']>>>()
 const [legacyManager,setLegacyManager]=useState(false)
 const [entries,setEntries]=useState<CollectionSummary[]>([]),[selected,setSelected]=useState<number>(),[detail,setDetail]=useState<CollectionData>(),[index,setIndex]=useState<RagIndex|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[creating,setCreating]=useState(false),[name,setName]=useState(''),[settings,setSettings]=useState<RagSettings>(defaultRagSettings),[ack,setAck]=useState(false),[protection,setProtection]=useState(false),[preview,setPreview]=useState(''),[query,setQuery]=useState(''),[results,setResults]=useState<Awaited<ReturnType<typeof store.search>>>(),[legacy,setLegacy]=useState<KnowledgeBase[]>([])
 useEffect(()=>{let active=true;const update=()=>{if(selected)void Promise.all([store.data(selected),store.indexStatus(selected)]).then(async([data,index])=>{await store.assert(selected);if(active){setDetail(data);setIndex(index)}}).catch(()=>{})};window.addEventListener('knowledge-collections:changed',update);return()=>{active=false;window.removeEventListener('knowledge-collections:changed',update)}},[selected,store])
 const collectionLocked=(entry:CollectionSummary)=>entry.locked||[entry.scope,...entry.pendingScopes||[]].some(scope=>!store.vault.keys.isUnlocked(scope))
 const current=entries.find(item=>item.id===selected),locked=!!current&&(collectionLocked(current)||!!current.directory&&!store.directoryUnlocked(selected!)),readOnly=!!current?.directory&&!current.directory.writable
 const refresh=async()=>{setEntries(await store.list());await client.invalidateQueries({queryKey:['knowledge-bases']})}
 const load=async(id:number,keepDraft=false)=>{const [data,index]=await Promise.all([store.data(id),store.indexStatus(id)]);await store.assert(id);setDetail(data);if(!keepDraft){setName(data.name);setSettings(data.settings);setIntelligence(collectionIntelligence(data));setRerankProvider(data.rerankProvider||'');setRerankModel(data.rerankModel||'');setRerankMode(data.rerankMode||'api');setAck(false)}setIndex(index)}
 useEffect(()=>{let active=true;setDetail(undefined);setSourceFile(undefined);setPreview('');setResults(undefined);setProtection(false);if(!allGraphs)setGraph(false);void store.list().then(items=>{if(active)setEntries(items)}).catch(error=>{if(active)setError((error as Error).message)});if(selected)void store.data(selected).then(async data=>{const index=await store.indexStatus(selected);if(active){setDetail(data);setName(data.name);setSettings(data.settings);setIndex(index)}}).catch(()=>{});return()=>{active=false}},[selected,revision])
 const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();await refresh()}catch(error){setError((error as Error).message)}finally{setBusy(false);setProgress('')}}
 const select=(id:number)=>void run(async()=>{await store.authorize(id);setWorkspaceTab('documents');setSelected(id);await load(id)})
 const addFiles=(files:FileList|null)=>{if(!files||!selected)return;const copied=Array.from(files);void run(async()=>{await store.addMany(selected,copied);await load(selected,true)})}
 const openCreate=()=>{setCreateMode('new');setCreateFolder(false);setCreateEncrypted(true);setWriteMount(false);setName('');setSettings(defaultRagSettings());setAck(false);setCreating(true)}
 const migrate=(kb:KnowledgeBase)=>void run(async()=>{
   const parsed=parseKnowledgeBaseModelString(kb.embeddingModel);if(!parsed)throw Error('Choose an embedding model')
   const cfg=RagSettingsSchema.parse({...defaultRagSettings(),provider:parsed.providerId,model:parsed.modelId}),id=await store.create(kb.name,cfg),controller=platform.getKnowledgeBaseController()
   try{for(const file of await controller.listFiles(kb.id)){if(!file.chunk_count)continue;let content='';for(let start=0;start<file.chunk_count;start+=20){const chunks=await controller.readFileChunks(kb.id,Array.from({length:Math.min(20,file.chunk_count-start)},(_,n)=>({fileId:file.id,chunkIndex:start+n})));content+=chunks.map(chunk=>chunk.text).join('\n\n')+'\n\n';if(content.length>500000)throw Error('Document text exceeds the indexing limit')}if(content.trim())await store.add(id,new File([content],file.filename+'.indexed.md',{type:'text/markdown'}))}
   }catch(error){await store.remove(id).catch(()=>{});throw error}
   setSelected(id);await load(id)
 })

 const dirty=!!detail&&(name!==detail.name||JSON.stringify(settings)!==JSON.stringify(detail.settings)||rerankProvider!==(detail.rerankProvider||'')||rerankModel!==(detail.rerankModel||'')||rerankMode!==(detail.rerankMode||'api')||JSON.stringify(intelligence)!==JSON.stringify(collectionIntelligence(detail)))
 const closeCollection=()=>{if(dirty&&!window.confirm(ft('Discard unsaved collection settings?')))return;setSelected(undefined);setDetail(undefined);setResults(undefined);setPreview('')}
 useOverlayManager(!!selected&&!graph&&!creating&&!protection&&!preview&&sourceFile===undefined,closeCollection)
 const removeCollection=()=>{if(selected&&window.confirm(ft(current?.directory?'Unmount this collection? Its folder, sources and database will be kept.':'Delete this collection and all its encrypted documents and vectors?')))void run(async()=>{await store.remove(selected);setSelected(undefined);setDetail(undefined)})}

 return <SettingsPage title={ft('Knowledge Base')} description={!selected?ft('Keep documents in collections and use them in any chat.'):undefined}>
 <div className="feature-panel"><Stack gap="md">
 {error&&<Alert color="red" role="alert">{ft(error)}</Alert>}
 {indexJob&&<IndexingStatus job={indexJob} providers={progressProviders} onCancel={()=>store.cancel(selected!)}/>}
 {busy&&!indexJob&&<Group role="status" wrap="wrap"><Loader size="sm"/><Text size="sm">{progress?ft('Indexing file')+': '+progress:ft('Working…')}</Text>{selected&&store.running(selected)&&<Button variant="subtle" color="red" onClick={()=>store.cancel(selected)}>{ft('Stop indexing')}</Button>}</Group>}
 {!selected&&<SimpleGrid cols={{base:1,sm:2}} spacing="xs" data-testid="knowledge-overview-actions"><Button fullWidth leftSection={<IconPlus size={18}/>} onClick={openCreate} disabled={busy}>{ft('New collection')}</Button>{knowledgeFolderAvailable()&&<Button fullWidth variant="default" disabled={busy} onClick={()=>{setWriteMount(false);setMountDialog(true)}}>{ft('Open folder collection')}</Button>}</SimpleGrid>}
 {!selected&&<Tabs value={homeTab} onChange={setHomeTab} keepMounted={false}>
  <Tabs.List grow><Tabs.Tab value="collections">{ft('Collections')}</Tabs.Tab><Tabs.Tab value="search">{ft('Search across collections')}</Tabs.Tab></Tabs.List>
  <Tabs.Panel value="collections" pt="md"><Stack gap="md">
   {!entries.length&&<Card withBorder><Stack py="md"><Text fw={600}>{ft('Your knowledge, ready for any chat')}</Text><Text size="sm" c="dimmed">{ft('Create a collection, add documents, then build its index. Select it in a chat to make its search and reading tools available.')}</Text></Stack></Card>}
   <SimpleGrid cols={{base:1,sm:2}} spacing="sm">{entries.map(item=><Card key={item.id} withBorder padding="md" radius="md"><Stack gap="sm">
    <Text fw={600} style={{overflowWrap:'anywhere'}}>{collectionLocked(item)?ft('Protected collection'):item.name}</Text>
    <Group gap="xs">{item.directory&&<Badge variant="outline" style={{maxWidth:'100%',height:'auto',whiteSpace:'normal'}}>{ft('Portable folder database')}</Badge>}<Badge variant="light" style={{maxWidth:'100%',height:'auto',whiteSpace:'normal'}}>{item.directory?.encryption==='none'?ft('Unencrypted folder'):item.scope==='public'?ft('Encrypted storage'):ft('Protected content')}</Badge></Group>
    <Button fullWidth variant="default" onClick={()=>select(item.id)} disabled={busy}>{collectionLocked(item)?ft('Unlock'):ft('Open collection')}</Button>
   </Stack></Card>)}</SimpleGrid>
   <Text size="xs" c="dimmed">{ft('App-stored collections are included in encrypted library backups. External folder databases must be backed up by copying the folder while its writer is stopped.')}</Text>
  </Stack></Tabs.Panel>
  <Tabs.Panel value="search" pt="md"><Card withBorder><Stack gap="xs"><Text fw={500}>{ft('Search across collections')}</Text><Text size="xs" c="dimmed">{ft('Search uses all currently unlocked collections with local provider consent. Compatible spaces share one query embedding. No document is re-embedded and no combined database is created.')}</Text><TextInput label={ft('Search all unlocked collections')} value={globalQuery} onChange={event=>setGlobalQuery(event.currentTarget.value)}/><Group><Button disabled={busy||!globalQuery.trim()} onClick={()=>void run(async()=>{const ids:number[]=[];for(const item of await store.list())if(!item.locked&&(await store.data(item.id)).consented)ids.push(item.id);setGlobalResults(await store.searchAcross(ids,globalQuery))})}>{ft('Search collections')}</Button><Button variant="default" disabled={busy} onClick={()=>void run(async()=>{const ids:number[]=[];for(const item of await store.list())if(!item.locked&&(await store.data(item.id)).augmentation?.enabled)ids.push(item.id);if(!ids.length)throw Error('Build the advanced knowledge index first');setGraphIds(ids);setAllGraphs(true);setSelected(ids[0]);await load(ids[0]);setGraph(true)})}>{ft('Explore combined graph')}</Button></Group>{globalResults?.matches.map(hit=><Card withBorder key={hit.id}><Text size="sm" fw={500}>{entries.find(item=>item.id===hit.collectionId)?.name||hit.collectionId} · {hit.path}</Text><Text size="sm">{hit.snippet||hit.modality}</Text></Card>)}</Stack></Card></Tabs.Panel>
 </Tabs>}
 {selected&&detail&&!locked&&<Stack gap="md">
  <Group gap="xs" wrap="nowrap">
   <ActionIcon size={44} variant="default" aria-label={ft('Back to collections')} disabled={busy&&!store.running(selected!)} onClick={closeCollection}><IconArrowLeft size={20}/></ActionIcon>
   <Text fw={600} style={{flex:1,minWidth:0,overflowWrap:'anywhere'}}>{detail.name}</Text>
   <Menu withinPortal={false} position="bottom-end" width={260}>
    <Menu.Target><ActionIcon size={44} variant="subtle" aria-label={ft('Collection actions')} disabled={busy}><IconDots size={20}/></ActionIcon></Menu.Target>
    <Menu.Dropdown>
     <Menu.Item disabled={busy} onClick={()=>setProtection(true)}>{ft('Collection protection')}</Menu.Item>
     {detail.augmentation?.enabled&&<Menu.Item disabled={busy} onClick={()=>{setGraphIds([selected]);setAllGraphs(false);setGraph(true)}}>{ft('Explore knowledge graph')}</Menu.Item>}
     {current?.scope!=='public'&&<Menu.Item disabled={busy} onClick={()=>void run(async()=>{await store.lock(selected);setDetail(undefined)})}>{ft('Lock now')}</Menu.Item>}
     <Menu.Divider/><Menu.Item disabled={busy||readOnly||dirty} onClick={()=>{if(window.confirm(ft('Rebuild all vectors with the saved settings? This sends documents to the selected providers again.')))void run(async()=>{await store.index(selected,setProgress,true);await load(selected,true)})}}>{ft('Reindex collection')}</Menu.Item><Menu.Item color="red" disabled={busy||readOnly} onClick={()=>{if(window.confirm(ft('Delete the local RAG index? Source files are kept.')))void run(async()=>{await store.clearIndex(selected);await load(selected,true)})}}>{ft('Clear index')}</Menu.Item><Menu.Divider/><Menu.Item color="red" disabled={busy} onClick={removeCollection}>{ft(current?.directory?'Unmount collection':'Delete collection')}</Menu.Item>
    </Menu.Dropdown>
   </Menu>
  </Group>
  {detail.consented===false&&<Alert color="yellow"><Stack gap="xs"><Text size="sm">{ft('Save provider consent on this device before using this collection')}</Text><Button variant="subtle" onClick={()=>setWorkspaceTab('settings')}>{ft('Review settings')}</Button></Stack></Alert>}
  <Tabs value={workspaceTab} onChange={setWorkspaceTab} keepMounted={false}>
   <Tabs.List grow><Tabs.Tab value="documents">{ft('Documents')}</Tabs.Tab><Tabs.Tab value="search">{ft('Search')}</Tabs.Tab><Tabs.Tab value="settings">{ft('Settings')}</Tabs.Tab></Tabs.List>
   <Tabs.Panel value="documents" pt="md"><CollectionDocuments key={selected} id={selected} data={detail} index={index} busy={busy||store.running(selected)} readOnly={readOnly} dirty={dirty} store={store} run={run} reload={()=>load(selected,true)} addFiles={addFiles} onReadSource={setSourceFile} onProgress={setProgress} onSettings={()=>setWorkspaceTab('settings')} onPreview={(text,kind)=>{setPreviewKind(kind);setPreview(text||ft('Build the index first'))}}/></Tabs.Panel>
   <Tabs.Panel value="search" pt="md"><Stack gap="sm">
    <TextInput label={ft('Try semantic search')} value={query} onChange={event=>setQuery(event.currentTarget.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!busy&&query.trim())void run(async()=>setResults(await store.search(selected,query)))}}}/>
    <Button disabled={busy||!query.trim()} variant="light" onClick={()=>void run(async()=>setResults(await store.search(selected,query)))}>{ft('Search indexed files')}</Button>
    {results&&'rerankWarning'in results&&<Alert color="yellow">{ft(String(results.rerankWarning))}</Alert>}
    {results?.matches.map(hit=><Card withBorder key={hit.id}><Text size="sm" fw={600} style={{overflowWrap:'anywhere'}}>{detail.files.find(file=>file.path===hit.path)?.name||hit.path} · {hit.page?ft('Page')+' '+hit.page:ft('Lines')+' '+hit.line+'–'+hit.endLine}</Text><Text size="sm">{hit.snippet||hit.modality}</Text></Card>)}
    {results&&!results.matches.length&&<Text c="dimmed" size="sm">{ft('No matching passages. Try another search or update the index.')}</Text>}
   </Stack></Tabs.Panel>
   <Tabs.Panel value="settings" pt="md"><Stack gap="md">
    <TextInput label={ft('Collection name')} value={name} onChange={event=>setName(event.currentTarget.value)}/>
    <CollectionSettings value={settings} onChange={setSettings} ack={ack} onAck={setAck} consent={false}/>
    <Accordion variant="separated" multiple>
     <Accordion.Item value="knowledge"><Accordion.Control>{ft('Search and knowledge options')}</Accordion.Control><Accordion.Panel><CollectionIntelligence value={intelligence} onChange={value=>{setIntelligence(value);setAck(false)}}/></Accordion.Panel></Accordion.Item>
     <Accordion.Item value="reranking"><Accordion.Control>{ft('Reranking (optional)')}</Accordion.Control><Accordion.Panel><Stack gap="sm"><Switch label={ft('Virtual reranking with LLM')} checked={rerankMode==='llm'} onChange={event=>{const mode=event.currentTarget.checked?'llm':'api',ref=mode==='llm'?settingsStore.getState().getSettings().defaultVirtualRerankModel:undefined;setRerankMode(mode);setRerankProvider(ref?.provider||'');setRerankModel(ref?.model||'');setAck(false)}}/><Text size="xs" c="dimmed">{rerankMode==='llm'?ft('Ranks at most 20 matching passages using a text model. No tools or web search. Malformed results fail without silently switching providers.'):null}</Text><Text size="xs" c="dimmed">{ft('The reranker receives your query and matching passages. Changing it requires saving provider consent.')}</Text><Group><ModelSelectorV2 withinPortal={false} selectedProviderId={rerankProvider} selectedModelId={rerankModel} modelFilter={model=>rerankMode==='llm'?(!model.type||model.type==='chat'):model.type==='rerank'} onSelect={(provider,model)=>{setRerankProvider(provider);setRerankModel(model);setAck(false)}}><Button variant="default">{rerankModel||ft(rerankMode==='llm'?'Choose a reranking LLM':'No reranking')}</Button></ModelSelectorV2>{rerankModel&&<Button variant="subtle" onClick={()=>{setRerankProvider('');setRerankModel('');setAck(false)}}>{ft('Clear')}</Button>}</Group></Stack></Accordion.Panel></Accordion.Item>
     <Accordion.Item value="storage"><Accordion.Control>{ft('Storage and linked folders')}</Accordion.Control><Accordion.Panel><CollectionFolder directory={current?.directory} id={selected} data={detail} busy={busy} run={work=>run(async()=>{await work();await load(selected)})}/><Text size="xs" c="dimmed">{ft('App-stored collections are included in encrypted library backups. External folder databases must be backed up by copying the folder while its writer is stopped.')}</Text></Accordion.Panel></Accordion.Item>
    </Accordion>
    <Checkbox label={ft(collectionConsentLabel)} checked={ack} onChange={event=>setAck(event.currentTarget.checked)}/>
    <div className="feature-save-bar"><Stack gap="xs">{dirty&&<Text size="xs" c="dimmed">{ft('You have unsaved changes.')}</Text>}<Button fullWidth disabled={busy||!ack} onClick={()=>void run(async()=>{await store.configure(selected,name,settings,rerankProvider||undefined,rerankModel||undefined,rerankMode,intelligence);await load(selected)})}>{ft('Save settings')}</Button></Stack></div>
   </Stack></Tabs.Panel>
  </Tabs>
 </Stack>}
 {selected&&locked&&<Card withBorder><Stack><Text>{ft('Protected collection')}</Text><Button disabled={busy} onClick={()=>select(selected)}>{ft('Unlock')}</Button><Button variant="subtle" onClick={()=>{setSelected(undefined);setDetail(undefined)}}>{ft('Back to collections')}</Button></Stack></Card>}
 {!selected&&platform.type==='desktop'&&<><Alert color="yellow">{ft('Legacy desktop collections use the original unencrypted database. They remain available to existing chats. You can copy their indexed text into encrypted collections; originals are preserved until explicitly deleted. Copies need a new index and may contain overlap between old passages.')}</Alert><Button variant="subtle" disabled={busy} onClick={()=>void run(async()=>setLegacy((await platform.getKnowledgeBaseController().list()).filter(item=>item.id>0)))}>{ft('Show legacy desktop collections')}</Button>{legacy.map(item=><Group key={item.id}><Text>{item.name}</Text><Button variant="default" disabled={busy} onClick={()=>{if(window.confirm(ft('Copy indexed text locally? No provider calls are made until you build the new index.')))migrate(item)}}>{ft('Copy to encrypted collection')}</Button><Button variant="subtle" color="red" disabled={busy} onClick={()=>{if(window.confirm(ft('Delete the original legacy collection and its unencrypted index? This cannot be undone.')))void run(async()=>{await platform.getKnowledgeBaseController().delete(item.id);setLegacy(list=>list.filter(kb=>kb.id!==item.id))})}}>{ft('Delete legacy copy')}</Button></Group>)}</>}
 </Stack>
 {!selected&&platform.type==='desktop'&&legacyKnowledgeController()&&<Button variant="subtle" onClick={()=>setLegacyManager(true)}>{ft('Open legacy desktop manager')}</Button>}
 <AdaptiveModal opened={mountDialog} onClose={()=>setMountDialog(false)} title={ft('Open folder collection')}><Stack><Alert color="blue">{ft('Choose the root folder containing .rag-collection. Existing vectors and derived data are reused. Provider credentials and consent remain local to this device.')}</Alert><Switch label={ft('Enable writing on this device')} description={ft('Use only one writer for a folder. Close other apps or devices before updating this collection.')} checked={writeMount} onChange={event=>setWriteMount(event.currentTarget.checked)}/><Button disabled={busy} onClick={()=>void run(async()=>{const id=await collectionDirectories.mount(writeMount);setMountDialog(false);if(id){setSelected(id);await load(id)}})}>{ft('Choose folder')}</Button></Stack></AdaptiveModal>
 <AdaptiveModal opened={graph&&!locked&&!!detail} onClose={()=>setGraph(false)} title={ft('Knowledge graph')} size="xl">{selected&&graph&&!locked&&detail&&<KnowledgeGraph store={store} id={selected} ids={graphIds}/>}</AdaptiveModal>
 <AdaptiveModal opened={legacyManager} onClose={()=>setLegacyManager(false)} title={ft('Open legacy desktop manager')} size="xl"><Suspense fallback={<Loader/>}>{legacyManager&&<LegacyManager controller={legacyKnowledgeController()}/>}</Suspense></AdaptiveModal>
 <AdaptiveModal opened={creating} onClose={()=>setCreating(false)} title={ft('New collection')} size="lg"><Stack>
 <SegmentedControl aria-label={ft('Collection setup')} value={createMode} onChange={setCreateMode} data={[{value:'new',label:ft('Create new')},...(knowledgeFolderAvailable()?[{value:'existing',label:ft('Connect existing')}]:[])]}/>
 {createMode==='existing'?<><Alert color="blue">{ft('Choose the root folder containing .rag-collection. Encrypted collections ask for a passphrase; unencrypted collections open without one. Provider consent stays local.')}</Alert><Switch label={ft('Enable writing on this device')} description={ft('Use only one writer for a folder. Close other apps or devices before updating this collection.')} checked={writeMount} onChange={event=>setWriteMount(event.currentTarget.checked)}/><Button disabled={busy} onClick={()=>void run(async()=>{const id=await collectionDirectories.mount(writeMount);if(id){setCreating(false);setSelected(id);await load(id)}})}>{ft('Choose folder')}</Button></>:<>
 <TextInput label={ft('Collection name')} value={name} onChange={e=>setName(e.currentTarget.value)}/><CollectionSettings value={settings} onChange={setSettings} ack={ack} onAck={setAck}/>
 {knowledgeFolderAvailable()&&<Switch label={ft('Store this collection in a linked folder')} checked={createFolder} onChange={event=>setCreateFolder(event.currentTarget.checked)}/>} {createFolder&&<Switch label={ft('Encrypt the folder database')} checked={createEncrypted} onChange={event=>setCreateEncrypted(event.currentTarget.checked)}/>}
 {createFolder&&!createEncrypted&&<Alert color="orange">{ft('This folder collection is not encrypted. Anyone with the folder can read its documents and index without a passphrase. App PIN and biometrics only restrict access inside this app.')}</Alert>}
 <Button disabled={busy||!ack||!name.trim()} onClick={()=>void run(async()=>{const id=await store.create(name,settings);if(createFolder){try{await collectionDirectories.migrate(id,{encrypted:createEncrypted});if(!(await store.directoryEntry(id)).directory){await store.remove(id);return}}catch(error){if(!(await store.directoryEntry(id)).directory)await store.remove(id);throw error}}setCreating(false);setSelected(id);await load(id)})}>{ft('Create collection')}</Button></>}
 </Stack></AdaptiveModal>
 <AdaptiveModal opened={protection&&!locked&&!!detail} onClose={()=>setProtection(false)} title={ft('Collection protection')}>{selected&&<CollectionProtection service={store} id={selected} onChanged={()=>{setProtection(false);void run(async()=>{await load(selected)})}}/>}</AdaptiveModal>
<AdaptiveModal opened={sourceFile!==undefined&&!locked&&!!detail} onClose={()=>setSourceFile(undefined)} title={ft('Read document')} size="xl">{selected&&sourceFile!==undefined&&!locked&&detail&&<KnowledgeDocumentViewer store={store} id={selected} fileId={sourceFile} onText={text=>{setSourceFile(undefined);setPreviewKind('parsed');setPreview(text)}}/>}</AdaptiveModal>
 <AdaptiveModal opened={!!preview&&!locked&&!!detail} onClose={()=>setPreview('')} title={ft(previewKind==='parsed'?'Open parsed document':'Preview passages')} size="lg">{previewKind==='parsed'&&<Text size="xs" c="dimmed" mb="sm">{ft('Extracted text used for search.')}</Text>}<Text style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview}</Text></AdaptiveModal>
 </div></SettingsPage>
}
