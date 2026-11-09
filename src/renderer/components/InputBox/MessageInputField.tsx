import { Textarea } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import type React from 'react'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState,useId } from 'react'
import { promptMentionQuery,insertPromptMention,type PromptMention } from '@shared/prompt-mentions'
import { PromptMentionMenu,type PromptMentionSource } from './PromptMentionMenu'
import { forkT as ft } from '@/i18n/fork'
import { useMessageInput } from '@/hooks/useMessageInput'
import * as dom from '../../hooks/dom'

function isNativeComposing(nativeEvent: Event): boolean {
  return 'isComposing' in nativeEvent && nativeEvent.isComposing === true
}

export type MessageInputFieldRef = {
  getValue: () => string
  setValue: (val: string | ((prev: string) => string)) => void
  clearDraft: () => void
  getElement: () => HTMLTextAreaElement | null
}

type MessageInputFieldProps = {
  isNewSession: boolean
  viewportHeight: number
  isReadOnly: boolean
  placeholder: string
  ariaLabel: string
  autoFocus: boolean
  /** Called on every committed value change (including programmatic setValue). */
  onValueChange: (value: string) => void
  /** Called only on real user typing (onChange), not programmatic setValue. */
  onUserInput?: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
  mentionSource?:PromptMentionSource
}

