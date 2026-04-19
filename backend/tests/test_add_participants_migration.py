from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_migration_module():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "add_participants.py"
    )
    spec = importlib.util.spec_from_file_location("add_participants_migration", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_backfill_sql_uses_identity_fields_when_users_username_is_missing():
    module = _load_migration_module()

    sql = module._build_user_participant_backfill_sql(
        user_columns={"id", "display_name", "avatar_url", "identity_id"},
        identity_columns={"id", "username", "email"},
    )

    assert "FROM users u" in sql
    assert "LEFT JOIN identities i ON i.id = u.identity_id" in sql
    assert "i.username" in sql
    assert "u.username" not in sql


def test_backfill_sql_keeps_legacy_users_username_fallback_when_available():
    module = _load_migration_module()

    sql = module._build_user_participant_backfill_sql(
        user_columns={"id", "display_name", "avatar_url", "username"},
        identity_columns=set(),
    )

    assert "FROM users u" in sql
    assert "u.username" in sql
    assert "LEFT JOIN identities" not in sql
