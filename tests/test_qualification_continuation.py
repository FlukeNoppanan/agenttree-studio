"""Incremental qualification is scope-aware and resumable on actual persistence."""
import json
from datetime import timedelta
import pytest
from agenttree.providers import ProviderResponse
from agenttree.providers.exceptions import ProviderModelNotFoundError, ProviderInvalidRequestError, ProviderAuthenticationError, ProviderRateLimitError, ProviderUnavailableError, ProviderTimeoutError
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.common import utc_now
from backend.providers.base import ProviderAdapter, DiscoveredModel
from backend.services.model_discovery_service import ModelDiscoveryService, ATTEMPT_KEY
from backend.services.provider_service import ProviderService
from test_structured_model_qualification import decision_reply, ProbeProvider
from backend.services.model_qualification import qualify_decisions

class Catalog(ProviderAdapter):
    def discover_models(self, credential):
        return (DiscoveredModel('a'),DiscoveredModel('b'))

class Working:
    def generate(self, request):
        return ProviderResponse(content=decision_reply() if request.metadata.get('strategy') or 'Return JSON' in request.prompt else 'OK',provider='same-local-provider')

def setup(database, behavior):
    p=ProviderConnection(name='Same Provider',provider_type='openai',status='connected')
    database.add(p);database.commit()
    calls=[];waits=[]
    class Provider:
        def __init__(self, model): self.model=model
        def generate(self, request):
            calls.append(self.model)
            failure=behavior(self.model,len([m for m in calls if m==self.model]),request)
            if failure: raise failure
            return Working().generate(request)
    s=ModelDiscoveryService(database,adapter_factory=lambda *_:Catalog(),generation_factory=lambda _,model,*args:Provider(model),sleep=waits.append)
    return p,s,calls,waits

@pytest.mark.parametrize('failure',[ProviderModelNotFoundError('SECRET'),ProviderInvalidRequestError('SECRET')])
def test_model_failure_does_not_stop_next_model(database,failure):
    p,s,calls,_=setup(database,lambda model,*_:failure if model=='a' else None)
    r=s.discover_models(p.id)
    assert [m.qualification_status for m in r.models]==['unavailable','qualified']
    assert 'b' in calls and r.provider.status=='connected'
    assert all('SECRET' not in (m.qualification_message or '') for m in r.models)

@pytest.mark.parametrize('failure',[ProviderAuthenticationError('revoked credential'),ProviderUnavailableError('offline'),ProviderTimeoutError('timeout')])
def test_provider_failure_preserves_progress_pending_and_stops(database,failure):
    p,s,calls,_=setup(database,lambda *args:failure)
    r=s.discover_models(p.id)
    assert set(calls)=={'a'}
    assert [m.qualification_status for m in r.models]==['transient_error','unknown']
    assert r.provider.pending_models_count==2 and r.provider.unavailable_models_count==0
    assert r.provider.status=='connected' and r.provider.qualification_pause_code


def test_retry_after_bounded_retry_and_success(database):
    p,s,calls,waits=setup(database,lambda model,n,*_:ProviderRateLimitError('secret',retry_after=3) if model=='a' and n==1 else None)
    r=s.discover_models(p.id)
    assert waits==[3] and all(m.qualification_status=='qualified' for m in r.models)


def test_long_provider_retry_after_pauses_without_shortening(database):
    p,s,calls,waits=setup(database,lambda *args:ProviderRateLimitError('secret',retry_after=18824))
    r=s.discover_models(p.id)
    assert calls==['a'] and not waits
    assert r.models[0].metadata[ATTEMPT_KEY]['retry_at']
    s.discover_models(p.id)
    assert calls==['a'] # early Continue respects cooldown


