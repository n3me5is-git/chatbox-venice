import { MobileExecutionService,type ExecutionJob } from '@shared/mobile-work/MobileExecutionService'
import { cachedPythonRuntime } from './python-cache'

/** Reuse the bounded queue/cancellation protocol, with a separate optional Python host. */
export const sessionPythonExecution=new MobileExecutionService({executionTimeoutMs:60_000,hostTimeoutMs:60_000})
export type PythonJob=ExecutionJob
export const loadPythonAssets=cachedPythonRuntime
