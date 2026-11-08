import {forkT as ft} from '@/i18n/fork'
import { VeniceModelBadges } from './venice/VeniceModelBadges'
import { VeniceModelCost } from './venice/VeniceModelCost'
import { privacyLabels } from '@shared/providers/definitions/models/venice/media-capabilities'
import { Badge, Button, Flex, Select, Group, Stack, Text, TextInput } from '@mantine/core'
import { AutomationAdjacentAttr, TestId } from '@shared/automation/testids'
import type { ProviderModelInfo } from '@shared/types'
import { formatNumber } from '@shared/utils'
import {
  IconBulb,
  IconCircleMinus,
  IconCirclePlus,
  IconDatabase,
  IconEye,
  IconLogout,
  IconSearch,
  IconSettings,
  IconTool,
} from '@tabler/icons-react'
import { capitalize } from 'lodash'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import { ScalableIcon } from './common/ScalableIcon'

interface ModelListProps {
  models: ProviderModelInfo[]
  showActions?: boolean
  onEditModel?: (model: ProviderModelInfo) => void
  onDeleteModel?: (modelId: string) => void
  onAddModel?: (model: ProviderModelInfo) => void
  onRemoveModel?: (modelId: string) => void
  displayedModelIds?: string[]
  showSearch?: boolean
  className?: string
}

