// @vitest-environment jsdom
import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useReferenceModelSelection } from './useReferenceModelSelection'

const models=(privacy='private')=>[
 {modelId:'image',vendorMetadata:{veniceType:'image',privacy:'private'},capabilities:{aspectRatio:null,inputReferences:null}},
 {modelId:'image-edit',vendorMetadata:{veniceType:'inpaint',privacy},capabilities:{aspectRatio:null,inputReferences:{min:1,max:3}}},
]
function harness(rows= models()){
 return renderHook(()=>{
   const [id,setId]=useState('image'),[automatic,setAutomatic]=useState(true),[count,setCount]=useState(0)
   const selection=useReferenceModelSelection({models:rows,selectedId:id,count,automatic,onSelect:setId})
   return {id,automatic,selection,setCount,setAutomatic,manual:(next:string)=>{setAutomatic(false);setId(next)}}
 })
}
it('automatically selects a compatible exact variant only with the same declared privacy',()=>{
 const {result}=harness();act(()=>result.current.setCount(1));expect(result.current.id).toBe('image-edit');expect(result.current.selection.compatible).toBe(true)
})
it('retains a manual selection even when the automatic counterpart exists',()=>{
 const {result}=harness();act(()=>result.current.setCount(1));expect(result.current.id).toBe('image-edit')
 act(()=>result.current.manual('image'));expect(result.current.id).toBe('image');expect(result.current.automatic).toBe(false);expect(result.current.selection.compatible).toBe(false)
 act(()=>result.current.setCount(2));expect(result.current.id).toBe('image')
 act(()=>result.current.setAutomatic(true));expect(result.current.id).toBe('image-edit')
})
it('blocks privacy changes in both directions and allows the explicit compatible choice',()=>{
 const {result}=harness(models('anonymized'));act(()=>result.current.setCount(1))
 expect(result.current.id).toBe('image');expect(result.current.selection.privacyChange).toBe(true)
 act(()=>result.current.setAutomatic(false));act(()=>result.current.setAutomatic(true));expect(result.current.id).toBe('image')
 act(()=>result.current.manual('image-edit'));expect(result.current.id).toBe('image-edit');expect(result.current.selection.compatible).toBe(true)
})
it('does not automatically switch when privacy is missing from either model',()=>{
 const {result}=harness(models(''));act(()=>result.current.setCount(1));expect(result.current.id).toBe('image');expect(result.current.selection.privacyChange).toBe(true)
})
