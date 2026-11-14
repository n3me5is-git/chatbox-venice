import {expect,it} from 'vitest'
import {CollectionManifestSchema} from './manifest'
const file={id:1,path:'documents/1/source.md',name:'source.md',mime:'text/markdown',bytes:10,alias:'knowledge-collection:-123:source:1',createdAt:1},base={version:1,name:'Project',settings:{provider:'venice',model:'embedding'},files:[file]}
it('accepts originating aliases and canonical collection UUID aliases without native grants',()=>{expect(CollectionManifestSchema.safeParse(base).success).toBe(true);expect(CollectionManifestSchema.safeParse({...base,files:[{...file,alias:'knowledge-collection:12345678-1234-4123-8123-123456789012:source:1'}]}).success).toBe(true)})
it('rejects duplicate file identities, traversal, reserved database paths and source alias mismatches',()=>{for(const source of [{...base,files:[file,file]},{...base,files:[{...file,path:'../outside'}]},{...base,files:[{...file,path:'.rag-collection/collection.json'}]},{...base,files:[{...file,alias:'knowledge-collection:-123:source:2'}]},{...base,files:[{...file,bytes:11*1024*1024}]}])expect(CollectionManifestSchema.safeParse(source).success).toBe(false)})

it('preserves legitimate uploaded document names containing percent characters in the encrypted virtual namespace',()=>{expect(CollectionManifestSchema.safeParse({...base,files:[{...file,path:'documents/1/Progress 100%.md',name:'Progress 100%.md'}]}).success).toBe(true)})
