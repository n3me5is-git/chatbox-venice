import { ActionIcon, Button, type FileInputProps, Group, Input, Stack, Text } from '@mantine/core'
import { IconUpload,IconX } from '@tabler/icons-react'
import { useId,useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { chooseUploadSource } from './UploadSource'
export function LibraryFileInput<Multiple extends boolean=false>(props:FileInputProps<Multiple>) {
 useTranslation();const ref=useRef<HTMLInputElement>(null),generatedId=useId(),id=props.id||generatedId
 const value=props.value,files=Array.isArray(value)?value:value?[value]:[]
 const update=(selected:File[])=>props.onChange?.((props.multiple?[...files,...selected]:selected[0]||null) as Multiple extends true?File[]:File|null)
 return <Input.Wrapper id={id} label={props.label} description={props.description} error={props.error} required={props.required}><Stack gap={4} mt={4}><input ref={ref} id={id} type="file" accept={props.accept} multiple={props.multiple} disabled={props.disabled} style={{display:'none'}} onChange={event=>{update(Array.from(event.currentTarget.files||[]));event.currentTarget.value=''}}/><Group wrap="nowrap"><Button leftSection={<IconUpload size={16}/>} variant="default" disabled={props.disabled} onClick={()=>chooseUploadSource({device:()=>ref.current?.click(),accept:props.accept,multiple:props.multiple,onLocal:update})}>{ft('Upload')}</Button><Text size="sm" truncate style={{flex:1}}>{files.length?files.map(file=>file.name).join(', '):props.placeholder||ft('Choose content')}</Text>{props.clearable&&files.length>0&&<ActionIcon variant="subtle" aria-label={ft('Clear selection')} onClick={()=>props.onChange?.((props.multiple?[]:null) as Multiple extends true?File[]:File|null)}><IconX size={16}/></ActionIcon>}</Group></Stack></Input.Wrapper>
}
