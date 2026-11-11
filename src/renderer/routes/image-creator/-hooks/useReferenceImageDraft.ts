import { useCallback, useEffect, useRef, useState } from 'react'
import { currentBlobStorage } from '@/adapters/CurrentBlobStorage'
import { getLogger } from '@/lib/utils'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { getImageGenerationService } from '@/stores/imageGenerationActions'
import { queryClient } from '@/stores/queryClient'
import { MAX_REFERENCE_IMAGES } from '../-components/constants'
import { localFileOrigin } from '@/packages/local-file-origin'
import { reusableLocalImageKey } from '@/packages/local-image-reference'
import { mediaContentHash } from '@/packages/media-content-hash'

const log = getLogger('reference-image-draft')

async function persistDraftReference(file:File,key:string,data:string){
 const origin=localFileOrigin(file)
 if(origin?.scope&&origin.scope!=='public'){
  const [{vaultRuntimeFor},{default:platform},{dataUrlBytes}]=await Promise.all([import('@/packages/vault/runtime'),import('@/platform'),import('@/packages/vault/chunk-store')])
  await vaultRuntimeFor(platform).assets.put(dataUrlBytes(data),{name:file.name,kind:'image',mime:file.type,hidden:true},origin.scope,key)
 }else await currentBlobStorage.set(key,data)
}

interface ReferenceImage {
  storageKey: string
  sourceRecordId?: string
}

interface SubmissionOwner {
  state: 'submitting'
}

