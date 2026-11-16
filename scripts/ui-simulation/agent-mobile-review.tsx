import { Button } from '@mantine/core'
import { openAgentLibrary } from '../../src/renderer/components/multi-agent/AgentLibrary'
export function AgentMobileReviewSimulation() {
  return <Button m="sm" onClick={() => void openAgentLibrary()}>Test mobile agent editor</Button>
}
