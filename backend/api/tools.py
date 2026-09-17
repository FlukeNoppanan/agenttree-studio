"""Executable Tool CRUD, discovery, testing, and assignment endpoints."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.tool import (
    MCPDiscoveryResponse,
    ToolAssignmentsResponse,
    ToolAssignmentsUpdate,
    ToolConnectionRead,
    ToolCreate,
    ToolExecuteRequest,
    ToolExecuteResponse,
    ToolTestResponse,
    ToolUpdate,
)
from backend.services.tool_service import ToolService

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolConnectionRead])
def list_tools(database: Session = Depends(get_db)) -> list[ToolConnectionRead]:
    return ToolService(database).list()


@router.post("", response_model=ToolConnectionRead, status_code=status.HTTP_201_CREATED)
def create_tool(
    payload: ToolCreate,
    database: Session = Depends(get_db),
) -> ToolConnectionRead:
    return ToolService(database).create(payload)


@router.get("/{tool_id}", response_model=ToolConnectionRead)
def get_tool(tool_id: str, database: Session = Depends(get_db)) -> ToolConnectionRead:
    return ToolService(database).get(tool_id)


@router.put("/{tool_id}", response_model=ToolConnectionRead)
def update_tool(
    tool_id: str,
    payload: ToolUpdate,
    database: Session = Depends(get_db),
) -> ToolConnectionRead:
    return ToolService(database).update(tool_id, payload)


@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tool(tool_id: str, database: Session = Depends(get_db)) -> Response:
    ToolService(database).delete(tool_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{tool_id}/test", response_model=ToolTestResponse)
def test_tool(tool_id: str, database: Session = Depends(get_db)) -> ToolTestResponse:
    return ToolService(database).test(tool_id)


@router.post("/{tool_id}/discover", response_model=MCPDiscoveryResponse)
def discover_tools(
    tool_id: str,
    database: Session = Depends(get_db),
) -> MCPDiscoveryResponse:
    return ToolService(database).discover(tool_id)


@router.post("/{tool_id}/test-execute", response_model=ToolExecuteResponse)
def test_execute_tool(
    tool_id: str,
    payload: ToolExecuteRequest,
    database: Session = Depends(get_db),
) -> ToolExecuteResponse:
    return ToolService(database).execute(tool_id, payload)


@router.get("/{tool_id}/assignments", response_model=ToolAssignmentsResponse)
def get_tool_assignments(
    tool_id: str,
    database: Session = Depends(get_db),
) -> ToolAssignmentsResponse:
    return ToolService(database).assignments(tool_id)


@router.put("/{tool_id}/assignments", response_model=ToolAssignmentsResponse)
def update_tool_assignments(
    tool_id: str,
    payload: ToolAssignmentsUpdate,
    database: Session = Depends(get_db),
) -> ToolAssignmentsResponse:
    return ToolService(database).replace_assignments(tool_id, payload)
