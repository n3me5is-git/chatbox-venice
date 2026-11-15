import type { ModelInterface } from '@shared/models/types'
import type { Message } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getImageMock } = vi.hoisted(() => ({
  getImageMock: vi.fn(),
}))

vi.mock('@/adapters', () => ({
  createModelDependencies: vi.fn(async () => ({ storage: { getImage: getImageMock } })),
}))

import { ocrImagesInMessages } from './ocr-helper'

describe('ocrImagesInMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getImageMock.mockResolvedValue('data:image/png;base64,aW1hZ2U=')
  })

  it('passes the owning session id to each OCR request', async () => {
    const chatMock = vi.fn().mockResolvedValue({ contentParts: [{ type: 'text', text: 'OCR result' }] })
    const model = { chat: chatMock } as unknown as ModelInterface
    const messages: Message[] = [
      { id: 'user-1', role: 'user', contentParts: [{ type: 'image', storageKey: 'image-1' }] },
    ]

    await ocrImagesInMessages(messages, model, 'session-1')

    expect(chatMock).toHaveBeenCalledWith(expect.any(Array), { sessionId: 'session-1', maxSteps:1, tools:{} })
    expect(messages[0].contentParts[0]).toMatchObject({ type: 'image', ocrResult: 'OCR result' })
  })
  it('forwards cancellation and does not publish text after an aborted OCR request',async()=>{
    const controller=new AbortController(),chat=vi.fn(async()=>{controller.abort();return {contentParts:[{type:'text',text:'late'}]}}),model={chat} as unknown as ModelInterface,messages:Message[]=[{id:'user',role:'user',contentParts:[{type:'image',storageKey:'image-1'}]}]
    await expect(ocrImagesInMessages(messages,model,'session',controller.signal)).rejects.toMatchObject({name:'AbortError'})
    expect(chat).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({signal:controller.signal,tools:{}}));expect(messages[0].contentParts[0]).not.toHaveProperty('ocrResult')
  })
})
