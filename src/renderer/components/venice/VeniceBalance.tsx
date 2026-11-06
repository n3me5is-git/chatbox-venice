import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { ActionIcon, Group, Text } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createModelDependencies } from '@/adapters'
import { useProviderSettings } from '@/stores/settingsStore'
import { mediaOrigin } from '@shared/providers/definitions/models/venice/media'
import { veniceCredentialRevision } from '@/packages/venice/models'
import { parseVeniceBalance } from '@shared/providers/definitions/models/venice/balance'
export function VeniceBalance() {
  const {i18n}=useTranslation()
  const { providerSettings: config } = useProviderSettings('venice')
  const query = useQuery({ queryKey: ['venice-balance', config?.apiHost, veniceCredentialRevision(config?.apiHost, config?.apiKey)], enabled: !!config?.apiKey && config?.venice?.enabled !== false, staleTime: 60000, retry: false,
    refetchOnWindowFocus: true, refetchInterval: 120000,
    queryFn: async () => { const response = await (await createModelDependencies()).request.apiRequest({ url: mediaOrigin(config?.apiHost) + '/api_keys/rate_limits', method: 'GET', headers: { Authorization: `Bearer ${config!.apiKey}` }, retry: 0, useProxy: false }); if (!response.ok) throw new Error(ft("Balance unavailable for this key") + ` (HTTP ${response.status})`); return parseVeniceBalance(await response.json()) } })
  if (!config?.apiKey || config.venice?.enabled === false) return null
  const number = (v: number) => v.toLocaleString(i18n.resolvedLanguage || i18n.language || 'en', { maximumFractionDigits: 3 })
  return <Group gap="xs" wrap="wrap" aria-label={ft("Venice balance")}><Text size="xs" c="dimmed" title={query.error instanceof Error ? query.error.message : undefined}>{query.data ? `Venice · ${Object.entries(query.data).map(([currency,value])=>`${currency==='USD'?'$':''}${number(value)} ${currency}`).join(' · ')}` : query.isError ? ft("Venice · balance unavailable") : ft("Venice · loading balance…")}</Text><ActionIcon variant="subtle" size="sm" aria-label={ft("Refresh Venice balance")} loading={query.isFetching} onClick={() => void query.refetch()}><IconRefresh size={14} /></ActionIcon></Group>
}
