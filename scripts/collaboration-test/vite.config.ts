import path from 'node:path'
import {defineConfig} from 'vite'
export default defineConfig({root:process.cwd(),define:{'process.env':JSON.stringify({NODE_ENV:'development',CHATBOX_BUILD_PLATFORM:'web'})},resolve:{alias:[
 {find:/^@\/packages\/collaboration\/runtime$/,replacement:path.resolve('scripts/collaboration-test/runtime.ts')},
 {find:/^@\/platform$/,replacement:path.resolve('scripts/ui-simulation/platform.ts')},
 {find:'@shared',replacement:path.resolve('src/shared')},{find:'@',replacement:path.resolve('src/renderer')},
]},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:4175,strictPort:true}})
