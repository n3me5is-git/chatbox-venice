import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
export function ProjectProtectionMode({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 useTranslation()
 return <Select comboboxProps={{withinPortal:false}} label={ft('Project protection')} value={value} allowDeselect={false} onChange={value=>value&&onChange(value)} disabled={disabled} data={[{value:'none',label:ft('No project lock')},{value:'app',label:ft('Use app unlock')},{value:'pin',label:ft('Use a dedicated project PIN')}]}/>
}
