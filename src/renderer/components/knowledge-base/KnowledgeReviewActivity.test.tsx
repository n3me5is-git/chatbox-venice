// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { reviewActivity } from '@/packages/knowledge-collections/review-activity'
import { KnowledgeReviewActivity } from './KnowledgeReviewActivity'
vi.mock('react-i18next', () => ({ useTranslation: () => ({t: (key:string) => key}) }))
vi.mock('@/i18n/fork', () => ({forkT:(key:string)=>key}))
afterEach(() => {cleanup(); reviewActivity.clear('chat'); reviewActivity.clear('other'); vi.useRealTimers()})
it('shows only this chat’s provider trace and clears it after review', () => {
  Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})})
  vi.useFakeTimers()
  reviewActivity.set('other','checking','Another chat’s private trace')
  const view = render(<MantineProvider><KnowledgeReviewActivity sessionId="chat" /></MantineProvider>)
  fireEvent.click(screen.getByText('Checker reasoning'))
  expect(screen.getByText('No reasoning trace has been returned by this provider yet.')).toBeTruthy()
  expect(screen.queryByText('Another chat’s private trace')).toBeNull()
  act(() => {reviewActivity.set('chat','checking','Compare the claim with the supplied excerpt'); vi.advanceTimersByTime(130)})
  expect(screen.getByText('Compare the claim with the supplied excerpt')).toBeTruthy()
  act(() => {reviewActivity.set('chat','correcting','The dates conflict'); vi.advanceTimersByTime(130)})
  expect(screen.getByText('Correcting source conflicts')).toBeTruthy()
  expect(screen.queryByText('Compare the claim with the supplied excerpt')).toBeNull()
  act(() => {reviewActivity.clear('chat'); vi.advanceTimersByTime(130)})
  expect(screen.queryByText('The dates conflict')).toBeNull()
  view.unmount()
})
