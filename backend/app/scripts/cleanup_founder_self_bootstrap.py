"""Cleanup disposable founder self-bootstrap E2E artifacts.

Dry-run by default. Pass --yes to execute.

Usage:
  cd backend && python -m app.scripts.cleanup_founder_self_bootstrap
  cd backend && python -m app.scripts.cleanup_founder_self_bootstrap --yes
"""

from __future__ import annotations

import argparse
import asyncio
import json

from loguru import logger

from app.database import async_session
from app.services.founder_self_bootstrap_cleanup import (
    cleanup_founder_self_bootstrap_targets,
    is_self_bootstrap_cleanup_target,
    list_all_founder_self_bootstrap_cleanup_targets,
)


async def cleanup_founder_self_bootstrap_artifacts(*, execute: bool) -> int:
    async with async_session() as db:
        targets = await list_all_founder_self_bootstrap_cleanup_targets(db)
        matching_targets = [item for item in targets if is_self_bootstrap_cleanup_target(item)]

        if not matching_targets:
            logger.info("No founder self-bootstrap E2E artifacts were found.")
            return 0

        exit_code = 0
        for target in matching_targets:
            result = await cleanup_founder_self_bootstrap_targets(
                db,
                targets=target,
                execute=execute,
                reason="founder self-bootstrap sweep",
            )
            logger.info(json.dumps(result, ensure_ascii=False))
            if not result["ok"]:
                exit_code = 1
        return exit_code


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cleanup founder self-bootstrap E2E artifacts.")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Execute the cleanup. Without this flag the script only prints the matched targets.",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    raise SystemExit(asyncio.run(cleanup_founder_self_bootstrap_artifacts(execute=args.yes)))


if __name__ == "__main__":
    main()
