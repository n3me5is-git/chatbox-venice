import { MAX_PARSED_DOCUMENT_TEXT, type ParsedLocalDocument } from '../document-parser'
import {KNOWLEDGE_BASE_MAX_FILE_SIZE} from '../../knowledge-base'

/** Extract content only; scripts and document generation are not initialized. */
export async function parseLocalDocument(name: string, bytes: Uint8Array,maximumBytes=10*1024*1024): Promise<ParsedLocalDocument> {
  if(![10*1024*1024,KNOWLEDGE_BASE_MAX_FILE_SIZE].includes(maximumBytes))throw Error('Invalid document parsing limit')
  if (bytes.length > maximumBytes) throw new Error(maximumBytes===KNOWLEDGE_BASE_MAX_FILE_SIZE?'Knowledge documents must not exceed 50 MB':'Document exceeds the 10 MB local parsing limit')
  if(/\.(rtf|html?|xhtml)$/i.test(name)&&bytes.length>10*1024*1024)throw Error('This document format exceeds its 10 MB parsing limit')
  let text: string
  if (/\.docx$/i.test(name)) {
    const { readWordText } = await import('./office-text')
    text = readWordText(bytes, true).text
  } else if (/\.pptx$/i.test(name)) {
    const { readPresentationText } = await import('./office-text')
    text = readPresentationText(bytes, true)
      .slides.map((slide) => `Slide ${slide.slide}\n${slide.text}`)
      .join('\n\n')
  } else if (/\.xlsx$/i.test(name)) {
    const { readSpreadsheet } = await import('./spreadsheet-reader')
    const workbook = await readSpreadsheet(bytes)
    text = workbook.sheets
      .map((sheet) => `Sheet: ${sheet.name}\n${sheet.rows.map((row) => JSON.stringify(row)).join('\n')}`)
      .join('\n\n')
  } else if(/\.(epub|odt|ods|odp|rtf|html?|xhtml)$/i.test(name)) {
    const { extendedDocument } = await import('./extended-documents')
    text = extendedDocument(name, bytes)
  } else throw new Error('Unsupported local document format')
  const truncated = text.length > MAX_PARSED_DOCUMENT_TEXT
  return { text: text.slice(0, MAX_PARSED_DOCUMENT_TEXT), truncated }
}
