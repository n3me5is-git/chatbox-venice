import { app, ipcMain, safeStorage, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
function helloScript(verify:boolean){
  const result=verify?'UserConsentVerificationResult':'UserConsentVerifierAvailability'
  const action=verify?"RequestVerificationAsync('Unlock protected Chatbox Venice content')":'CheckAvailabilityAsync()'
  return `Add-Type -AssemblyName System.Runtime.WindowsRuntime; $null=[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]; $kind=[Windows.Security.Credentials.UI.${result},Windows.Security.Credentials.UI,ContentType=WindowsRuntime]; $operation=[Windows.Security.Credentials.UI.UserConsentVerifier]::${action}; $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'} | Select-Object -First 1; $task=$method.MakeGenericMethod($kind).Invoke($null,@($operation)); $task.Wait(); [Console]::Write([int]$task.Result)`
}
export async function windowsHello(verify=false):Promise<boolean>{
  if(process.platform!=='win32')return false
  return new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',helloScript(verify)],{windowsHide:true,timeout:60000,maxBuffer:4096},(error,stdout)=>resolve(!error&&stdout.trim()==='0')))
}
export function registerVaultKeyIpc(window:()=>BrowserWindow|null){
  const trusted=(event:IpcMainInvokeEvent)=>{
    const current=window();if(!current||event.sender!==current.webContents||event.senderFrame!==current.webContents.mainFrame)throw new Error('Protected keys are available only to the app window')
    const url=new URL(event.senderFrame.url)
    if(url.protocol==='file:'){
      const actual=path.resolve(fileURLToPath(url)).toLowerCase();const expected=path.resolve(__dirname,'../renderer/index.html').toLowerCase();if(actual!==expected)throw new Error('Untrusted app document')
    }else if(app.isPackaged||!process.env.ELECTRON_RENDERER_URL||url.origin!==new URL(process.env.ELECTRON_RENDERER_URL).origin)throw new Error('Untrusted app origin')
  }
  const available=()=>safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text')
  ipcMain.handle('vault:key-capabilities',async event=>{trusted(event);return {encryption:available(),biometric:available()&&await windowsHello(),name:process.platform==='win32'?'Windows Hello':'Device key store'}})
  ipcMain.handle('vault:wrap-key',async(event,value:unknown,biometric:unknown)=>{
    trusted(event);if(!available())throw new Error('Device encryption is unavailable')
    if(typeof value!=='string'||value.length<1||value.length>16384||typeof biometric!=='boolean')throw new Error('Invalid protected-key request')
    if(biometric&&!await windowsHello(true))throw new Error('Device authentication was canceled or unavailable')
    return safeStorage.encryptString(JSON.stringify({version:1,biometric,value})).toString('base64')
  })
  ipcMain.handle('vault:unwrap-key',async(event,value:unknown)=>{
    trusted(event);if(!available())throw new Error('Device encryption is unavailable')
    if(typeof value!=='string'||value.length<1||value.length>32768||!/^[A-Za-z0-9+/=]+$/.test(value))throw new Error('Invalid protected key')
    let decoded:{version?:number;biometric?:boolean;value?:unknown}
    try{decoded=JSON.parse(safeStorage.decryptString(Buffer.from(value,'base64')))}catch{throw new Error('The device could not unlock this key. Restore an encrypted backup.')}
    if(decoded.version!==1||typeof decoded.value!=='string'||typeof decoded.biometric!=='boolean')throw new Error('Invalid device-key envelope')
    // The authentication requirement is inside the authenticated OS envelope, not a caller flag.
    if(decoded.biometric&&!await windowsHello(true))throw new Error('Device authentication was canceled or unavailable')
    return decoded.value
  })
}