export function ModelList({
  models,
  showActions = true,
  onEditModel,
  onDeleteModel,
  onAddModel,
  onRemoveModel,
  displayedModelIds,
  showSearch = true,
  className,
}: ModelListProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [category,setCategory]=useState('all'),[privacy,setPrivacy]=useState('all')
  const hasVenice=models.some(model=>!!model.vendorMetadata?.veniceType)
  const filteredCatalog=models.filter(model=>(category==='all'||(model.type||'chat')===category)&&(privacy==='all'||privacyLabels(model.vendorMetadata).some(item=>privacy==='e2ee'?item.label==='E2EE capable':privacy==='tee'?item.label==='TEE available':privacy==='uncensored'?item.label==='Uncensored':privacy==='private'?item.label==='Private':item.label==='Anonymized')))

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return filteredCatalog

    const query = searchQuery.toLowerCase()
    return filteredCatalog.filter((model) => {
      const displayName = (model.nickname || model.modelId).toLowerCase()
      return displayName.includes(query)
    })
  }, [models, searchQuery, category, privacy])

  const formatTokenCount = (count?: number) => {
    if (!count) return null
    return formatNumber(count)
  }

  return (
    <Stack gap="sm" className={className}>
      {hasVenice&&<Group grow><Select comboboxProps={{withinPortal:false}} label={ft('Model type')} value={category} onChange={value=>setCategory(value||'all')} data={[{value:'all',label:ft('All types')},...Array.from(new Set(models.map(model=>model.type||'chat'))).map(value=>({value,label:ft(value==='chat'?'Chat':value==='image'?'Images':'Embeddings')}))]}/><Select comboboxProps={{withinPortal:false}} label={ft('Privacy and filters')} value={privacy} onChange={value=>setPrivacy(value||'all')} data={[{value:'all',label:ft('All privacy levels')},{value:'private',label:ft('Private')},{value:'anonymous',label:ft('Anonymized')},{value:'tee',label:ft('TEE available')},{value:'e2ee',label:ft('E2EE capable')},{value:'uncensored',label:ft('Uncensored')}]}/></Group>}
      {showSearch && models.length > 0 && (
        <TextInput
          placeholder={t('Search models...') as string}
          leftSection={<ScalableIcon icon={IconSearch} size={16} />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          className="px-xxs pt-xxs"
        />
      )}

      <Stack
        data-testid={TestId.settings.providerModelList}
        gap={0}
        px="xxs"
        className={`border-solid border rounded-lg min-h-[60px] overflow-y-auto border-chatbox-border-primary`}
      >
        {filteredModels.length > 0 ? (
          filteredModels.map((model) => (
            <Flex
              key={model.modelId}
              data-testid={TestId.settings.providerModelItem}
              {...{ [AutomationAdjacentAttr.modelId]: model.modelId }}
              gap="xs"
              align="center"
              py="sm"
              px="xs"
              className="border-solid border-0 border-b last:border-b-0 border-chatbox-border-primary"
            >
              <Stack gap={4} flex="1 1 0" miw={0}>
                <Flex gap="xs" align="center" miw={0}>
                  <Text
                    component="span"
                    size="sm"
                    flex="1 1 auto"
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={model.nickname || model.modelId}
                    c={model.labels?.includes('recommended') ? 'chatbox-brand' : undefined}
                  >
                    {model.nickname || model.modelId}
                  </Text>
                  {model.labels?.includes('pro') && (
                    <Badge color="chatbox-brand" size="xs" variant="light">
                      Pro
                    </Badge>
                  )}
                  {model.labels?.includes('new') && (
                    <Badge color="teal" size="xs" variant="light">
                      New
                    </Badge>
                  )}
                </Flex>

                <VeniceModelBadges metadata={model.vendorMetadata}/>
                {model.vendorMetadata?.veniceType&&<VeniceModelCost metadata={model.vendorMetadata} type={String(model.vendorMetadata.veniceType)}/>}
                {(model.type !== 'chat' || model.capabilities?.length || model.contextWindow || model.maxOutput) && (
                  <Flex gap="xs" align="center" wrap="wrap">
                    {model.type && model.type !== 'chat' && <Badge color="blue">{t(capitalize(model.type))}</Badge>}

                    {model.capabilities?.includes('reasoning') && (
                      <Tooltip label={t('Reasoning')}>
                        <Text span c="chatbox-warning" className="flex items-center" style={{ opacity: 0.7 }}>
                          <ScalableIcon icon={IconBulb} size={14} />
                        </Text>
                      </Tooltip>
                    )}
                    {model.capabilities?.includes('vision') && (
                      <Tooltip label={t('Vision')}>
                        <Text span c="chatbox-brand" className="flex items-center" style={{ opacity: 0.7 }}>
                          <ScalableIcon icon={IconEye} size={14} />
                        </Text>
                      </Tooltip>
                    )}
                    {model.capabilities?.includes('tool_use') && (
                      <Tooltip label={t('Tool Use')}>
                        <Text span c="chatbox-success" className="flex items-center" style={{ opacity: 0.7 }}>
                          <ScalableIcon icon={IconTool} size={14} />
                        </Text>
                      </Tooltip>
                    )}

                    {model.contextWindow && (
                      <Tooltip
                        label={`${t('Context Window')}: ${formatTokenCount(model.contextWindow)} ${t('tokens')}`}
                      >
                        <Flex gap={2} align="center" c="dimmed" style={{ flexShrink: 0, opacity: 0.8 }}>
                          <ScalableIcon icon={IconDatabase} size={12} />
                          <Text size="xs" style={{ whiteSpace: 'nowrap' }}>
                            {formatTokenCount(model.contextWindow)}
                          </Text>
                        </Flex>
                      </Tooltip>
                    )}
                    {model.maxOutput && (
                      <Tooltip label={`${t('Max Output')}: ${formatTokenCount(model.maxOutput)} ${t('tokens')}`}>
                        <Flex gap={2} align="center" c="dimmed" style={{ flexShrink: 0, opacity: 0.8 }}>
                          <ScalableIcon icon={IconLogout} size={12} />
                          <Text size="xs" style={{ whiteSpace: 'nowrap' }}>
                            {formatTokenCount(model.maxOutput)}
                          </Text>
                        </Flex>
                      </Tooltip>
                    )}
                  </Flex>
                )}
              </Stack>

              {showActions && (
                <Flex flex="0 0 auto" gap="xs" align="center" className="ml-auto">
                  {onEditModel && (
                    <Button
                      data-testid={TestId.settings.providerModelEdit}
                      variant="transparent"
                      c="chatbox-tertiary"
                      p={0}
                      h="auto"
                      size="xs"
                      bd={0}
                      onClick={() => onEditModel(model)}
                    >
                      <ScalableIcon icon={IconSettings} size={20} />
                    </Button>
                  )}

                  {onDeleteModel && (
                    <Button
                      data-testid={TestId.settings.providerModelDelete}
                      variant="transparent"
                      c="chatbox-error"
                      p={0}
                      h="auto"
                      size="compact-xs"
                      bd={0}
                      onClick={() => onDeleteModel(model.modelId)}
                    >
                      <ScalableIcon icon={IconCircleMinus} size={20} />
                    </Button>
                  )}

                  {onAddModel &&
                    onRemoveModel &&
                    displayedModelIds &&
                    (displayedModelIds.includes(model.modelId) ? (
                      <Button
                        variant="transparent"
                        p={0}
                        h="auto"
                        size="xs"
                        bd={0}
                        onClick={() => onRemoveModel(model.modelId)}
                      >
                        <ScalableIcon icon={IconCircleMinus} size={20} className="text-chatbox-tint-error" />
                      </Button>
                    ) : (
                      <Button variant="transparent" p={0} h="auto" size="xs" bd={0} onClick={() => onAddModel(model)}>
                        <ScalableIcon icon={IconCirclePlus} size={20} className="text-chatbox-tint-success" />
                      </Button>
                    ))}
                </Flex>
              )}
            </Flex>
          ))
        ) : (
          <Flex align="center" justify="center" py="lg" px="xs">
            <Text component="span" size="sm" c="chatbox-tertiary">
              {searchQuery.trim() ? t('No models found matching your search') : t('No models available')}
            </Text>
          </Flex>
        )}
      </Stack>
    </Stack>
  )
}
