from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_migration_module():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260330_refactor_user_system_phase2.py"
    )
    spec = importlib.util.spec_from_file_location("user_refactor_phase2_migration", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_backfill_sql_falls_back_when_legacy_user_columns_are_missing():
    module = _load_migration_module()

    sql = module._build_users_identity_backfill_sql(
        user_columns={"id", "identity_id", "primary_email", "is_active", "role"},
    )

    assert "SELECT id," in sql
    assert "primary_email AS email" in sql
    assert "NULL::VARCHAR AS primary_mobile" in sql
    assert "NULL::VARCHAR AS username" in sql
    assert "NULL::VARCHAR AS password_hash" in sql
    assert "WHERE identity_id IS NULL" in sql


def test_nullable_cleanup_only_targets_existing_legacy_columns():
    module = _load_migration_module()

    columns = module._legacy_user_columns_to_make_nullable(
        user_columns={"id", "identity_id", "display_name"},
    )

    assert columns == []


def test_downgrade_fk_drop_sql_covers_both_constraint_names():
    module = _load_migration_module()

    sql_statements = module._build_users_identity_fk_drop_sql()

    assert any(
        "DROP CONSTRAINT IF EXISTS fk_users_identity_id" in sql
        for sql in sql_statements
    )
    assert any(
        "DROP CONSTRAINT IF EXISTS users_identity_id_fkey" in sql
        for sql in sql_statements
    )
