import { describe, expect, it } from 'vitest'
import type { ProviderModel } from './api'
import { isProviderVerificationBlocked, needsQualification, qualificationCounts } from './provider-models'
const model = (status:ProviderModel['qualification_status'],extra:Partial<ProviderModel>={}):ProviderModel => ({id:'m',provider_connection_id:'p',model_id:'same',display_name:'Same',metadata:null,is_available:true,generation_candidate:true,qualification_status:status,qualification_checked_at:new Date().toISOString(),qualification_error_code:null,qualification_message:null,discovered_at:new Date().toISOString(),...extra})
describe('qualification progress and resume',()=>{
 it('fresh completed models are not rechecked',()=>{for(const status of ['qualified','limited','unavailable'] as const)expect(needsQualification(model(status))).toBe(false)})
 it('pending and stale models continue',()=>{expect(needsQualification(model('unknown'))).toBe(true);expect(needsQualification(model('transient_error'))).toBe(true);expect(needsQualification(model('qualified',{qualification_checked_at:'2020-01-01'}))).toBe(true)})
 it('long Retry-After blocks early requests and does not remove previous selection',()=>{const saved=model('qualified',{metadata:{qualification_attempt:{status:'pending',scope:'model',retry_at:new Date(Date.now()+18824000).toISOString()}}});expect(needsQualification(saved)).toBe(false);expect(saved.qualification_status).toBe('qualified');expect(isProviderVerificationBlocked(saved)).toBe(false)})
 it('only Provider-scoped interruption stops other models',()=>{expect(isProviderVerificationBlocked(model('transient_error',{qualification_error_code:'model_quota_exhausted',metadata:{qualification_attempt:{status:'pending',scope:'model'}}}))).toBe(false);expect(isProviderVerificationBlocked(model('qualified',{metadata:{qualification_attempt:{status:'pending',scope:'provider'}}}))).toBe(true)})
 it('Pending is not counted as Unavailable or checked',()=>{expect(qualificationCounts([model('qualified'),model('limited'),model('unavailable'),model('unknown'),model('transient_error')])).toEqual({total:5,checked:3,ready:1,limited:1,unavailable:1,pending:2,rechecks:0})})
})
it('unknown quota scope conservatively pauses but model scope stays independent',()=>{
 expect(isProviderVerificationBlocked(model('transient_error',{metadata:{qualification_attempt:{status:'pending',scope:'unknown'}}}))).toBe(true)
 expect(isProviderVerificationBlocked(model('transient_error',{metadata:{qualification_attempt:{status:'pending',scope:'model'}}}))).toBe(false)
})
