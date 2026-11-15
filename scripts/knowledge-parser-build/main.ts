import { zipSync, strToU8 } from 'fflate'
import { parseRagDocument } from '../../src/renderer/packages/session-rag/document-parser'

/** Actual browser workers and dynamically loaded parsers, without mocks or APIs. */
async function run() {
  const archive = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))
  const fixtures = [
    { name: 'source.docx', bytes: archive({ 'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Enterprise source alpha</w:t></w:r></w:p></w:body></w:document>' }), expected: 'Enterprise source alpha' },
    { name: 'source.pptx', bytes: archive({
      'ppt/presentation.xml': '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
      'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
      'ppt/slides/slide1.xml': '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Quarterly source beta</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    }), expected: 'Quarterly source beta' },
    { name: 'source.xlsx', bytes: archive({
      '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Budget source gamma</t></is></c></row></sheetData></worksheet>',
    }), expected: 'Budget source gamma' },
    { name: 'source.rtf', bytes: strToU8('{\\rtf1\\ansi Clean source delta}'), expected: 'Clean source delta' },
  ]
  const results = []
  for (const fixture of fixtures) {
    const original = Uint8Array.from(fixture.bytes)
    const parsed = await parseRagDocument(fixture.name, fixture.bytes, new AbortController().signal)
    if (!parsed.text.includes(fixture.expected) || parsed.truncated) throw Error('Unexpected parsed output: ' + fixture.name)
    if (original.length !== fixture.bytes.length || original.some((byte, index) => byte !== fixture.bytes[index])) throw Error('Source bytes changed: ' + fixture.name)
    results.push({ name: fixture.name, text: parsed.text, sourcePreserved: true })
  }
  let guarded = false
  try {
    await parseRagDocument('expanded.docx', zipSync({ 'unused.bin': new Uint8Array(17 * 1024 * 1024) }), new AbortController().signal)
  } catch (error) {
    guarded = String(error).includes('Expanded document exceeds memory limits')
  }
  if (!guarded) throw Error('Production Office archive expansion guard did not run')
  return { results, expansionGuard: guarded }
}
Object.assign(window, { runKnowledgeParserBuildSmoke: run })
