import { Button, Group, Stack } from '@mantine/core'
import { useState } from 'react'
import type { VeniceChatSecurity } from '../../src/shared/types/settings'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { VeniceChatPrivacySettings } from '../../src/renderer/components/venice/VeniceChatPrivacySettings'

export function PrivacyReviewSimulation() {
  const [opened, setOpened] = useState(false)
  const [active, setActive] = useState<'a' | 'b'>('a')
  const [chats, setChats] = useState<Partial<Record<'a' | 'b', VeniceChatSecurity>>>({})
  const provider = { textPrivacy: 'e2ee' as const }
  Object.assign(window, { __simulationChatPrivacy: { active, chats, provider } })
  return <><Button m="sm" onClick={() => setOpened(true)}>Test chat privacy controls</Button>
    <AdaptiveModal opened={opened} onClose={() => setOpened(false)} title="Conversation privacy review">
      <Stack><Group><Button onClick={() => setActive('a')}>Chat A</Button><Button onClick={() => setActive('b')}>Chat B</Button></Group>
        <VeniceChatPrivacySettings key={active} provider={provider} value={chats[active]}
          model={{ modelId: 'ordinary', vendorMetadata: { privacy: 'private' } }}
          onChange={value => setChats(current => ({ ...current, [active]: value }))} />
        <Button onClick={() => setOpened(false)}>Close privacy review</Button>
      </Stack>
    </AdaptiveModal>
  </>
}
