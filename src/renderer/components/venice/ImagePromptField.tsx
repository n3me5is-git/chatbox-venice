import { Textarea,type TextareaProps } from '@mantine/core'
import { forwardRef } from 'react'
/** Paid generation is an explicit button action. Enter always edits this multiline field. */
export const ImagePromptField=forwardRef<HTMLTextAreaElement,TextareaProps>((props,ref)=><Textarea {...props} ref={ref} onKeyDown={event=>{if(event.key==='Enter')event.stopPropagation();else props.onKeyDown?.(event)}}/>)
ImagePromptField.displayName='ImagePromptField'
