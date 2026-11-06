import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { useState } from 'react'
import { useOverlayManager } from '@/components/layout/Overlay'
export function ProjectProtectionMode({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 useTranslation()
 const [opened,setOpened]=useState(false);useOverlayManager(opened,()=>setOpened(false))
 return <Select comboboxProps={{withinPortal:false}} dropdownOpened={opened} onDropdownOpen={()=>setOpened(true)} onDropdownClose={()=>setOpened(false)} label={ft('Project protection')} value={value} allowDeselect={false} onChange={value=>value&&onChange(value)} disabled={disabled} data={[{value:'none',label:ft('No project lock')},{value:'app',label:ft('Use app unlock')},{value:'pin',label:ft('Use a dedicated project PIN')}]}/>
}
