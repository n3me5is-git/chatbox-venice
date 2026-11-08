import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { Settings } from '@shared/types'
import { SettingRow, SettingSwitchRow } from './SettingsLayout'
import { forkT as ft } from '@/i18n/fork'

type SearchSettings = Settings['extension']['webSearch']
export function VeniceWebSearchSettings({ value, onChange }: { value: SearchSettings; onChange: (patch: Partial<SearchSettings>) => void }) {
  useTranslation()
  const separate = value.veniceSearchToolMode === 'separate'
  return <>
    <SettingSwitchRow id="venice-global-search-tools" label={ft('Expose separate search engines')}
      description={ft('Give the model separate Brave, Google and Exa search tools through Venice. This applies to Chatbox web search independently of Venice model search.')}
      checked={separate} onChange={enabled => onChange({ veniceSearchToolMode: enabled ? 'separate' : 'selected' })}/>
    <SettingRow id="venice-search" label={ft('Search engine through Venice')}
      description={ft(separate ? 'Brave, Google and Exa are available as separate tools. The selected engine remains the default for search checks and clients using a single search action.' : 'Uses your Venice provider key. Searches go through Venice and may incur a cost.')}
      control={fieldId => <Select id={fieldId} aria-label={ft('Search engine through Venice')} allowDeselect={false}
        comboboxProps={{ withinPortal: false }} value={value.veniceSearchProvider || 'brave'}
        data={[{ value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'exa', label: 'Exa' }]}
        onChange={engine => engine && onChange({ veniceSearchProvider: engine as 'brave' | 'google' | 'exa' })}/>}/>
  </>
}
