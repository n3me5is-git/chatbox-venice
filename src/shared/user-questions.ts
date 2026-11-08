import { z } from 'zod'
import type { ToolSet } from 'ai'
export const UserQuestionsSchema=z.object({questions:z.array(z.object({question:z.string().trim().min(1).max(1200),options:z.array(z.string().trim().min(1).max(240)).min(2).max(8).optional(),multiple:z.boolean().optional()}).strict()).min(1).max(3)}).strict()
export type UserQuestions=z.infer<typeof UserQuestionsSchema>
export type UserAnswers={answers:{selected:string[];text:string}[]}
export function createAskUserTool(ask:(input:UserQuestions,signal?:AbortSignal)=>Promise<UserAnswers|null>):ToolSet[string]{
  return {
    description:'Ask the user for missing information, preferences or decisions before continuing. Supports up to three questions, optional answer choices (single or multiple selection), and a free-text answer for every question. Wait for the user response. Never use this to approve paid generations or bypass a dedicated approval dialog. Cancellation means stop the dependent action; do not ask the same question again automatically.',
    inputSchema:UserQuestionsSchema,
    execute:async(raw,context)=>{
      context.abortSignal?.throwIfAborted();const input=UserQuestionsSchema.parse(raw),reply=await ask(input,context.abortSignal)
      context.abortSignal?.throwIfAborted()
      if(!reply)return {cancelled:true,message:'The user cancelled. Do not repeat this question or perform the dependent action without a new user request.'}
      if(reply.answers.length!==input.questions.length)throw Error('Incomplete user answers')
      const answers=reply.answers.map((answer,index)=>{
        const question=input.questions[index],selected=[...new Set(answer.selected)],text=answer.text.trim()
        if(text.length>10000||!selected.length&&!text||!question.multiple&&selected.length>1||selected.some(value=>!question.options?.includes(value)))throw Error('Invalid user answer')
        return {question:question.question,selected,text}
      })
      return {cancelled:false,answers}
    },
  }
}
