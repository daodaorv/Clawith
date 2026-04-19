"""add llm request_timeout

Revision ID: d9cbd43b62e5
Revises: 440261f5594f
Create Date: 2026-04-01 18:18:53.009382
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9cbd43b62e5'
down_revision: Union[str, None] = '440261f5594f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _load_table_columns(conn, table_name: str) -> set[str]:
    rows = conn.execute(
        sa.text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).fetchall()
    return {row[0] for row in rows}


def _should_add_request_timeout_column(*, llm_model_columns: set[str]) -> bool:
    return "request_timeout" not in llm_model_columns


def _should_drop_request_timeout_column(*, llm_model_columns: set[str]) -> bool:
    return "request_timeout" in llm_model_columns


def upgrade() -> None:
    conn = op.get_bind()
    llm_model_columns = _load_table_columns(conn, "llm_models")
    if _should_add_request_timeout_column(llm_model_columns=llm_model_columns):
        op.add_column('llm_models', sa.Column('request_timeout', sa.Integer(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    llm_model_columns = _load_table_columns(conn, "llm_models")
    if _should_drop_request_timeout_column(llm_model_columns=llm_model_columns):
        op.drop_column('llm_models', 'request_timeout')