export function useReferenceImageDraft() {
  const [images, setImages] = useState<ReferenceImage[]>([])
  const draft = useRef({
    images: [] as ReferenceImage[],
    uploads: new Map<string, 'draft' | SubmissionOwner>(),
    revision: 0,
    uploadEpoch: 0,
    mounted: true,
    imports: Promise.resolve(),
    hashes: new Map<string, string>(),
    releaseReferences: () => {},
  })

  const updateImages = useCallback((next: ReferenceImage[]) => {
    draft.current.releaseReferences()
    draft.current.releaseReferences = getImageGenerationService().protectReferences(
      next.map((image) => image.storageKey)
    )
    draft.current.images = next
    draft.current.revision += 1
    if (draft.current.mounted) setImages(next)
  }, [])

  const removeBlobs = useCallback(async (keys: string[]) => {
    await Promise.all(
      keys.map(async (key) => {
        try {
          await currentBlobStorage.remove(key)
        } catch (error) {
          log.error('Failed to clean up a reference image:', error)
        }
      })
    )
  }, [])

  const replace = useCallback(
    (next: ReferenceImage[]) => {
      const retained = new Set(next.map((image) => image.storageKey))
      const keys: string[] = []
      for (const [key, owner] of draft.current.uploads) {
        if (owner === 'draft' && !retained.has(key)) {
          draft.current.uploads.delete(key)
          keys.push(key)
        }
      }
      draft.current.uploadEpoch += 1
      updateImages(next)
      return removeBlobs(keys)
    },
    [removeBlobs, updateImages]
  )

  const clear = useCallback(() => replace([]), [replace])

  useEffect(() => {
    draft.current.mounted = true
    return () => {
      draft.current.mounted = false
      void clear()
    }
  }, [clear])

  const addReference = useCallback(
    (storageKey: string, sourceRecordId?: string) => {
      const current = draft.current.images
      if (current.length >= MAX_REFERENCE_IMAGES || current.some((image) => image.storageKey === storageKey)) return
      updateImages([...current, { storageKey, sourceRecordId }])
    },
    [updateImages]
  )

  const removeReference = useCallback(
    (storageKey: string) => {
      updateImages(draft.current.images.filter((image) => image.storageKey !== storageKey))
      if (draft.current.uploads.get(storageKey) === 'draft') {
        draft.current.uploads.delete(storageKey)
        void removeBlobs([storageKey])
      }
    },
    [removeBlobs, updateImages]
  )

  const upload = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const epoch = draft.current.uploadEpoch
      const available = MAX_REFERENCE_IMAGES - draft.current.images.length
      for (const file of Array.from(files)
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, available)) {
        const reader = new FileReader()
        reader.onload = async () => {
          if (typeof reader.result !== 'string') return
          const data = reader.result
          // Serialize imports so identical bytes selected together cannot race
          // into separate blobs. Borrowed library assets remain library-owned.
          draft.current.imports = draft.current.imports.then(async () => {
          if (!draft.current.mounted || draft.current.uploadEpoch !== epoch) return
          const hash = mediaContentHash(data)
          const existing = draft.current.hashes.get(hash)
          if (existing && draft.current.images.some(image => image.storageKey === existing)) return
          const borrowed = await reusableLocalImageKey(file, data)
          const storageKey = borrowed || StorageKeyGenerator.picture('image-creator-ref')
          if (!borrowed) await persistDraftReference(file, storageKey, data)
          if (
            !draft.current.mounted ||
            draft.current.uploadEpoch !== epoch ||
            draft.current.images.length >= MAX_REFERENCE_IMAGES
          ) {
            if (!borrowed) await removeBlobs([storageKey])
            return
          }
          if (!borrowed) {
            queryClient.setQueryData(['blob', storageKey], data)
            draft.current.uploads.set(storageKey, 'draft')
          }
          draft.current.hashes.set(hash, storageKey)
          addReference(storageKey)
          }).catch(error => log.error('Failed to store a reference image:', error))
        }
        reader.onerror = () => log.error('Failed to read a reference image:', file.name)
        reader.readAsDataURL(file)
      }
    },
    [addReference, removeBlobs]
  )

  const beginSubmission = useCallback(() => {
    const submitted = draft.current.images
    const revision = draft.current.revision
    const owner: SubmissionOwner = { state: 'submitting' }
    const releaseSubmission = getImageGenerationService().protectReferences(submitted.map((image) => image.storageKey))
    const keys = submitted.map((image) => image.storageKey).filter((key) => draft.current.uploads.get(key) === 'draft')
    for (const key of keys) draft.current.uploads.set(key, owner)
    let committed = false

    return {
      referenceImages: submitted.map((image) => image.storageKey),
      parentIds: [...new Set(submitted.map((image) => image.sourceRecordId).filter((id): id is string => !!id))],
      commit() {
        committed = true
        releaseSubmission()
        for (const key of keys) {
          if (draft.current.uploads.get(key) === owner) draft.current.uploads.delete(key)
        }
      },
      async rollback() {
        if (committed) return
        releaseSubmission()
        const selected = new Set(draft.current.images.map((image) => image.storageKey))
        const unowned: string[] = []
        for (const key of keys) {
          if (draft.current.uploads.get(key) !== owner) continue
          if (draft.current.mounted && selected.has(key)) {
            draft.current.uploads.set(key, 'draft')
          } else {
            draft.current.uploads.delete(key)
            unowned.push(key)
          }
        }
        await removeBlobs(unowned)
      },
      complete() {
        if (!committed || !draft.current.mounted || draft.current.revision !== revision) return false
        void clear()
        return true
      },
    }
  }, [clear, removeBlobs])

  const cropReference=useCallback(async(storageKey:string)=>{
    const state=draft.current,epoch=state.uploadEpoch,revision=state.revision
    const [{localLibraryFile},{cropReferenceFile}]=await Promise.all([import('@/packages/local-library'),import('@/components/venice/ImageReferenceCropper')])
    const original=await localLibraryFile({id:storageKey,name:'Image reference',key:storageKey,kind:'image'})
    const file=await cropReferenceFile(original)
    if(!file||!state.mounted||state.uploadEpoch!==epoch||state.revision!==revision)return
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Unable to read the reference'));reader.readAsDataURL(file)})
    const key=StorageKeyGenerator.picture('image-creator-ref')
    await persistDraftReference(file,key,data)
    if(!state.mounted||state.uploadEpoch!==epoch||state.revision!==revision){await removeBlobs([key]);return}
    state.uploads.set(key,'draft');queryClient.setQueryData(['blob',key],data)
    state.hashes.set(mediaContentHash(data),key)
    updateImages(state.images.map(image=>image.storageKey===storageKey?{...image,storageKey:key}:image))
    if(state.uploads.get(storageKey)==='draft'){state.uploads.delete(storageKey);await removeBlobs([storageKey])}
  },[removeBlobs,updateImages])

  return { images, upload, addReference, removeReference, replace, clear, beginSubmission, cropReference }
}
