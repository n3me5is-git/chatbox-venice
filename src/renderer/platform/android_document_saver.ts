import { registerPlugin } from '@capacitor/core'

export interface SaveFileOptions {
  sourceUri: string
  suggestedName: string
  mimeType?: string
}

export interface SaveFileResult {
  uri: string
}

export interface AndroidDocumentSaverPlugin {
  printHtml(options:{html:string;name:string}):Promise<void>
  saveFile(options: SaveFileOptions): Promise<SaveFileResult>
}

export const AndroidDocumentSaver = registerPlugin<AndroidDocumentSaverPlugin>('DocumentSaver')
