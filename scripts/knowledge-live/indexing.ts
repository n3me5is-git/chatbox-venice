/** Production exports for bounded opt-in diagnostics; no credentials or network calls at build time. */
export {AugmentedCollectionIndex} from '../../src/renderer/packages/knowledge-collections/augmented'
export {RagSettingsSchema} from '../../src/shared/session-rag'
export {KnowledgeAugmentationSchema} from '../../src/shared/knowledge-augmentation'
export {knowledgeExtractionInstruction} from '../../src/shared/knowledge-augmentation-engine'
export {knowledgeRequestDeadline} from '../../src/shared/knowledge-request-deadline'
export {knowledgeModelOptions} from '../../src/shared/knowledge-model-options'
export {resolveReasoningProviderOptions} from '../../src/shared/utils/reasoning-control'
export {parseKnowledgeJson} from '../../src/shared/knowledge-json'
