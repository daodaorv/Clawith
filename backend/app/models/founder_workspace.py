"""Founder workspace persistence model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FounderWorkspace(Base):
    """A persisted founder-facing workspace that sits above single-agent creation."""

    __tablename__ = "founder_workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    business_brief: Mapped[str] = mapped_column(Text, default="")
    business_logic: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    current_state: Mapped[str] = mapped_column(String(32), nullable=False, default="intake")
    materialization_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started")
    latest_plan_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