export const MessageInputField = memo(
  forwardRef<MessageInputFieldRef, MessageInputFieldProps>(
    (
      {
        isNewSession,
        viewportHeight,
        isReadOnly,
        placeholder,
        ariaLabel,
        autoFocus,
        onValueChange,
        onUserInput,
        onKeyDown,
        onPaste,
        mentionSource,
      },
      ref
    ) => {
      const { messageInput, setMessageInput, clearDraft } = useMessageInput('', { isNewSession })
      const inputRef = useRef<HTMLTextAreaElement | null>(null)
      const messageInputRef = useRef(messageInput)
      messageInputRef.current = messageInput
      const [editValue, setEditValue] = useState(messageInput)
      const editValueRef = useRef(editValue)
      editValueRef.current = editValue
      const isComposingRef = useRef(false)
      const compositionRangeRef = useRef<{ start: number; end: number } | null>(null)
      const skipCompositionEndCommitRef = useRef(false)
      const mentionId=useId(),[mention,setMention]=useState<ReturnType<typeof promptMentionQuery>>(null),[mentionItems,setMentionItems]=useState<PromptMention[]>([]),[mentionSelected,setMentionSelected]=useState(0),[mentionLoading,setMentionLoading]=useState(false),[mentionError,setMentionError]=useState('')
      const updateMention=(element:HTMLTextAreaElement)=>{if(mentionSource&&!isReadOnly&&!isComposingRef.current)setMention(promptMentionQuery(element.value,element.selectionStart))}
      useEffect(()=>{
        setMentionItems([]);setMentionSelected(0);setMentionError('');setMentionLoading(false)
        if(!mention||!mentionSource||isReadOnly)return
        const controller=new AbortController();setMentionLoading(true)
        const timer=setTimeout(()=>void mentionSource(mention.query,controller.signal).then(items=>{if(!controller.signal.aborted)setMentionItems(items)},()=>{if(!controller.signal.aborted)setMentionError(ft('Unable to load references'))}).finally(()=>{if(!controller.signal.aborted)setMentionLoading(false)}),150)
        return()=>{clearTimeout(timer);controller.abort()}
      },[mention?.query,mention?.start,mentionSource,isReadOnly])
      const pickMention=(item:PromptMention)=>{
        if(!mention)return
        const next=insertPromptMention(editValueRef.current,mention,item.insert)
        setEditValue(next.value);setMessageInput(next.value);onUserInput?.();setMention(null)
        requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(next.cursor,next.cursor)})
      }

      useEffect(() => {
        setEditValue(messageInput)
      }, [messageInput])

      useEffect(() => {
        onValueChange(messageInput)
      }, [messageInput, onValueChange])

      useImperativeHandle(
        ref,
        () => ({
          getValue: () => editValueRef.current,
          setValue: (val) => setMessageInput(val),
          clearDraft: () => clearDraft(),
          getElement: () => inputRef.current,
        }),
        [setMessageInput, clearDraft]
      )

      const commitValue = useCallback(
        (value: string) => {
          setEditValue(value)
          setMessageInput(value)
          onUserInput?.()
        },
        [setMessageInput, onUserInput]
      )

      const onChange = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          const next = event.target.value
          const composing = isNativeComposing(event.nativeEvent)
          if (composing) {
            isComposingRef.current = true
          } else {
            isComposingRef.current = false
          }
          // Keep the controlled display in sync during IME so React does not restore the pre-composition value.
          setEditValue(next)
          if (composing) {
            setMention(null)
            return
          }
          setMessageInput(next)
          onUserInput?.()
          updateMention(event.currentTarget)
        },
        [setMessageInput, onUserInput,mentionSource,isReadOnly]
      )

      const onCompositionStart = useCallback((event: React.CompositionEvent<HTMLTextAreaElement>) => {
        isComposingRef.current = true
        skipCompositionEndCommitRef.current = false
        compositionRangeRef.current = {
          start: event.currentTarget.selectionStart,
          end: event.currentTarget.selectionEnd,
        }
      }, [])

      const onCompositionEnd = useCallback(
        (event: React.CompositionEvent<HTMLTextAreaElement>) => {
          isComposingRef.current = false
          compositionRangeRef.current = null
          if (skipCompositionEndCommitRef.current) {
            skipCompositionEndCommitRef.current = false
            return
          }
          commitValue(event.currentTarget.value)
        },
        [commitValue]
      )

      const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
          // IME owns candidate navigation, confirmation and cancellation.
          if (isComposingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) {
            event.stopPropagation()
            return
          }
          if(mention){
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setMention(null);return}
            if(mentionItems.length&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();setMentionSelected(index=>(index+(event.key==='ArrowDown'?1:mentionItems.length-1))%mentionItems.length);return}
            if(mentionItems.length&&(event.key==='Enter'||event.key==='Tab')){event.preventDefault();event.stopPropagation();pickMention(mentionItems[mentionSelected]);return}
          }
          onKeyDown(event)
        },
        [onKeyDown,mention,mentionItems,mentionSelected]
      )

      const handlePaste = useCallback(
        (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
          if (isComposingRef.current) {
            isComposingRef.current = false
            skipCompositionEndCommitRef.current = true
            const pasted = event.clipboardData?.getData('text/plain') ?? ''
            if (pasted) {
              event.preventDefault()
              const committed = messageInputRef.current
              const range = compositionRangeRef.current ?? { start: committed.length, end: committed.length }
              compositionRangeRef.current = null
              const next = committed.slice(0, range.start) + pasted + committed.slice(range.end)
              const cursor = range.start + pasted.length
              event.currentTarget.value = next
              event.currentTarget.setSelectionRange(cursor, cursor)
              commitValue(next)
            } else {
              setEditValue(messageInputRef.current)
              compositionRangeRef.current = null
            }
          }
          onPaste(event)
        },
        [commitValue, onPaste]
      )

      return (
        <div style={{position:'relative',flex:1,minWidth:0}}>
        {mention&&mentionSource&&!isReadOnly&&<PromptMentionMenu id={mentionId} items={mentionItems} selected={mentionSelected} loading={mentionLoading} error={mentionError} pick={pickMention}/>}
        <Textarea
          unstyled={true}
          styles={{ input: { fontSize: 14 } }}
          classNames={{
            root: 'flex-1',
            wrapper: 'flex-1',
            input:
              'block w-full outline-none border-none px-2 py-1 resize-none bg-transparent text-chatbox-tint-primary leading-5',
          }}
          size="sm"
          id={dom.messageInputID}
          ref={inputRef}
          placeholder={placeholder}
          aria-label={ariaLabel}
          bg="transparent"
          autosize={true}
          minRows={1}
          // Grows with the draft up to 12 lines (240px), fewer on short viewports.
          maxRows={Math.min(12, Math.max(4, Math.floor(viewportHeight / 60)))}
          value={editValue}
          autoFocus={autoFocus}
          readOnly={isReadOnly}
          onChange={onChange}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onSelect={event=>updateMention(event.currentTarget)}
          onBlur={()=>setMention(null)}
          aria-autocomplete={mentionSource?'list':undefined}
          aria-controls={mention?mentionId:undefined}
          aria-activedescendant={mention&&mentionItems.length?mentionId+'-'+mentionSelected:undefined}
          data-testid={TestId.chat.messageInput}
        />
        </div>
      )
    }
  )
)
