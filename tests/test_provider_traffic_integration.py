"""Real persistence boundary with deterministic Provider transport substitutes."""
import json
from threading import Event, Thread
from types import SimpleNamespace

from agenttree.core.execution_control import ExecutionCancelled
from agenttree.providers import BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse
from agenttree.providers.traffic import GovernedProvider, ProviderRequestGovernor
from agenttree.providers.exceptions import ProviderRateLimitError
from backend.providers.generation import traffic_scope_key
from backend.services.qualification_control import start_qualification, stop_qualification, qualification_traffic
from test_qualification_continuation import setup
from backend.services.model_discovery_service import ATTEMPT_KEY


def test_credential_scope_shared_between_models_connections():
    a=SimpleNamespace(provider_type='groq',base_url=None,id='a',name='A')
    b=SimpleNamespace(provider_type='groq',base_url=None,id='b',name='B')
    assert traffic_scope_key(a,'private')==traffic_scope_key(b,'private')
    assert traffic_scope_key(a,'private')!=traffic_scope_key(a,'other')
    assert 'private' not in traffic_scope_key(a,'private')


def test_unknown_rate_scope_pauses_catalog_without_disconnecting(database):
    p,service,calls,_=setup(database,lambda *args:ProviderRateLimitError('safe',retry_after=3600,failure_scope='unknown'))
    result=service.discover_models(p.id)
    assert result.provider.status=='connected' and set(calls)=={'a'}
    first=result.models[0];attempt=first.metadata[ATTEMPT_KEY]
    assert attempt['scope']=='unknown' and attempt['retry_at']
    assert attempt['traffic_failure']['category']=='rate_limit'
    assert result.models[1].qualification_status=='unknown'


def test_stop_qualification_cancels_queued_request_before_transport():
    g=ProviderRequestGovernor(max_wait=2);calls=[];queued=Event();done=Event();errors=[]
    class Transport(BaseProvider):
        def generate(self,request):calls.append(request);return ProviderResponse('OK','fixture')
    p=GovernedProvider(Transport(ProviderConfig('fixture',model='m')),key='shared',governor=g)
    start_qualification('disposable-test')
    def worker():
        try:
            with qualification_traffic('disposable-test',lambda e,d:queued.set() if e=='request.queued' else None):
                p.generate(ProviderRequest('x',metadata={'purpose':'studio_model_qualification'}))
        except Exception as error:errors.append(error)
        finally:done.set()
    with g.admission('shared','m'):
        thread=Thread(target=worker);thread.start();assert queued.wait(1)
        stop_qualification('disposable-test');assert done.wait(1)
    thread.join();assert isinstance(errors[0],ExecutionCancelled) and not calls
    start_qualification('disposable-test')
    with qualification_traffic('disposable-test'):assert p.generate(ProviderRequest('x')).content=='OK'


def test_stopped_qualification_persists_pending_without_requests(database):
    p,service,calls,_=setup(database,lambda *_:None)
    service.discover_catalog(p.id)
    stop_qualification(p.id)
    result=service.verify_model(p.id,'a')
    assert result.model.qualification_status=='transient_error'
    assert result.model.qualification_error_code=='verification_stopped'
    assert not calls and result.provider.status=='connected'
