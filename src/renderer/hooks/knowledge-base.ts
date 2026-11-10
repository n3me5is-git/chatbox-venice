import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import platform from '@/platform'
import {useSyncExternalStore} from 'react'
import {installedVaultFor} from '@/packages/vault/runtime'

const useKnowledgeBases = (enabled = true) => {
  const keys=installedVaultFor(platform)?.keys
  const revision=useSyncExternalStore(keys?.subscribe||(()=>()=>{}),keys?.snapshot||(()=>0),()=>0)
  const fetchKnowledgeBases = async () => {
    const knowledgeBaseController = platform.getKnowledgeBaseController()
    return knowledgeBaseController.list()
  }
  return useQuery({
    queryKey: ['knowledge-bases', revision],
    queryFn: fetchKnowledgeBases,
    enabled,
  })
}

const useKnowledgeBaseFilesCount = (kbId: number | null) => {
  const fetchFilesCount = async () => {
    if (!kbId) return 0
    const knowledgeBaseController = platform.getKnowledgeBaseController()
    return knowledgeBaseController.countFiles(kbId)
  }

  return useQuery({
    queryKey: ['knowledge-base-files-count', kbId],
    queryFn: fetchFilesCount,
    enabled: !!kbId,
  })
}

const useKnowledgeBaseFiles = (kbId: number | null, pageSize = 20) => {
  const fetchFiles = async ({ pageParam = 0 }) => {
    if (!kbId) return { files: [], nextCursor: null }

    const knowledgeBaseController = platform.getKnowledgeBaseController()
    const files = await knowledgeBaseController.listFilesPaginated(kbId, pageParam * pageSize, pageSize)

    return {
      files,
      nextCursor: files.length === pageSize ? pageParam + 1 : null,
    }
  }

  return useInfiniteQuery({
    queryKey: ['knowledge-base-files', kbId, pageSize],
    queryFn: fetchFiles,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!kbId,
    initialPageParam: 0,
  })
}

// Hook to invalidate cache when files are modified
const useKnowledgeBaseFilesActions = () => {
  const queryClient = useQueryClient()

  const invalidateFiles = (kbId: number) => {
    queryClient.invalidateQueries({ queryKey: ['knowledge-base-files', kbId] })
    queryClient.invalidateQueries({ queryKey: ['knowledge-base-files-count', kbId] })
  }

  return { invalidateFiles }
}

export { useKnowledgeBases, useKnowledgeBaseFilesCount, useKnowledgeBaseFiles, useKnowledgeBaseFilesActions }
