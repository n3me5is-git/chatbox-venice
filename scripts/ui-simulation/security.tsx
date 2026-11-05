import { Button,Stack,Text } from '@mantine/core'
import { VaultDatabase } from '../../src/renderer/packages/vault/database'
import { VaultKeys } from '../../src/renderer/packages/vault/keys'
import { SecuritySettings } from '../../src/renderer/components/security/SecuritySettings'
const envelopes=new Map<string,string>(),db=new VaultDatabase('chatbox-ui-security-simulation')
const keys=new VaultKeys(db,{capabilities:async()=>({encryption:true,biometric:true,name:'Simulated device unlock (no real biometric hardware)'}),protect:async value=>{const id=crypto.randomUUID();envelopes.set(id,value);return id},unprotect:async id=>{if(!envelopes.has(id))throw new Error('Simulated device key missing');return envelopes.get(id)!}})
export function SecuritySimulation(){return <Stack p="md"><Text>Local security simulation: real PIN derivation and encryption, mocked device key wrapping.</Text><SecuritySettings runtime={{keys,db}}/><Button onClick={()=>keys.lock()}>Simulate app key lock</Button></Stack>}
