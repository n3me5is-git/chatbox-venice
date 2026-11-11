import {ImagePromptField} from '@/components/venice/ImagePromptField'
import { ProtectedPreviewGate } from '@/components/security/ProtectedPreviewGate'
import { chooseUploadSource } from '@/components/local-library/UploadSource'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { CreationUnlock } from '@/components/security/CreationUnlock'
import { forkT as ft } from '@/i18n/fork'
import { referenceImageModel, imageVariant } from '@shared/providers/definitions/models/venice/image-reference-model'
import { VeniceImageEditor } from '@/components/venice/VeniceImageEditor'
import { VeniceBalance } from '@/components/venice/VeniceBalance'
import { ChatGPTAllowance } from '@/components/settings/provider/ChatGPTAllowance'
import { ScopeUnlock,useScopeStatus } from '@/components/security/ScopeUnlock'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { lockedImageRecord } from '@/packages/vault/image-records'
import NiceModal from '@ebay/nice-modal-react'
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Loader,
  Menu,
  Group,
  NumberInput,
  Checkbox,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import type { ImageGeneration, ImageGenerationModel } from '@shared/types'
import { ModelProviderEnum } from '@shared/types'
import { VeniceModelCost } from '@/components/venice/VeniceModelCost'
import {
  IconArrowUp,
  IconAspectRatio,
  IconChevronRight,
  IconHistory,
  IconPhoto,
  IconPlus,
  IconSparkles,
} from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JK_PAGE_NAMES } from '@/analytics/jk-events'
import { ChatboxWelcomeCard } from '@/components/common/ChatboxWelcomeCard'
import errorNoticeClasses from '@/components/common/ErrorNotice.module.css'
import { ImageModelSelect } from '@/components/ImageModelSelect'
import { VeniceModelInfo } from '@/components/venice/VeniceModelInfo'
import { VeniceModelBadges } from '@/components/venice/VeniceModelBadges'
import { VeniceImageSettings } from '@/components/settings/provider/VeniceSettings'
import { SEND_BUTTON_BLOCKED_CLASS } from '@/components/InputBox/inputSurface'
import Page from '@/components/layout/Page'
import { type ImageModelGroup, useImageModelGroups } from '@/hooks/useImageModelGroups'
import { useProviders } from '@/hooks/useProviders'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import useVersion from '@/hooks/useVersion'
import { getLogger } from '@/lib/utils'
import { resumeImageGenerationWithFollowUp } from '@/packages/chatbox-cli/image-task-follow-up'
import imageFailurePlaceholder from '@/static/images/errors/img-fail-placeholder.png'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { cancelGeneration, createAndGenerate, retryGeneration } from '@/stores/imageGenerationActions'
import {
  deleteRecord,
  IMAGE_GEN_LIST_QUERY_KEY,
  IMAGE_GEN_QUERY_KEY,
  imageGenerationStore,
  useCurrentGeneratingId,
  useCurrentRecordId,
  useImageGenerationHistory,
  useImageGenerationRecord,
} from '@/stores/imageGenerationStore'
import { lastUsedModelStore, useLastUsedModelStore } from '@/stores/lastUsedModelStore'
import { queryClient } from '@/stores/queryClient'
import { settingsStore, useSettingsStore } from '@/stores/settingsStore'
import * as toastActions from '@/stores/toastActions'
import { getHomeWelcomeCardMode } from '@/utils/homeWelcomeCard'
import { HISTORY_PANEL_WIDTH } from './-components/constants'
import { EmptyState } from './-components/EmptyState'
import { GeneratedImagesGallery } from './-components/GeneratedImagesGallery'
import { HistoryPanel } from './-components/HistoryPanel'
import { ImageGenerationErrorTips } from './-components/ImageGenerationErrorTips'
import { MobileHistoryDrawer, MobileModelDrawer, MobileRatioDrawer } from './-components/MobileDrawers'
import {
  getHistoryImageModelDisplayName as resolveHistoryImageModelDisplayName,
  getImageModelDisplayName as resolveImageModelDisplayName,
} from './-components/model-display-name'
import {
  getImageModelRatioOptions,
  resolveImageModelSelection,
  resolveImageRatioSelection,
} from './-components/model-selection'
import { PromptDisplay } from './-components/PromptDisplay'
import { ReferenceImagesPreview } from './-components/ReferenceImagesPreview'
import { LoadingShimmer } from './-components/Shimmer'
import { useReferenceImageDraft } from './-hooks/useReferenceImageDraft'

