const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { build, Platform, Arch } = require('electron-builder')
const { DebugLogger } = require('builder-util')
const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config')
const root = path.resolve(__dirname, '..')
const appDir = path.join(root, 'release', 'fork-app')
const sourceApp = path.join(root, 'release', 'app')
const isWindows = process.platform === 'win32'

async function main() {
  fs.mkdirSync(appDir, { recursive: true })
  const app = JSON.parse(fs.readFileSync(path.join(sourceApp, 'package.json'), 'utf8'))
  app.name = 'chatbox-venice'
  app.productName = 'Chatbox Venice'
  app.packageManager = 'npm@' + execFileSync(isWindows ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', shell: isWindows }).trim()
  delete app.scripts
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(app, null, 2))
  const lock = JSON.parse(fs.readFileSync(path.join(sourceApp, 'package-lock.json'), 'utf8'))
  lock.name = app.name
  lock.version = app.version
  lock.packages[''].name = app.name
  lock.packages[''].version = app.version
  fs.writeFileSync(path.join(appDir, 'package-lock.json'), JSON.stringify(lock, null, 2))
  fs.writeFileSync(path.join(appDir, '.npmrc'), 'registry=https://registry.npmjs.org/\n')

  // Standalone configuration: merging with upstream retains its S3 publisher
  // and private signing hooks. Only the required public packaging hooks are used.
  const config = {
    extends: null,
    productName: 'Chatbox Venice',
    appId: 'io.github.n3me5is.chatboxvenice',
    electronVersion: require('electron/package.json').version,
    electronLanguages: ['en-US', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru', 'de', 'fr', 'pt-PT', 'es', 'ar', 'it', 'sv', 'nb', 'tr'],
    asar: true,
    asarUnpack: ['**/*.{node,dll}', '**/node_modules/libsql/**', 'dist/native/windows/**'],
    files: ['dist', 'node_modules', '!node_modules/@types', '!node_modules/undici-types', 'package.json'],
    directories: { buildResources: path.join(root, 'assets'), output: path.join(root, 'release', 'build') },
    extraResources: [{ from: path.join(root, 'assets'), to: 'assets' }],
    beforePack: async () => {
      execFileSync(isWindows ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts'], { cwd: appDir, stdio: 'inherit', shell: isWindows })
      require('../.erb/scripts/runtime-deps.cjs').verifyInstalledRuntimeDeps(appDir)
    },
    afterPack: async (context) => require('../.erb/scripts/after-pack.cjs').default({ ...context, appDir }),
    npmRebuild: false,
    publish: [{ provider: 'github', owner: 'n3me5is-git', repo: 'chatbox-venice' }],
    win: { icon: path.join(root, 'assets', 'fork-icon.ico'), target: [{ target: 'nsis', arch: ['x64'] }], artifactName: 'Chatbox-Venice-${version}-${arch}-Setup.${ext}', signAndEditExecutable: true, verifyUpdateCodeSignature: false },
    nsis: { oneClick: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, shortcutName: 'Chatbox Venice', installerIcon: path.join(root, 'assets', 'fork-icon.ico'), uninstallerIcon: path.join(root, 'assets', 'fork-icon.ico'), include: path.join(root, 'assets', 'installer.nsh') },
  }
  if (process.argv.includes('--check-config')) {
    const effective = await getConfig(appDir, null, config)
    await validateConfiguration(effective, new DebugLogger(false))
    console.log('Fork Windows packaging configuration is valid')
    return
  }
  fs.cpSync(path.join(sourceApp, 'dist'), path.join(appDir, 'dist'), { recursive: true })
  if (!fs.existsSync(path.join(appDir,'dist','native','windows','vault-consent.exe'))) throw new Error('Compile the Windows Hello desktop helper before packaging')
  await build({ projectDir: appDir, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never', config })
  for (const name of [`Chatbox-Venice-${app.version}-x64-Setup.exe`, 'latest.yml']) {
    const output = path.join(root, 'release', 'build', name)
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) throw new Error(`Packaging did not produce ${output}; inspect the packaging hook errors above`)
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
