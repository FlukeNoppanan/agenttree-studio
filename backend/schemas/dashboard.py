"""Product-focused dashboard response contracts."""

from datetime import datetime

from pydantic import BaseModel, Field


class TreeMetrics(BaseModel):
    total: int
    ready: int
    draft: int


class RunMetrics(BaseModel):
    total: int
    today: int
    running: int
    completed: int
    failed: int
    success_rate: float | None


class ProviderMetrics(BaseModel):
    total: int
    connected: int
    usable_models: int


class ToolMetrics(BaseModel):
    total: int
    connected: int
    enabled: int


class DashboardMetrics(BaseModel):
    trees: TreeMetrics
    runs: RunMetrics
    providers: ProviderMetrics
    tools: ToolMetrics
    users: int


class RecentRunSummary(BaseModel):
    id: str
    tree_id: str
    tree_name: str
    status: str
    started_at: datetime
    duration_ms: int | None
    result_state: str | None


class DashboardTreeSummary(BaseModel):
    id: str
    name: str
    description: str
    status: str
    agent_count: int
    run_count: int
    last_run_at: datetime | None
    provider_summary: list[str] = Field(default_factory=list)


class DashboardProviderSummary(BaseModel):
    id: str
    name: str
    provider_type: str
    status: str
    usable_models: int
    unavailable_models: int
    last_checked_at: datetime | None


class AttentionItem(BaseModel):
    id: str
    kind: str
    severity: str
    title: str
    message: str
    resource_name: str
    related_names: list[str] = Field(default_factory=list)
    action_label: str
    action_href: str


class DashboardSummary(BaseModel):
    metrics: DashboardMetrics
    recent_runs: list[RecentRunSummary]
    trees: list[DashboardTreeSummary]
    providers: list[DashboardProviderSummary]
    needs_attention: list[AttentionItem]


class GettingStartedTree(BaseModel):
    id: str
    name: str
    template: str
    ready: bool


class GettingStartedState(BaseModel):
    provider_ready: bool | None = None
    trees: list[GettingStartedTree] = Field(default_factory=list)
    runnable_tree_id: str | None = None
    successful_run_id: str | None = None
    has_successful_run: bool | None = None


class MyDashboard(BaseModel):
    onboarding: GettingStartedState = Field(default_factory=GettingStartedState)
    trees_count: int | None = None
    available_trees: list[dict[str, str]] = Field(default_factory=list)
    providers_count: int | None = None
    ready_models_count: int | None = None
    tools_count: int | None = None
    runs_count: int | None = None
    recent_runs: list[RecentRunSummary] = Field(default_factory=list)
    secrets_count: int | None = None
