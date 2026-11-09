import { expect,it } from 'vitest'
import { veniceToolsEnabled,veniceToolsVisible } from './tool-policy'
import { SessionSettingsSchema,VeniceSettingsSchema } from '../../../../types/settings'
it('starts Venice tools off for other providers and enforces the global Venice-only restriction over a session grant',()=>{
  expect(veniceToolsEnabled('venice',undefined)).toBe(true)
  expect(veniceToolsEnabled('openai-sub-unofficial',undefined)).toBe(false)
  expect(veniceToolsEnabled('openai-sub-unofficial',true)).toBe(true)
  expect(veniceToolsEnabled('openai-sub-unofficial',true,{chatToolsVeniceOnly:true})).toBe(false)
  expect(veniceToolsVisible('openai-sub-unofficial',{chatToolsVeniceOnly:true})).toBe(false)
  expect(veniceToolsEnabled('venice',false)).toBe(false)
  expect(veniceToolsEnabled('venice',true,{chatToolsEnabled:false})).toBe(false)
  expect(SessionSettingsSchema.parse({veniceToolsEnabled:false}).veniceToolsEnabled).toBe(false)
  expect(VeniceSettingsSchema.parse({chatToolsVeniceOnly:true}).chatToolsVeniceOnly).toBe(true)
})
