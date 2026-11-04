import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.n3me5is.chatboxvenice',
  appName: 'Chatbox Venice',
  webDir: 'release/app/dist/renderer',
  android: { path: 'android' },
  plugins: {
    SplashScreen: { launchAutoHide: true },
    CapacitorHttp: { enabled: false },
  },
}
export default config
