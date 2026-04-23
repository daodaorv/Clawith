from __future__ import annotations

from typing import Any
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FounderWorkspaceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    business_brief: str = Field(min_length=1)
    business_logic: dict = Field(default_factory=dict)


class FounderWorkspaceOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID
    name: str
    business_brief: str
    business_logic: dict = Field(default_factory=dict)
    current_state: str
    materialization_status: str
    latest_plan: dict[str, Any] = Field(default_factory=dict)
    planning_context: dict[str, Any] = Field(default_factory=dict)
    draft_plan: dict[str, Any] | None = None
    dashboard_snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class FounderWorkspaceMaterializedAgent(BaseModel):
    id: uuid.UUID
    name: str
    canonical_name: str
    template_key: str


class FounderWorkspaceMaterializationOut(BaseModel):
    workspace_id: uuid.UUID
    current_state: str
    materialization_status: str
    created_agents: list[FounderWorkspaceMaterializedAgent] = Field(default_factory=list)
    relationship_count: int = 0
    trigger_count: int = 0
    dashboard_snapshot: dict[str, Any] = Field(default_factory=dict)
