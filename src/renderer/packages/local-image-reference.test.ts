import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),assert:vi.fn(),find:vi.fn()}))
vi.mock('@/adapters/CurrentBlobStorage',()=>({currentBlobStorage:{get:mocks.get}}))
vi.mock('@/platform',()=>({default:{}}))
vi.mock('./vault/runtime',()=>({installedVaultFor:()=>({find:mocks.find,projects:{assertLibraryKey:mocks.assert}})}))
import { reusableLocalImageKey } from './local-image-reference'
import { markLocalFile, inheritLocalFile } from './local-file-origin'
import { mediaContentHash } from './media-content-hash'
const data='data:image/png;base64,aW1hZ2U='
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue(data);mocks.find.mockResolvedValue({alias:'original'});mocks.assert.mockResolvedValue(undefined)})
it('compares SHA-256 of bytes independent of filenames, MIME spelling and line breaks',()=>{
 expect(mediaContentHash(data)).toBe(mediaContentHash('data:image/jpeg;base64,aW1h\nZ2U='))
 expect(mediaContentHash(data)).not.toBe(mediaContentHash('data:image/png;base64,Y3JvcA=='))
})
it.each(['public','app','project:private'])('reuses the original %s asset instead of copying bytes',async scope=>{
 const file=markLocalFile(new File(['image'],'different-name.png'),{scope,key:'original',contentHash:mediaContentHash(data)})
 expect(await reusableLocalImageKey(file,data)).toBe('original')
 expect(mocks.assert).toHaveBeenCalledTimes(2)
})
it('keeps cropped bytes separate from their source even though protection provenance is inherited',async()=>{
 const original=markLocalFile(new File(['image'],'image.png'),{scope:'app',key:'original',contentHash:mediaContentHash(data)})
 const crop=inheritLocalFile(original,new File(['crop'],'crop.png'))
 expect(await reusableLocalImageKey(crop,'data:image/png;base64,Y3JvcA==')).toBeUndefined()
 expect(mocks.get).not.toHaveBeenCalled()
})
it('does not reuse stale content or bypass deletion, app/project locks',async()=>{
 const file=markLocalFile(new File(['image'],'image.png'),{scope:'public',key:'original'})
 mocks.get.mockResolvedValueOnce('data:image/png;base64,Y3JvcA==')
 expect(await reusableLocalImageKey(file,data)).toBeUndefined()
 mocks.get.mockResolvedValueOnce(null)
 await expect(reusableLocalImageKey(file,data)).rejects.toThrow('no longer available')
 mocks.assert.mockRejectedValueOnce(Error('Unlock protected project'))
 await expect(reusableLocalImageKey(file,data)).rejects.toThrow('Unlock')
})
