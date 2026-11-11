import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Use the existing Capacitor image-tool dependency, or an explicitly supplied
// preinstalled runtime. Regenerating icons never installs another toolchain.
const sharp = process.env.FORK_SHARP_MODULE
  ? require(process.env.FORK_SHARP_MODULE)
  : createRequire(require.resolve('@capacitor/assets/package.json'))('sharp')
const svg = await readFile(new URL('../assets/fork-icon.svg', import.meta.url))
await sharp(svg).resize(1024, 1024).png().toFile(new URL('../assets/fork-icon.png', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'))
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()))
const directory = Buffer.alloc(6 + sizes.length * 16)
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4)
let offset = directory.length
for (let i = 0; i < images.length; i++) {
  const entry = 6 + i * 16
  directory[entry] = directory[entry + 1] = sizes[i] === 256 ? 0 : sizes[i]
  directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(images[i].length, entry + 8); directory.writeUInt32LE(offset, entry + 12)
  offset += images[i].length
}
await writeFile(new URL('../assets/fork-icon.ico', import.meta.url), Buffer.concat([directory, ...images]))
console.log('Generated fork PNG and multi-resolution Windows ICO')