const log = getLogger('image-creator')

export const Route = createFileRoute('/image-creator/')({
  component: ImageCreatorPage,
})

/* ============================================
   Input Toolbar (Model/Ratio/Reference buttons)
   ============================================ */

interface InputToolbarProps {
  isSmallScreen: boolean
  modelGroups: ImageModelGroup[]
  modelDisplayName: string
  selectedRatio: string
  ratioOptions: string[]
  onModelDrawerOpen: () => void
  onRatioDrawerOpen: () => void
  onRatioSelect: (ratio: string) => void
  onModelSelect: (provider: string, model: string) => void
  onAddReference: () => void
  onNewCreation: () => void
}

function InputToolbar({
  isSmallScreen,
  modelGroups,
  modelDisplayName,
  selectedRatio,
  ratioOptions,
  onModelDrawerOpen,
  onRatioDrawerOpen,
  onRatioSelect,
  onModelSelect,
  onAddReference,
  onNewCreation,
}: InputToolbarProps) {
  const { t } = useTranslation()

  return (
    <Flex align="center" gap={0} className="shrink-0 w-full min-w-0" justify="space-between" style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }} aria-label={ft('Scrollable image tools')}>
      {/* Left Group: Model, Ratio, Reference */}
      <Flex align="center" gap={0} style={{ flexShrink: 0 }}>
        {/* Model Select */}
        {isSmallScreen ? (
          <UnstyledButton
            onClick={onModelDrawerOpen}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
          >
            <IconSparkles size={16} className="text-[var(--chatbox-tint-secondary)]" />
            <Text size="sm" className="text-[var(--chatbox-tint-secondary)] max-w-[120px] truncate">
              {modelDisplayName}
            </Text>
            <IconChevronRight size={14} className="text-[var(--chatbox-tint-tertiary)] rotate-90" />
          </UnstyledButton>
        ) : (
          <ImageModelSelect modelGroups={modelGroups} onSelect={onModelSelect}>
            <UnstyledButton className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors">
              <IconSparkles size={16} className="text-[var(--chatbox-tint-secondary)]" />
              <Text size="sm" className="text-[var(--chatbox-tint-secondary)] max-w-[120px] truncate">
                {modelDisplayName}
              </Text>
              <IconChevronRight size={14} className="text-[var(--chatbox-tint-tertiary)] rotate-90" />
            </UnstyledButton>
          </ImageModelSelect>
        )}

        {/* Ratio Select */}
        {isSmallScreen ? (
          <UnstyledButton
            onClick={onRatioDrawerOpen}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
          >
            <IconAspectRatio size={16} className="text-[var(--chatbox-tint-secondary)]" />
            <Text size="sm" className="text-[var(--chatbox-tint-secondary)]">
              {selectedRatio}
            </Text>
            <IconChevronRight size={14} className="text-[var(--chatbox-tint-tertiary)] rotate-90" />
          </UnstyledButton>
        ) : (
          <Menu position="top" withinPortal shadow="md" radius="lg">
            <Menu.Target>
              <UnstyledButton className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors">
                <IconAspectRatio size={16} className="text-[var(--chatbox-tint-secondary)]" />
                <Text size="sm" className="text-[var(--chatbox-tint-secondary)]">
                  {selectedRatio}
                </Text>
                <IconChevronRight size={14} className="text-[var(--chatbox-tint-tertiary)] rotate-90" />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown className="!rounded-lg" style={{ minWidth: 100 }}>
              {ratioOptions.map((ratio) => (
                <Menu.Item key={ratio} onClick={() => onRatioSelect(ratio)} className="!rounded-lg">
                  <Text size="sm" fw={500} ta="center">
                    {ratio}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Reference Image Button */}
        <UnstyledButton
          onClick={onAddReference}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
        >
          <IconPhoto size={16} className="text-[var(--chatbox-tint-secondary)]" />
          <Text size="sm" className="text-[var(--chatbox-tint-secondary)]">
            {t('Upload')}
          </Text>
        </UnstyledButton>
      </Flex>

      {/* Right Group: New Creation */}
      <Flex align="center" gap={4}>
        {/* New Creation Button */}
        {isSmallScreen ? (
          <ActionIcon variant="light" size="md" radius="lg" onClick={onNewCreation}>
            <IconPlus size={18} />
          </ActionIcon>
        ) : (
          <Button
            variant="light"
            size="compact-md"
            radius="lg"
            fz="sm"
            leftSection={<IconPlus size={16} />}
            onClick={onNewCreation}
          >
            {t('New Creation')}
          </Button>
        )}
      </Flex>
    </Flex>
  )
}

/* ============================================
   Main Page Component
   ============================================ */

function ImageCreatorEmbeddedFrame({ children, right }: { children: React.ReactNode; title?: React.ReactNode; right?: React.ReactNode }) { return <Stack gap="sm" h="75dvh" mih={480}><Group justify="end">{right}</Group>{children}</Stack> }
export function ImageCreatorPage({ onlyVenice = false, embedded = false }: { onlyVenice?: boolean; embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const { providers } = useProviders()
  const venicePrivacyFilter=useSettingsStore(state=>state.providers?.venice?.venice?.privacyFilter||'all')
  const allImageModelGroups = useImageModelGroups()
  const imageModelGroups = useMemo(() => onlyVenice ? allImageModelGroups.filter(group => group.providerId === 'venice') : allImageModelGroups, [allImageModelGroups, onlyVenice])
  const Frame = embedded ? ImageCreatorEmbeddedFrame : Page
  const [imageSettingsOpen,setImageSettingsOpen]=useState(false)
  const uploadSource=()=>chooseUploadSource({device:()=>fileInputRef.current?.click(),accept:'image/png,image/jpeg,image/webp',multiple:true,onLocal:files=>void handleImageUpload(files)})
  const [batchCount, setBatchCount] = useState(1)
  const [saveProtected,setSaveProtected]=useState(false)
  const vault=vaultRuntimeFor(platform)
  const {revision:protectionRevision}=useScopeStatus(vault.keys)
  const hasLicense = useSettingsStore((s) => Boolean(s.licenseKey))
  const hasExpiredLicense = useSettingsStore((s) => s.hasExpiredLicense)
  const isLoggedIn = useAuthInfoStore((s) => Boolean(s.accessToken && s.refreshToken))
  const { isExceeded, isExceededResolved } = useVersion()
  const welcomeCardMode = useMemo(
    () =>
      getHomeWelcomeCardMode({
        providerCount: providers.length,
        isLoggedIn,
        hasLicense,
        hasExpiredLicense,
        hideForStoreReview: isExceeded || !isExceededResolved,
      }),
    [providers.length, isLoggedIn, hasLicense, hasExpiredLicense, isExceeded, isExceededResolved]
  )

  const [prompt, setPrompt] = useState('')
  const {
    images: referenceImages,
    upload: handleImageUpload,
    addReference: handleUseAsReference,
    removeReference: handleRemoveReferenceImage,
    replace: replaceReferenceImages,
    clear: clearReferenceImages,
    beginSubmission,
    cropReference,
    isImporting: isImportingReferences,
    importError: referenceImportError,
  } = useReferenceImageDraft()
  const picture = useLastUsedModelStore((state) => state.picture)
  const [showHistory, setShowHistory] = useState(true)
  const [showMobileHistory, setShowMobileHistory] = useState(false)
  const selection = resolveImageModelSelection(
    imageModelGroups,
    picture?.provider ?? ModelProviderEnum.ChatboxAI,
    picture?.modelId ?? ''
  )
  const selectedProvider = selection?.provider ?? ''
  const selectedModel = selection?.model ?? ''
  const [selectedRatio, setSelectedRatio] = useState<string>('auto')
  const [showModelDrawer, setShowModelDrawer] = useState(false)
  const [showRatioDrawer, setShowRatioDrawer] = useState(false)

  const selectedModelCapabilities = useMemo(
    () =>
      imageModelGroups
        .find((group) => group.providerId === selectedProvider)
        ?.models.find((model) => model.modelId === selectedModel)?.capabilities,
    [imageModelGroups, selectedProvider, selectedModel]
  )
  const ratioOptions = useMemo(
    () => getImageModelRatioOptions(selectedModel, selectedModelCapabilities),
    [selectedModel, selectedModelCapabilities]
  )

  const selectedOption = imageModelGroups.find(group => group.providerId === selectedProvider)?.models.find(model => model.modelId === selectedModel)
  const referenceOption = selectedProvider==='venice' ? referenceImageModel(imageModelGroups.find(group=>group.providerId==='venice')?.models||[],selectedModel,referenceImages.length) : selectedOption
  useEffect(()=>{
    if(referenceImages.length&&referenceOption&&referenceOption.modelId!==selectedModel){
      lastUsedModelStore.getState().setPictureModel(selectedProvider,referenceOption.modelId)
    }
  },[referenceOption?.modelId,selectedProvider,selectedModel,referenceImages.length])
  const currentGeneratingId = useCurrentGeneratingId()
  const currentRecordId = useCurrentRecordId()
  const { data: currentRecordRaw } = useImageGenerationRecord(currentRecordId)
  const visibleRecord=currentRecordRaw?.protection&&!vault.keys.isUnlocked(currentRecordRaw.protection)?lockedImageRecord(currentRecordRaw):currentRecordRaw
  const currentRecord = onlyVenice && visibleRecord?.model.provider !== 'venice' ? undefined : visibleRecord

  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: historyLoading,
  } = useImageGenerationHistory()

  const historyCache = useMemo(() => {
    return (historyData?.pages.flatMap((page) => page.items) ?? []).filter(record => !onlyVenice || record.model.provider === 'venice').map(record=>record.protection&&!vault.keys.isUnlocked(record.protection)?lockedImageRecord(record):record)
  }, [historyData, onlyVenice, protectionRevision])
  useEffect(()=>{void queryClient.invalidateQueries({queryKey:[IMAGE_GEN_LIST_QUERY_KEY]});void queryClient.invalidateQueries({queryKey:[IMAGE_GEN_QUERY_KEY]});if(!vault.keys.isUnlocked('app')&&(saveProtected||currentRecordRaw?.protection))setPrompt('')},[protectionRevision])

  const isCurrentlyGenerating = currentGeneratingId !== null

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setSelectedRatio((prev) => resolveImageRatioSelection(prev, ratioOptions))
  }, [ratioOptions])

  const handleModelSelect = useCallback(
    (provider: string, model: string) => {
      lastUsedModelStore.getState().setPictureModel(provider, model)

      const capabilities = imageModelGroups
        .find((group) => group.providerId === provider)
        ?.models.find((option) => option.modelId === model)?.capabilities
      const newRatioOptions = getImageModelRatioOptions(model, capabilities)
      setSelectedRatio((prev) => resolveImageRatioSelection(prev, newRatioOptions))
    },
    [imageModelGroups]
  )

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isCurrentlyGenerating || isImportingReferences || referenceImportError) return
    if (!selectedModel) {
      toastActions.add(t('Please select a model'))
      return
    }

    if (selectedProvider === ModelProviderEnum.ChatboxAI && !settingsStore.getState().licenseKey) {
      toastActions.add(t('Please log in to Chatbox AI first'))
      return
    }

    try {
      if(saveProtected)await vault.keys.key('app')
      const submission = beginSubmission()
      try {
        await createAndGenerate(
          {
            prompt: prompt.trim(),
            protection: saveProtected?'app':undefined,
            referenceImages: submission.referenceImages,
            model: { provider: selectedProvider, modelId: selectedModel },
            imageGenerateNum: batchCount,
            aspectRatio: selectedRatio,
            parentIds: submission.parentIds.length > 0 ? submission.parentIds : undefined,
          },
          { onRecordCreated: submission.commit }
        )
      } catch (error) {
        await submission.rollback()
        throw error
      }
      if (submission.complete()) setPrompt('')
    } catch (error) {
      log.error('Failed to generate image:', error)
      toastActions.add(error instanceof Error?error.message:ft('Unable to generate image'))
    }
  }, [prompt, beginSubmission, selectedProvider, selectedModel, selectedRatio, isCurrentlyGenerating, isImportingReferences, referenceImportError, batchCount, t,saveProtected,vault])

  const handleQuickPromptSubmit = useCallback((quickPrompt:string)=>{if(isCurrentlyGenerating)return;setPrompt(quickPrompt);textareaRef.current?.focus()},[isCurrentlyGenerating])

  const handleReportGeneratedImage = useCallback(async (record: ImageGeneration) => {
    const contentId = [
      `Image generation prompt: ${record.prompt}`,
      `Record ID: ${record.id}`,
      record.taskId ? `Task ID: ${record.taskId}` : undefined,
      record.generatedImages.length > 0 ? `Images: ${record.generatedImages.join(', ')}` : undefined,
      `Model: ${record.model.provider}/${record.model.modelId}`,
    ]
      .filter((item): item is string => Boolean(item))
      .join('\n')

    await NiceModal.show('report-content', { contentId })
  }, [])

  const handleHistoryClick = useCallback(
    async (record: ImageGeneration) => {
      imageGenerationStore.getState().setCurrentRecordId(record.id)
      if(record.protectedRecord)return
      setPrompt(record.prompt)

      await replaceReferenceImages(record.referenceImages.map((key) => ({ storageKey: key })))
    },
    [replaceReferenceImages]
  )

  const handleNewCreation = useCallback(() => {
    void clearReferenceImages()
    imageGenerationStore.getState().setCurrentRecordId(null)
    setPrompt('')
    textareaRef.current?.focus()
  }, [clearReferenceImages])

  const handleLoadMoreHistory = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteRecord(id)
      queryClient.invalidateQueries({ queryKey: [IMAGE_GEN_LIST_QUERY_KEY] })
    } catch (error) {
      log.error('Failed to delete record:', error)
    }
  }, [])

  const getImageModelDisplayName = useCallback(
    (model: ImageGenerationModel) => resolveImageModelDisplayName(model, { imageModelGroups, providers }),
    [imageModelGroups, providers]
  )

  const modelDisplayName = useMemo(() => {
    if (!selectedModel) return t('No models available')
    return getImageModelDisplayName({
      provider: selectedProvider,
      modelId: selectedModel,
    })
  }, [selectedProvider, selectedModel, getImageModelDisplayName, t])

  const getHistoryImageModelDisplayName = useCallback(
    (model: ImageGenerationModel) => resolveHistoryImageModelDisplayName(model, { imageModelGroups, providers }),
    [imageModelGroups, providers]
  )

  const headerRight = isSmallScreen ? (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="md"
      radius="lg"
      onClick={() => setShowMobileHistory(true)}
      className="controls"
    >
      <IconHistory size={20} />
    </ActionIcon>
  ) : (
    <UnstyledButton
      onClick={() => setShowHistory(!showHistory)}
      className={`controls flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${showHistory ? 'bg-[var(--chatbox-background-tertiary)]' : 'bg-[var(--chatbox-background-secondary)]'}`}
    >
      <IconHistory size={18} className="text-[var(--chatbox-tint-secondary)]" />
      <Text size="sm" className="text-[var(--chatbox-tint-secondary)]">
        {t('History')}
      </Text>
    </UnstyledButton>
  )

  return (
    <Frame title={t('Image Creator')} right={headerRight}>
      <Flex flex={1} h="100%" className="overflow-hidden relative">
        {/* Main Content Area */}
        <Flex direction="column" flex={1} h="100%" className="overflow-hidden relative">
          {/* Results Area */}
          <ScrollArea flex={1} mih={160} type="auto" offsetScrollbars={!isSmallScreen}>
            <Box maw={900} mx="auto" py="xl" px="md" className="min-h-full">
              {!currentRecord && <EmptyState onPromptSelect={handleQuickPromptSubmit} />}

              {currentRecord && (
                <ProtectedPreviewGate key={currentRecord.id} scope={currentRecord.protection}><Stack gap="lg" className="animate-in fade-in duration-300">
                  {currentRecord.status === 'generating' && currentRecord.generatedImages.length === 0 && (
                    <LoadingShimmer />
                  )}

                  {currentRecord.status === 'error' && currentRecord.generatedImages.length === 0 && (
                    <div className={errorNoticeClasses.placeholder}>
                      <img src={imageFailurePlaceholder} alt="" />
                    </div>
                  )}

                  {currentRecord.generatedImages.length > 0 && (
                    <Flex justify="center" w="100%">
                      <GeneratedImagesGallery
                        images={currentRecord.generatedImages}
                        thumbnails={currentRecord.generatedImageThumbnails}
                        onUseAsReference={(urlOrKey) => handleUseAsReference(urlOrKey, currentRecord.id)}
                        onReport={() => void handleReportGeneratedImage(currentRecord)}
                      />
                    </Flex>
                  )}

                  <Group justify="center" wrap="wrap">
                    {currentRecord.protectedRecord?<CreationUnlock keys={vault.keys} protection={currentRecord.protection}/>:<Button size="xs" variant="default" disabled={isCurrentlyGenerating} onClick={()=>void(async()=>{try{if(!currentRecord.protection)await vault.keys.key('app');await platform.getImageGenerationStorage().update(currentRecord.id,{protection:currentRecord.protection?undefined:'app'});await queryClient.invalidateQueries({queryKey:[IMAGE_GEN_QUERY_KEY]});await queryClient.invalidateQueries({queryKey:[IMAGE_GEN_LIST_QUERY_KEY]})}catch(error){toastActions.add(error instanceof Error?error.message:String(error))}})()}>{currentRecord.protection?ft('Make this creation public'):ft('Protect this creation')}</Button>}
                    <Button size="xs" variant="default" onClick={() => { setPrompt(currentRecord.prompt); textareaRef.current?.focus() }}>{ft("Reuse prompt")}</Button>
                    {!!currentRecord.generatedImages.length && <Button size="xs" variant="light" onClick={() => {
                      if(currentRecord.model.provider==='venice'){void NiceModal.show(VeniceImageEditor,{record:currentRecord,models:imageModelGroups.filter(group=>group.providerId==='venice').flatMap(group=>group.models),onCreated:(id:string)=>imageGenerationStore.getState().setCurrentRecordId(id)});return}
                      const edit = imageModelGroups.filter(group => group.providerId === currentRecord.model.provider).flatMap(group => group.models.map(model => ({ group, model }))).find(({ model }) => !!model.capabilities?.inputReferences && (model.capabilities.inputReferences.max || 1) > 0)
                      if (!edit) { toastActions.add(ft("Select or configure a model that supports image editing")); return }
                      handleModelSelect(edit.group.providerId, edit.model.modelId); setPrompt(currentRecord.prompt); void handleUseAsReference(currentRecord.generatedImages[0], currentRecord.id); textareaRef.current?.focus()
                    }}>{ft("Remix / edit image")}</Button>}
                  </Group>
                  <PromptDisplay
                    prompt={currentRecord.prompt}
                    modelDisplayName={getImageModelDisplayName(currentRecord.model)}
                    referenceImageCount={currentRecord.referenceImages.length}
                  />

                  {currentRecord.status !== 'done' && currentRecord.taskId && !isCurrentlyGenerating && (
                    <Flex justify="center" w="100%">
                      <Button variant="light" onClick={() => void resumeImageGenerationWithFollowUp(currentRecord.id)}>
                        {t('Resume Generation')}
                      </Button>
                    </Flex>
                  )}

                  {currentRecord.status === 'error' && (
                    <ImageGenerationErrorTips
                      record={currentRecord}
                      onRetry={() => void retryGeneration(currentRecord.id)}
                      isRetrying={isCurrentlyGenerating}
                    />
                  )}
                </Stack></ProtectedPreviewGate>
              )}
            </Box>
          </ScrollArea>

          {/* Input Area */}
          <Box py="xs" px="sm" style={{flexShrink:0,maxHeight:'42dvh',overflowY:'auto',overscrollBehavior:'contain',touchAction:'pan-y'}}>
            <Stack gap="sm" maw={800} mx="auto">
              {!currentRecord && welcomeCardMode !== 'none' && (
                <ChatboxWelcomeCard mode={welcomeCardMode} pageName={JK_PAGE_NAMES.IMAGE_PAGE} />
              )}

              <ReferenceImagesPreview
                images={referenceImages}
                onCrop={key=>void cropReference(key).catch(error=>toastActions.add(String(error instanceof Error?error.message:error)))}
                onRemove={handleRemoveReferenceImage}
                onAddClick={uploadSource}
              />
              {isImportingReferences&&<Text size="xs" c="dimmed">{ft('Wait until the reference images have finished loading')}</Text>}
              {referenceImportError&&<Group><Text size="xs" c="red">{ft(referenceImportError)}</Text><Button size="compact-xs" variant="subtle" onClick={()=>void clearReferenceImages()}>{ft('Clear selection')}</Button></Group>}
              {selectedProvider==='venice'&&selectedOption&&<Text size="xs" c="dimmed">{ft(imageVariant(selectedOption.vendorMetadata)||'Images')}{selectedOption.capabilities?.inputReferences?' · '+ft('Up to {{count}} reference images',{count:selectedOption.capabilities.inputReferences.max??1}):''}{referenceImages.length>0&&referenceOption?.modelId!==selectedModel?' · '+ft('Choose a model that accepts these reference images'):''}</Text>}
              {selectedProvider===ModelProviderEnum.OpenAISubscription&&selectedOption?.capabilities?.inputReferences&&<Text size="xs" c="dimmed">{ft('Up to {{count}} local references; your account may apply additional limits.',{count:selectedOption.capabilities.inputReferences.max??1})}</Text>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e.target.files)}
              />

              <Box
                className="rounded-lg bg-[var(--chatbox-background-secondary)] px-3 py-2"
                style={{ border: '1px solid var(--chatbox-border-primary)' }}
              >
                <Stack gap="xs">
                  {/* Input Row */}
                  <Flex align="flex-end" gap={4}>
                    <ImagePromptField
                      ref={textareaRef}
                      placeholder={t('Describe the image you want to create...') || ''}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onPaste={(e) => {
                        const items = Array.from(e.clipboardData.items)
                        const images = items
                          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                          .map((item) => item.getAsFile())
                          .filter((file): file is File => file !== null)
                        if (images.length === 0) return

                        if (!items.some((item) => item.kind === 'string' && item.type === 'text/plain')) {
                          e.preventDefault()
                        }
                        handleImageUpload(images)
                      }}
                      minRows={2}
                      maxRows={6}
                      autosize
                      size="sm"
                      className="flex-1"
                      styles={{
                        root: { flex: 1 },
                        wrapper: { flex: 1 },
                        input: {
                          border: 'none',
                          backgroundColor: 'transparent',
                          paddingLeft: 8,
                          paddingRight: 8,
                          '&:focus': { border: 'none', boxShadow: 'none' },
                        },
                      }}
                    />

                    {/* Send / Stop Button */}
                    <ActionIcon
                      size={32}
                      variant="filled"
                      color={isCurrentlyGenerating ? 'dark' : 'chatbox-brand'}
                      radius="xl"
                      onClick={isCurrentlyGenerating ? cancelGeneration : handleSubmit}
                      disabled={(!prompt.trim() || !selectedModel || isImportingReferences || !!referenceImportError) && !isCurrentlyGenerating}
                      className={`shrink-0 mb-1 ${(!prompt.trim() || !selectedModel) && !isCurrentlyGenerating ? SEND_BUTTON_BLOCKED_CLASS : ''}`}
                      style={{ cursor: isCurrentlyGenerating ? 'pointer' : undefined }}
                    >
                      {isCurrentlyGenerating ? <Loader size={16} color="white" /> : <IconArrowUp size={16} />}
                    </ActionIcon>
                  </Flex>

                  {selectedProvider === ModelProviderEnum.Venice && <VeniceBalance />}
                  {selectedProvider === ModelProviderEnum.OpenAISubscription && <><ChatGPTAllowance compact /><Text size="xs" c="dimmed">{ft('ChatGPT Images lets the subscription backend choose the image model. Add a custom image model and select its endpoint to request a specific model ID.')}</Text></>}
                  <Button size="xs" variant="subtle" onClick={()=>setImageSettingsOpen(true)}>{ft('Image settings')}</Button>
                  <AdaptiveModal opened={imageSettingsOpen} onClose={()=>setImageSettingsOpen(false)} title={ft('Image settings')} size="lg"><Stack>{selectedProvider===ModelProviderEnum.Venice&&<VeniceImageSettings/>}

                  {/* Toolbar Row */}
                  <Checkbox label={ft('Save new creations as protected')} checked={saveProtected} onChange={event=>setSaveProtected(event.currentTarget.checked)}/>
                  {saveProtected&&!vault.keys.isUnlocked('app')&&<ScopeUnlock keys={vault.keys}/>}
                  <Group justify="space-between" align="end" wrap="wrap"><NumberInput label={ft('Images per request')} description={ft("Each image may incur a cost")} min={1} max={4} value={batchCount} onChange={value => setBatchCount(Math.min(4, Math.max(1, Number(value) || 1)))} w={170} />
                  {selectedProvider === 'venice' && <><VeniceModelBadges metadata={selectedOption?.vendorMetadata} /><VeniceModelInfo model={selectedOption ? { id: selectedModel, type: String(selectedOption.vendorMetadata?.veniceType || 'image'), model_spec: selectedOption.vendorMetadata } : undefined} /></>}</Group>
                  </Stack></AdaptiveModal>
                  {selectedProvider==='venice'&&selectedOption&&<VeniceModelCost metadata={selectedOption.vendorMetadata} showLabel/>}
                  {(onlyVenice||selectedProvider==='venice')&&venicePrivacyFilter!=='all'&&<Text size="xs" c="dimmed">{ft('Some models are hidden by your Venice Privacy Only filter.')}</Text>}
                  <InputToolbar
                    isSmallScreen={isSmallScreen}
                    modelGroups={imageModelGroups}
                    modelDisplayName={modelDisplayName}
                    selectedRatio={selectedRatio}
                    ratioOptions={ratioOptions}
                    onModelDrawerOpen={() => setShowModelDrawer(true)}
                    onRatioDrawerOpen={() => setShowRatioDrawer(true)}
                    onRatioSelect={setSelectedRatio}
                    onModelSelect={handleModelSelect}
                    onAddReference={uploadSource}
                    onNewCreation={handleNewCreation}
                  />
                </Stack>
              </Box>

              <Text className="disclaimer-safe-area" size="xs" c="dimmed" ta="center">
                {t('AI-generated images may not be accurate. Review output carefully.')}
              </Text>
            </Stack>
          </Box>
        </Flex>

        {/* Desktop History Panel */}
        {!isSmallScreen && (
          <HistoryPanel
            show={showHistory}
            width={HISTORY_PANEL_WIDTH}
            historyCache={historyCache}
            historyLoading={historyLoading}
            currentRecordId={currentRecord?.id ?? null}
            getModelDisplayName={(record) => getHistoryImageModelDisplayName(record.model)}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onItemClick={handleHistoryClick}
            onLoadMore={handleLoadMoreHistory}
            onNewCreation={handleNewCreation}
            onClose={() => setShowHistory(false)}
            onDelete={handleDelete}
          />
        )}

        {/* Mobile Drawers */}
        {isSmallScreen && (
          <>
            <MobileHistoryDrawer
              open={showMobileHistory}
              onOpenChange={setShowMobileHistory}
              historyCache={historyCache}
              historyLoading={historyLoading}
              currentRecordId={currentRecord?.id ?? null}
              getModelDisplayName={(record) => getHistoryImageModelDisplayName(record.model)}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onItemClick={handleHistoryClick}
              onLoadMore={handleLoadMoreHistory}
              onNewCreation={handleNewCreation}
              onDelete={handleDelete}
            />

            <MobileModelDrawer
              open={showModelDrawer}
              onOpenChange={setShowModelDrawer}
              modelGroups={imageModelGroups}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              onSelect={handleModelSelect}
            />

            <MobileRatioDrawer
              open={showRatioDrawer}
              onOpenChange={setShowRatioDrawer}
              options={ratioOptions}
              selectedRatio={selectedRatio}
              onSelect={setSelectedRatio}
            />
          </>
        )}
      </Flex>
    </Frame>
  )
}
