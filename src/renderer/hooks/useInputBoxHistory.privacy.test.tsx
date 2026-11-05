// @vitest-environment jsdom
import { act,renderHook } from '@testing-library/react'
import { createStore,Provider } from 'jotai'
import type { ReactNode } from 'react'
import { describe,expect,it } from 'vitest'
import useInputBoxHistory,{ inputBoxHistoryAtom } from './useInputBoxHistory'
describe('private composer history',()=>{
 it('keeps private prompts in memory outside public persistent history and isolates PIN scopes',()=>{const store=createStore();const wrapper=({children}:{children:ReactNode})=><Provider store={store}>{children}</Provider>;const view=renderHook(({scope}:{scope:string|null})=>useInputBoxHistory(scope),{wrapper,initialProps:{scope:null as string|null}});act(()=>view.result.current.addInputBoxHistory('Public prompt'));view.rerender({scope:'project:a'});expect(view.result.current.inputBoxHistory).toEqual([]);act(()=>view.result.current.addInputBoxHistory('Sensitive prompt'));expect(store.get(inputBoxHistoryAtom)).toEqual(['Public prompt']);view.rerender({scope:'project:b'});expect(view.result.current.inputBoxHistory).toEqual([]);view.rerender({scope:'project:a'});expect(view.result.current.inputBoxHistory).toEqual(['Sensitive prompt']);view.rerender({scope:null});expect(view.result.current.inputBoxHistory).toEqual(['Public prompt'])})
})
