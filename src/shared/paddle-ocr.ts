import type {LocalOcrConfig} from './local-ocr'
export const PADDLE_OCR_PROVIDER='local-paddle-ocr'
export const PADDLE_OCR_MODEL='ppocr-v5-latin-f32-v1'
export type PaddleOcrStatus={config:LocalOcrConfig;ready:boolean;loaded:boolean;starting:boolean;pending:number;busy:boolean;platformSupported:boolean;root:string;device?:string;error?:string;diagnostic?:string;progress?:{name:string;bytes:number;total:number}}
export type PaddleOcrArtifact={name:string;bytes:number;sha256:string;manifestSha256:string;url:string}
