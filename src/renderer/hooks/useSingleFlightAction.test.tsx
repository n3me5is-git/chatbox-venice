import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSingleFlightAction } from './useSingleFlightAction'

describe('retry action feedback and duplicate taps', () => {
  it('claims before the first render and keeps feedback until the request settles', async () => {
    const { result } = renderHook(() => useSingleFlightAction())
    let finish = () => {}
    const action = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    let first!: Promise<void>
    act(() => { first = result.current.run(action); void result.current.run(action); void result.current.run(action) })
    expect(action).toHaveBeenCalledOnce()
    expect(result.current.pending).toBe(true)
    await act(async () => { finish(); await first })
    expect(result.current.pending).toBe(false)
    await act(async () => { await result.current.run(async () => {}) })
  })
  it('propagates errors and permits an explicit new attempt after failure', async () => {
    const { result } = renderHook(() => useSingleFlightAction())
    await act(async () => { await expect(result.current.run(async () => { throw new Error('offline') })).rejects.toThrow('offline') })
    expect(result.current.pending).toBe(false)
    const next = vi.fn(async () => {})
    await act(async () => { await result.current.run(next) })
    expect(next).toHaveBeenCalledOnce()
  })
})