def test_model_quota_wait_is_pending_and_other_model_continues(database):
    failure=ProviderRateLimitError('secret',retry_after=18824,failure_scope='model',quota_exhausted=True)
    p,s,calls,waits=setup(database,lambda model,*_:failure if model=='a' else None)
    r=s.discover_models(p.id)
    assert r.models[0].qualification_status=='transient_error'
    assert r.models[0].metadata[ATTEMPT_KEY]['scope']=='model'
    assert r.models[1].qualification_status=='qualified' and 'b' in calls and not waits
    assert r.provider.qualification_pause_code is None and r.provider.pending_models_count==1


def test_resume_does_not_retest_completed_fresh_models(database):
    pause=[True]
    p,s,calls,_=setup(database,lambda model,*_:ProviderAuthenticationError('stop') if model=='b' and pause[0] else None)
    r=s.discover_models(p.id); count=calls.count('a')
    assert r.models[0].qualification_status=='qualified' and r.models[1].qualification_status=='transient_error'
    pause[0]=False
    r=s.discover_models(p.id)
    assert calls.count('a')==count and r.provider.checked_models_count==2
    assert all(m.qualification_status=='qualified' for m in r.models)


def test_interrupted_recheck_preserves_previous_proof_and_time(database):
    p,s,calls,_=setup(database,lambda *args:ProviderAuthenticationError('secret'))
    s.discover_catalog(p.id)
    m=next(m for m in ProviderService(database).get_model(p.id).models if m.model_id=='a')
    proof=qualify_decisions(ProbeProvider());before=utc_now()
    m.qualification_status='qualified';m.qualification_checked_at=before;m.metadata_json=json.dumps({'agenttree_qualification':proof})
    database.commit()
    r=s.verify_model(p.id,'a')
    assert r.model.qualification_status=='qualified'
    assert r.model.metadata['agenttree_qualification']==proof
    assert r.model.qualification_checked_at.replace(tzinfo=before.tzinfo)==before
    assert r.model.metadata[ATTEMPT_KEY]['status']=='pending' and r.provider.pending_rechecks_count==1
    s.discover_catalog(p.id)
    assert ProviderService(database).models(p.id)[0].metadata['agenttree_qualification']==proof


def test_stale_models_are_rechecked_and_summary_uses_current_results(database):
    p,s,calls,_=setup(database,lambda *args:None)
    s.discover_models(p.id)
    for m in ProviderService(database).get_model(p.id).models:m.qualification_checked_at=utc_now()-timedelta(days=2)
    database.commit();n=len(calls)
    r=s.discover_models(p.id)
    assert len(calls)>n and r.provider.checked_models_count==2 and r.provider.models_count==2


def test_model_structured_incompatibility_is_limited_and_continues(database):
    p,s,calls,_=setup(database,lambda *args:None)
    s._decision_provider=lambda conn,mid: ProbeProvider('triage') if mid=='a' else ProbeProvider()
    r=s.discover_models(p.id)
    assert [m.qualification_status for m in r.models]==['limited','qualified']
    assert r.provider.limited_models_count==1 and r.provider.models_count==1


def test_direct_http_429_retry_after_is_respected(database):
    import httpx
    response=httpx.Response(429,headers={'Retry-After':'9'},request=httpx.Request('POST','https://provider.invalid'))
    try:response.raise_for_status()
    except httpx.HTTPStatusError as e:failure=e
    p,s,calls,waits=setup(database,lambda *args:failure)
    r=s.discover_models(p.id)
    assert calls==['a'] and not waits and r.provider.pending_models_count==2
    assert r.models[0].metadata[ATTEMPT_KEY]['retry_at']


def test_model_specific_http_404_continues(database):
    import httpx
    response=httpx.Response(404,request=httpx.Request('POST','https://provider.invalid'))
    try:response.raise_for_status()
    except httpx.HTTPStatusError as e:failure=e
    p,s,calls,_=setup(database,lambda model,*_:failure if model=='a' else None)
    r=s.discover_models(p.id)
    assert r.models[0].qualification_status=='unavailable' and r.models[1].qualification_status=='qualified'
