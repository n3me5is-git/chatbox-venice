import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { ActionIcon, Group, Text } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createModelDependencies } from '@/adapters'
import { useProviderSettings } from '@/stores/settingsStore'
import { mediaOrigin } from '@shared/providers/definitions/models/venice/media'
import { veniceCredentialRevision } from '@/packages/venice/models'
export function VeniceBalance() {
  const {i18n}=useTranslation()
  const { providerSettings: config } = useProviderSettings('venice')
  const query = useQuery({ queryKey: ['venice-balance', config?.apiHost, veniceCredentialRevision(config?.apiHost, config?.apiKey)], enabled: !!config?.apiKey && config?.venice?.enabled !== false, staleTime: 60000, retry: false,
    queryFn: async () => { const response = await (await createModelDependencies()).request.apiRequest({ url: mediaOrigin(config?.apiHost) + '/billing/balance', method: 'GET', headers: { Authorization: `Bearer ${config!.apiKey}` }, retry: 0, useProxy: false }); if (!response.ok) throw new Error(ft("Balance unavailable for this key")); const data = await response.json(); return data as { balances?: Record<string, number>; diemEpochAllocation?: number } } })
  if (!config?.apiKey || config.venice?.enabled === false) return null
  const number = (v: number) => v.toLocaleString(i18n.resolvedLanguage || i18n.language || 'en', { maximumFractionDigits: 3 })
  return <Group gap="xs" wrap="wrap" aria-label={ft("Venice balance")}><Text size="xs" c="dimmed">{query.data?.balances ? `Venice · ${Object.entries(query.data.balances).filter(([,value]) => typeof value === 'number').map(([currency, value]) => `${number(value)} ${currency === 'diem' ? 'DIEM' : currency === 'usd' ? 'USD' : currency === 'bundledCredits' ? ft("Included credits") : currency === 'earnedCredits' ? ft("Earned credits") : currency}`).join(' · ')}` : query.isError ? ft("Venice · balance unavailable") : ft("Venice · loading balance…")}</Text><ActionIcon variant="subtle" size="xs" aria-label={ft("Refresh Venice balance")} loading={query.isFetching} onClick={() => void query.refetch()}><IconRefresh size={12} /></ActionIcon></Group>
}
