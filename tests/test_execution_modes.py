"""All existing ingress contracts carry one authoritative per-Run mode."""
import pytest
from pydantic import ValidationError
from backend.schemas.run import InvocationRequest, TestRunRequest as StudioTestRequest
from backend.schemas.public_api import PublicInvokeRequest
from backend.schemas.public_api_v2 import RunSubmitRequest
from backend.schemas.webhook import WebhookEvent
from backend.api.public_v2 import _canonical_submission
from backend.services.run_service import RunService
from tests.test_runs import runtime_tree, scripted_builder

@pytest.mark.parametrize('schema,data',[
 (InvocationRequest,{'input':{'objective':'Inspect'}}),
 (StudioTestRequest,{'input':{'objective':'Inspect'}}),
 (PublicInvokeRequest,{'input':'Inspect'}),
 (RunSubmitRequest,{'tree_id':'tree','input':'Inspect'}),
 (WebhookEvent,{'event':{'objective':'Inspect'}}),
])
def test_ingress_default_fast_and_explicit_deep(schema,data):
 assert schema(**data).execution_mode.value=='fast'
 assert schema(**data,execution_mode='deep').execution_mode.value=='deep'
 with pytest.raises(ValidationError): schema(**data,execution_mode='unknown')

def test_v2_mode_participates_in_idempotency():
 common={'tree_id':'tree','input':'Inspect'}
 assert _canonical_submission(RunSubmitRequest(**common))==_canonical_submission(RunSubmitRequest(**common,execution_mode='fast'))
 assert _canonical_submission(RunSubmitRequest(**common))!=_canonical_submission(RunSubmitRequest(**common,execution_mode='deep'))

@pytest.mark.parametrize('mode',['fast','deep'])
def test_real_core_task_mode_persists_in_run_and_trace(database,mode):
 tree,_,_=runtime_tree(database)
 builder,_,_=scripted_builder(database)
 result=RunService(database,builder).invoke(tree.id,InvocationRequest(input={'objective':'Inspect network logs'},execution_mode=mode,metadata={'execution_mode':'invented'}))
 assert result.status.value=='completed'
 assert result.execution_mode.value==mode and result.metadata['execution_mode']==mode
 events=[e for e in result.trace if e.event_type=='execution.started']
 assert events and events[0].payload['metadata']['execution_mode']==mode
 assert RunService(database).get(result.id).execution_mode.value==mode

def test_deep_provider_failure_is_not_fast_fallback(database):
 from agenttree.providers.exceptions import ProviderAuthenticationError
 tree,_,_=runtime_tree(database)
 builder,_,_=scripted_builder(database,fail=ProviderAuthenticationError('authentication rejected'))
 result=RunService(database,builder).invoke(tree.id,InvocationRequest(input={'objective':'Inspect'},execution_mode='deep'))
 assert result.status.value=='failed' and result.execution_mode.value=='deep'
 assert result.error_code.value=='PROVIDER_AUTH_ERROR'
 assert not any(e.event_type=='root.direct_response' for e in result.trace)

@pytest.mark.parametrize('mode',['fast','deep'])
def test_queued_cancellation_preserves_mode(database,mode):
 tree,_,_=runtime_tree(database)
 service=RunService(database)
 prepared=service.prepare(tree.id,InvocationRequest(input={'objective':'Inspect'},execution_mode=mode))
 result=service.cancel_run(prepared.id)
 assert result.status.value=='cancelled' and result.execution_mode.value==mode
