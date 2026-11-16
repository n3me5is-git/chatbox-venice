import { Menu, type MenuProps } from '@mantine/core'
import { useState } from 'react'
import { useOverlayManager } from '@/components/layout/Overlay'

/** Contextual actions participate in the same Back stack as their parent panel.
 * Retaining the dropdown also keeps file-picker change handlers alive after opening it. */
export function FeatureMenu(props: Omit<MenuProps, 'opened' | 'onChange' | 'defaultOpened'>) {
  const [opened, setOpened] = useState(false)
  useOverlayManager(opened, () => setOpened(false))
  return <Menu withinPortal={false} keepMounted {...props} opened={opened} onChange={setOpened}/>
}
FeatureMenu.Target = Menu.Target
FeatureMenu.Dropdown = Menu.Dropdown
FeatureMenu.Item = Menu.Item
FeatureMenu.Divider = Menu.Divider
