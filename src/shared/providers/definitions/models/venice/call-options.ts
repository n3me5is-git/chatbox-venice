export function assertImageToolOptions(options?: Record<string, unknown>) {
  if(options&&['model','modelId','prompt','input','images','style_references','variants','return_binary'].some(key=>key in options))throw Error('Use the dedicated controls for model, prompt, image references and quantity.')
}
export function assertMediaToolOptions(kind: string, options?: Record<string, unknown>) {
  if(options && (['model','input','sessionId','session_id','api_key'].some(key=>key in options)||kind!=='speech'&&'prompt'in options))throw Error('Use the dedicated model and prompt controls instead of overriding them in JSON.')
}
