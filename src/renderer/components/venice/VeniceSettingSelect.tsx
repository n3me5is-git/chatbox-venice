import { Select,type SelectProps } from '@mantine/core'
import { useState } from 'react'
import { useOverlayManager } from '@/components/layout/Overlay'
/** Keep settings dropdowns inside their panel focus scope and native Back stack. */
export function VeniceSettingSelect(props:SelectProps){
  const [opened,setOpened]=useState(false)
  useOverlayManager(opened,()=>setOpened(false))
  return <Select {...props} comboboxProps={{...props.comboboxProps,withinPortal:false}} dropdownOpened={opened} onDropdownOpen={()=>{setOpened(true);props.onDropdownOpen?.()}} onDropdownClose={()=>{setOpened(false);props.onDropdownClose?.()}}/>
}
