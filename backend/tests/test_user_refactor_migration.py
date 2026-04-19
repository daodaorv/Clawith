from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_migration_module():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "user_refactor.py"
    )
    spec = importlib.util.spec_from_file_location("user_refactor_migration", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_email_unique_index_sql_is_skipped_when_users_email_column_is_missing():
    module = _load_migration_module()

    sql = module._build_users_tenant_email_index_sql(
        user_columns={"id", "tenant_id", "display_name", "identity_id"},
    )

    assert sql is None


def test_email_unique_index_sql_is_emitted_when_users_email_column_exists():
    module = _load_migration_module()

    sql = module._build_users_tenant_email_index_sql(
        user_columns={"id", "tenant_id", "email"},
    )

    assert sql is not None
    assert "ix_users_tenant_email_unique" in sql
    assert "users(tenant_id, email)" in sql
