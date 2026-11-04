export default { exporter: {
  exportTextFile: async (name: string, text: string) => { (window as any).__simulationExport = { name, size: text.length } },
  exportBlob: async (name: string, blob: Blob) => { (window as any).__simulationExport = { name, size: blob.size } },
} }
