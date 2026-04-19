from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_migration_module():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "d9cbd43b62e5_add_llm_request_timeout.py"
    )
    spec = importlib.util.spec_from_file_location("add_llm_request_timeout_migration", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_request_timeout_column_is_skipped_when_it_already_exists():
    module = _load_migration_module()

    should_add = module._should_add_request_timeout_column(
        llm_model_columns={"id", "model", "request_timeout"},
    )

    assert should_add is False


def test_request_timeout_column_is_added_when_missing():
    module = _load_migration_module()

    should_add = module._should_add_request_timeout_column(
        llm_model_columns={"id", "model", "temperature"},
    )

    assert should_add is True


def test_request_timeout_column_is_not_dropped_when_missing():
    module = _load_migration_module()

    should_drop = module._should_drop_request_timeout_column(
        llm_model_columns={"id", "model", "temperature"},
    )

    assert should_drop is False


def test_request_timeout_column_is_dropped_when_present():
    module = _load_migration_module()

    should_drop = module._should_drop_request_timeout_column(
        llm_model_columns={"id", "model", "request_timeout"},
    )

    assert should_drop is True
