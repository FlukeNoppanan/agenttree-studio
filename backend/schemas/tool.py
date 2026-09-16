"""Read-only tool catalog contract for tree draft assignments."""

from pydantic import BaseModel, ConfigDict


class ToolConnectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tool_type: str
    description: str
    status: str
