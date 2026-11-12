import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMediaReference } from './refresh-venice-media-reference.mjs'
test('public reference keeps billing tiers, comparable video quotes and family pages',()=>{
 const result=buildMediaReference({generatedAt:'2026-11-11',models:{video:{id:'video',family:'video-family',type:'video',pricing:{quotes:{'1080p|5s|on':1,'720p|5s|on':0.5}}},music:{id:'music',type:'music',pricing:{tiers:[{from:3,upTo:60,usd:0.69}]}},long:{id:'long',type:'music',pricing:{tiers:[{from:60,upTo:60,usd:0.03}]}},voice:{id:'voice',type:'tts',pricing:{per1MChars:10}},source:{id:'source',type:'video',pricing:{status:'source-required'}}}})
 assert.equal(result.prices.models.video.amount,0.5)
 assert.equal(result.prices.models.music.amount,0.69)
 assert.ok(Math.abs(result.prices.models.long.amount-0.015)<1e-12)
 assert.equal(result.prices.models.voice.speechEstimate,true)
 assert.equal(result.prices.models.source,undefined)
 assert.equal(result.pages.pages.video,'video-family')
})
