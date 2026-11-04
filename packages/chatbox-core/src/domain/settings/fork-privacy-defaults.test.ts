import { describe, expect, it } from 'vitest'
import { createDefaultSettings, getDefaultDocumentParser } from './settings-defaults'

describe('fork privacy defaults', () => {
  it('starts with reporting disabled and local desktop document parsing', () => {
    expect(createDefaultSettings().allowReportingAndTracking).toBe(false)
    expect(getDefaultDocumentParser({ isDesktopLike: true })).toEqual({ type: 'local' })
  })
  it('does not select a cloud parser on mobile or web without a user choice', () => {
    expect(getDefaultDocumentParser({ isDesktopLike: false })).toEqual({ type: 'none' })
  })
})
