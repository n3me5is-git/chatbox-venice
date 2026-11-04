const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { build, Platform, Arch } = require('electron-builder')
const root = path.resolve(__dirname, '..')
const appDir = path.join(root, 'release', 'fork-app')
const sourceApp = path.join(root, 'release', 'app')
fs.mkdirSync(appDir, { recursive: true })
fs.cpSync(path.join(sourceApp, 'dist'), path.join(appDir, 'dist'), { recursive: true })
const app = JSON.parse(fs.readFileSync(path.join(sourceApp, 'package.json'), 'utf8'))
app.name = 'chatbox-venice'
app.productName = 'Chatbox Venice'
app.packageManager = 'npm@' + execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim()
delete app.scripts
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(app, null, 2))
const lock = JSON.parse(fs.readFileSync(path.join(sourceApp, 'package-lock.json'), 'utf8'))
lock.name = app.name
lock.version = app.version
lock.packages[''].name = app.name
lock.packages[''].version = app.version
fs.writeFileSync(path.join(appDir, 'package-lock.json'), JSON.stringify(lock, null, 2))
fs.writeFileSync(path.join(appDir, '.npmrc'), 'registry=https://registry.npmjs.org/\n')

build({
  projectDir: appDir,
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    extends: path.join(root, 'electron-builder.yml'),
    productName: 'Chatbox Venice',
    appId: 'io.github.n3me5is.chatboxvenice',
    electronVersion: require('electron/package.json').version,
    directories: { app: '.', buildResources: path.join(root, 'assets'), output: path.join(root, 'release', 'build') },
    extraResources: [{ from: path.join(root, 'assets'), to: 'assets' }],
    beforePack: async () => {
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts'], { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' })
      require('../.erb/scripts/runtime-deps.cjs').verifyInstalledRuntimeDeps(appDir)
    },
    afterPack: path.join(root, '.erb', 'scripts', 'after-pack.cjs'),
    afterSign: null,
    npmRebuild: false,
    publish: [{ provider: 'github', owner: 'n3me5is-git', repo: 'chatbox-venice' }],
    win: { target: [{ target: 'nsis', arch: ['x64'] }], artifactName: 'Chatbox-Venice-${version}-${arch}-Setup.${ext}', signtoolOptions: null, signAndEditExecutable: false, verifyUpdateCodeSignature: false },
    nsis: { include: path.join(root, 'assets', 'installer.nsh') },
  },
}).catch((error) => { console.error(error); process.exitCode = 1 })
