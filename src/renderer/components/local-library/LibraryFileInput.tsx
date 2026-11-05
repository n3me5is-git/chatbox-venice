import { Button, FileInput, type FileInputProps, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
export function LibraryFileInput<Multiple extends boolean=false>(props:FileInputProps<Multiple>) {
  useTranslation();const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  return <Stack gap={4}><FileInput<Multiple> {...props}/><Button size="xs" variant="subtle" disabled={props.disabled} loading={busy} onClick={async()=>{
    setBusy(true);setError('');try{const {pickLocalMedia}=await import('./LocalMediaPicker');const files=await pickLocalMedia({accept:props.accept,multiple:props.multiple});if(files.length){const value=props.multiple?[...(Array.isArray(props.value)?props.value:[]),...files]:files[0];props.onChange?.(value as Multiple extends true?File[]:File|null)}}catch{setError(ft('Unable to read the local library'))}finally{setBusy(false)}
  }}>{ft('Choose from local library')}</Button>{error&&<Text size="xs" c="red">{error}</Text>}</Stack>
}
