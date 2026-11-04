import { buildVeniceMediaTools } from '@shared/providers/definitions/models/venice/tools'
import { veniceConfiguration, veniceMediaService } from './service'
export function veniceChatTools(sessionId: string) {
  return buildVeniceMediaTools(sessionId, veniceMediaService, () => veniceConfiguration().options, async message => {
    const [{ default: NiceModal }, { default: ConfirmModal }] = await Promise.all([import('@ebay/nice-modal-react'), import('@/modals/ConfirmModal')])
    return await NiceModal.show(ConfirmModal, { title: 'Tool Venice', message }) === true
  })
}
