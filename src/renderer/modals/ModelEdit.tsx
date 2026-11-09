import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Checkbox, Flex, Loader, NumberInput, Stack, Text, TextInput, Textarea, UnstyledButton, MultiSelect } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import type { ProviderModelInfo } from '@shared/types'
import { CHATGPT_SUB_PROVIDER } from '@shared/oauth/chatgpt-subscription'
import { subscriptionReasoningEfforts, DEFAULT_SUBSCRIPTION_CONTEXT_WINDOW } from '@shared/oauth/chatgpt-model-catalog'
import { forkT as ft } from '@/i18n/fork'
import { VeniceProfileEditor } from '@/components/settings/provider/VeniceProfiles'
import { useProviderSettings } from '@/stores/settingsStore'
import type { VeniceProfile } from '@shared/providers/definitions/models/venice/options'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createModelDependencies } from '@/adapters'
import { AdaptiveSelect } from '@/components/AdaptiveSelect'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import platform from '@/platform'
import { settingsStore } from '@/stores/settingsStore'
import { type ModelTestState, testModelCapabilities } from '@/utils/model-tester'

const ModelEdit = NiceModal.create((props: { model?: ProviderModelInfo; providerId?: string }) => {
  const modal = useModal()
  const { t } = useTranslation()

  const { providerSettings: veniceSettings } = useProviderSettings('venice')
  const [veniceProfile, setVeniceProfile] = useState<VeniceProfile>(props.model?.veniceProfile || {})
  const isNew = !props.model
  const isSubscription = props.providerId === CHATGPT_SUB_PROVIDER
  const canEditExtraBody = isSubscription || props.providerId === 'venice' || settingsStore.getState().customProviders?.some((p) => p.id === props.providerId)
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<ProviderModelInfo['subscriptionEndpoint']>(props.model?.subscriptionEndpoint || (props.model?.type === 'image' ? 'image-tool' : 'responses'))
  const [thinkingLevels, setThinkingLevels] = useState<string[]>(subscriptionReasoningEfforts(props.model).length ? subscriptionReasoningEfforts(props.model) : ['low', 'medium', 'high', 'xhigh', 'max'])
  const [extraBodyText, setExtraBodyText] = useState(props.model?.extraBody ? JSON.stringify(props.model.extraBody, null, 2) : '')
  const [extraBodyError, setExtraBodyError] = useState<string>()
  const [nativeWebSearch, setNativeWebSearch] = useState(props.model?.nativeWebSearch ?? false)
  const [modelId, setModelId] = useState(props.model?.modelId || '')
  const [nickname, setNickname] = useState(props.model?.nickname || '')
  const [capabilities, setCapabilities] = useState(props.model?.capabilities || [])
  const [type, setType] = useState<ProviderModelInfo['type']>(props.model?.type || 'chat')
  const [contextWindow, setContextWindow] = useState<number | undefined>(props.model?.contextWindow ?? (isSubscription ? DEFAULT_SUBSCRIPTION_CONTEXT_WINDOW : undefined))
  const [maxOutput, setMaxOutput] = useState<number | undefined>(props.model?.maxOutput)
  const [testState, setTestState] = useState<ModelTestState>({
    testing: false,
  })

  const typeOptions = [
    { value: 'chat', label: t('Chat')?.toString() ?? 'Chat' },
    { value: 'image', label: t('Image')?.toString() ?? 'Image' },
    { value: 'embedding', label: t('Embedding')?.toString() ?? 'Embedding' },
    { value: 'rerank', label: t('Rerank')?.toString() ?? 'Rerank' },
  ]

  useEffect(() => {
    setVeniceProfile(props.model?.veniceProfile || {})
    setModelId(props.model?.modelId || '')
    setNickname(props.model?.nickname || '')
    setCapabilities(props.model?.capabilities || [])
    setType(props.model?.type || 'chat')
    setContextWindow(props.model?.contextWindow ?? (isSubscription ? DEFAULT_SUBSCRIPTION_CONTEXT_WINDOW : undefined))
    setMaxOutput(props.model?.maxOutput)
    setTestState({ testing: false })
    setExtraBodyText(props.model?.extraBody ? JSON.stringify(props.model.extraBody, null, 2) : '')
    setExtraBodyError(undefined)
    setNativeWebSearch(props.model?.nativeWebSearch ?? false)
    setSubscriptionEndpoint(props.model?.subscriptionEndpoint || (props.model?.type === 'image' ? 'image-tool' : 'responses'))
    setThinkingLevels(subscriptionReasoningEfforts(props.model).length ? subscriptionReasoningEfforts(props.model) : ['low', 'medium', 'high', 'xhigh', 'max'])
  }, [props.model, props.providerId])

  const handleTestModel = async () => {
    if (!modelId || !props.providerId) return

    let edited: ProviderModelInfo
    try { edited = getEditedModel() } catch (error) {
      setExtraBodyError(error instanceof Error ? error.message : String(error))
      return
    }
    const currentSettings = settingsStore.getState()
    const providerSettings = currentSettings.providers?.[props.providerId] || {}
    const configs = await platform.getConfig()
    const dependencies = await createModelDependencies()

    await testModelCapabilities({
      providerId: props.providerId,
      modelId,
      settings: { ...currentSettings, providers: { ...currentSettings.providers, [props.providerId]: {
        ...providerSettings,
        models: [...(providerSettings.models || []).filter((m) => m.modelId !== modelId), edited],
      } } },
      configs,
      dependencies,
      onStateChange: (state) => {
        setTestState(state)

        // Auto-enable capabilities based on test results
        if (state.visionTest?.status === 'success') {
          setCapabilities((prev = []) => (prev.includes('vision') ? prev : [...prev, 'vision']))
        }
        if (state.toolTest?.status === 'success') {
          setCapabilities((prev = []) => (prev.includes('tool_use') ? prev : [...prev, 'tool_use']))
        }
      },
    })
  }

  const handleCancel = () => {
    modal.resolve()
    modal.hide()
  }

  const getEditedModel = (): ProviderModelInfo => ({
      ...props.model,
      modelId,
      type,
      nickname: nickname || undefined,
      capabilities,
      contextWindow,
      maxOutput,
      ...(isSubscription ? { subscriptionEndpoint: type === 'image' ? (subscriptionEndpoint === 'responses' ? 'image-tool' : subscriptionEndpoint) : 'responses', apiStyle: 'openai-responses' as const, vendorMetadata: { ...props.model?.vendorMetadata, codexReasoningEfforts: capabilities.includes('reasoning') ? thinkingLevels : [], catalogSource: 'manual' } } : {}),
      ...(props.providerId === 'venice' ? { veniceProfile } : {}),
      ...(canEditExtraBody ? { extraBody: parseExtraBody(extraBodyText), ...(!isSubscription ? { nativeWebSearch } : {}) } : {}),
    })

  const handleSave = () => {
    try { modal.resolve(getEditedModel()) } catch (error) {
      setExtraBodyError(error instanceof Error ? error.message : String(error))
      return
    }
    modal.hide()
  }

  return (
    <AdaptiveModal
      keepMounted={false}
      opened={modal.visible}
      onClose={handleCancel}
      title={t('Edit Model')}
      centered={true}
      w={456}
    >
      <Stack data-testid={TestId.settings.providerModelEditor} gap="md">
        {/* Model ID & NickName */}
        <Stack gap="xs">
          <Flex align="center" gap="lg">
            <Stack gap={0}>
              <Text>{t('Model ID')}</Text>
              <Text className="select-none h-0 overflow-hidden opacity-0">{t('Nickname')}</Text>
            </Stack>
            <TextInput
              data-testid={TestId.settings.providerModelEditorId}
              disabled={!isNew}
              flex={1}
              value={modelId}
              onChange={(e) => setModelId(e.currentTarget.value)}
            />
          </Flex>
          <Flex align="center" gap="lg">
            <Stack gap={0}>
              <Text className="select-none h-0 overflow-hidden opacity-0">{t('Model ID')}</Text>
              <Text>{t('Nickname')}</Text>
            </Stack>
            <TextInput
              data-testid={TestId.settings.providerModelEditorNickname}
              placeholder={String(t('optional') ?? 'optional')}
              flex={1}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </Flex>
        </Stack>

        {/* Model Type */}
        <Stack gap="xs">
          <Text fw="600">{t('Model Type')}</Text>
          <AdaptiveSelect
            classNames={{ dropdown: 'pointer-events-auto' }}
            comboboxProps={{ withinPortal: false }}
            allowDeselect={false}
            styles={{
              label: {
                fontWeight: 400,
              },
            }}
            data={isSubscription ? typeOptions.filter(option => option.value === 'chat' || option.value === 'image') : typeOptions}
            value={type}
            onChange={(v) => setType(v as ProviderModelInfo['type'])}
          />
        </Stack>

        {/* Capabilities */}
        {isSubscription && <Stack gap="xs"><AdaptiveSelect comboboxProps={{withinPortal:false}} allowDeselect={false} label={ft('Subscription request endpoint')} value={type === 'image' ? (subscriptionEndpoint === 'responses' ? 'image-tool' : subscriptionEndpoint) : 'responses'} data={type === 'image' ? [{value:'image-tool',label:ft('Image tool · /responses')},{value:'images',label:ft('Images API · /images/generations and /images/edits')}] : [{value:'responses',label:'Codex · /responses'}]} onChange={value => setSubscriptionEndpoint(value as ProviderModelInfo['subscriptionEndpoint'])} /><Text size="xs" c="dimmed">{ft('Custom model IDs are kept when the catalog refreshes. All subscription requests stay on ChatGPT. Unsupported model or endpoint errors are shown without switching providers.')}</Text>{type === 'chat' && capabilities.includes('reasoning') && <MultiSelect comboboxProps={{withinPortal:false}} label={ft('Supported thinking levels')} description={ft('Choose the levels accepted by this model. These values are sent as reasoning.effort.')} data={['none','minimal','low','medium','high','xhigh','max']} value={thinkingLevels} onChange={setThinkingLevels} />}</Stack>}
        {type === 'chat' && (
          <Stack gap="xs">
            <Text fw="600">{t('Capabilities')}</Text>
            <Flex align="center" gap="md">
              <Checkbox
                flex={1}
                label={t('Vision')}
                checked={capabilities?.includes('vision')}
                onChange={(e) => {
                  const checked = e.currentTarget.checked
                  if (checked) {
                    setCapabilities([...(capabilities || []), 'vision'])
                  } else {
                    setCapabilities([...(capabilities?.filter((c) => c !== 'vision') || [])])
                  }
                }}
              />
              <Checkbox
                flex={1}
                label={t('Reasoning')}
                checked={capabilities?.includes('reasoning')}
                onChange={(e) => {
                  const checked = e.currentTarget.checked
                  if (checked) {
                    setCapabilities([...(capabilities || []), 'reasoning'])
                  } else {
                    setCapabilities([...(capabilities?.filter((c) => c !== 'reasoning') || [])])
                  }
                }}
              />
              <Checkbox
                data-testid={TestId.settings.providerModelEditorToolUse}
                flex={1}
                label={t('Tool use')}
                checked={capabilities?.includes('tool_use')}
                onChange={(e) => {
                  const checked = e.currentTarget.checked
                  if (checked) {
                    setCapabilities([...(capabilities || []), 'tool_use'])
                  } else {
                    setCapabilities([...(capabilities?.filter((c) => c !== 'tool_use') || [])])
                  }
                }}
              />
            </Flex>
          </Stack>
        )}

        {props.providerId === 'venice' && <VeniceProfileEditor options={veniceSettings?.venice || {}} value={veniceProfile} onChange={setVeniceProfile} />}
        {/* Context Window and Max Output */}
        <Stack gap="xs">
          <Text fw="600">{t('Advanced Settings')}</Text>
          <Flex gap="md">
            <Stack gap="xs" flex={1}>
              <Text size="sm">{t('Context Window')}</Text>
              <NumberInput
                placeholder={String(t('e.g. 128000'))}
                  description={isSubscription ? ft('Local context budget for this model. A lower account-reported limit still applies.') : undefined}
                value={contextWindow}
                onChange={(value) => setContextWindow(typeof value === 'number' ? value : undefined)}
                min={1}
                max={10_000_000}
                step={1000}
                thousandSeparator=","
                clampBehavior="strict"
              />
                {isSubscription && typeof props.model?.vendorMetadata?.codexReportedContextWindow === 'number' && <Text size="xs" c="dimmed">{ft('Reported model context')}: {props.model.vendorMetadata.codexReportedContextWindow.toLocaleString()}</Text>}
            </Stack>
            <Stack gap="xs" flex={1}>
              <Text size="sm">{t('Max Output Tokens')}</Text>
              <NumberInput
                placeholder={String(t('e.g. 4096'))}
                value={maxOutput}
                onChange={(value) => setMaxOutput(typeof value === 'number' ? value : undefined)}
                min={1}
                max={1_000_000}
                step={100}
                thousandSeparator=","
                clampBehavior="strict"
              />
            </Stack>
          </Flex>
        </Stack>

        {canEditExtraBody && (
          <Stack gap="xs">
            <Textarea
              label={t('Extra request JSON')}
              description={t('Merged into each request. Objects merge recursively; arrays replace. Use a unique Model ID and set model in JSON to create variants of the same remote model.')}
              placeholder={'{ "moderation": "low" }'}
              autosize minRows={4} maxRows={14}
              value={extraBodyText}
              error={extraBodyError}
              onChange={(event) => { setExtraBodyText(event.currentTarget.value); setExtraBodyError(undefined) }}
              styles={{ input: { fontFamily: 'monospace' } }}
            />
            {type === 'chat' && !isSubscription && <Checkbox
              label={t('Use provider native web search')}
              description={t('Configure search in the extra JSON. Chatbox search tools will not be sent.')}
              checked={nativeWebSearch}
              onChange={(event) => setNativeWebSearch(event.currentTarget.checked)}
            />}
          </Stack>
        )}

        <AdaptiveModal.Actions>
          {testState.basicTest?.status === 'success' ? (
            <Text c="chatbox-success" className="text-center">
              {t('Test successful')}
            </Text>
          ) : testState.basicTest?.status === 'error' ? (
            <Tooltip label={testState.basicTest.error} multiline maw={300} zIndex={3000} openOnTouch>
              <UnstyledButton
                type="button"
                c="chatbox-error"
                style={{ cursor: 'help', textAlign: 'center' }}
                className="inline-block"
              >
                {t('Test failed')}
              </UnstyledButton>
            </Tooltip>
          ) : null}
          <AdaptiveModal.CloseButton onClick={handleCancel} />
          <Button variant="light" onClick={handleTestModel}>
            {testState.testing ? <Loader size="xs" /> : t('Test Model')}
          </Button>
          <Button data-testid={TestId.settings.providerModelEditorSave} onClick={handleSave}>
            {t('Save')}
          </Button>
        </AdaptiveModal.Actions>
      </Stack>
    </AdaptiveModal>
  )
})

export default ModelEdit
