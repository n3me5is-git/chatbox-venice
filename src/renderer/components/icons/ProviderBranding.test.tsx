// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ModelProviderEnum } from '@shared/types'
import { PROVIDER_ICON_ALIASES } from '@shared/constants/provider-icons'
import ProviderIcon from './ProviderIcon'
it('renders actual marks for Venice and ChatGPT subscription rather than empty SVGs', () => {
  const venice = render(<ProviderIcon provider={ModelProviderEnum.Venice} size={28} />)
  expect(venice.getByRole('img', { name: 'Venice' }).querySelectorAll('path').length).toBeGreaterThan(0)
  const openai = render(<ProviderIcon provider={ModelProviderEnum.OpenAISubscription} />)
  expect(openai.container.querySelector('svg path')).toBeTruthy()
  expect(PROVIDER_ICON_ALIASES[ModelProviderEnum.OpenAISubscription]).toBe('openai')
})
