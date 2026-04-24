"""Run the founder release-readiness verification lane.

This script keeps founder verification reproducible across local workstations
and GitHub Actions without forcing the live browser E2E gate into CI.

Usage:
  cd backend && python -m app.scripts.founder_release_readiness
  cd backend && python -m app.scripts.founder_release_readiness --dry-run
  cd backend && python -m app.scripts.founder_release_readiness --include-live-e2e
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ReleaseReadinessStep:
    name: str
    cwd: Path
    args: tuple[str, ...]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _npm_executable() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def _relative_paths(paths: list[Path], *, from_dir: Path) -> list[str]:
    return [path.relative_to(from_dir).as_posix() for path in sorted(paths)]


def discover_founder_backend_test_targets(backend_dir: Path) -> list[str]:
    tests_dir = backend_dir / "tests"
    targets = list(tests_dir.glob("test_founder*.py"))
    guard_test = tests_dir / "test_agents_founder_mainline_guard_api.py"
    if guard_test.exists():
        targets.append(guard_test)
    return _relative_paths(list(dict.fromkeys(targets)), from_dir=backend_dir)


def discover_founder_frontend_test_targets(frontend_dir: Path) -> list[str]:
    return _relative_paths(list((frontend_dir / "tests").glob("founder*.test.mjs")), from_dir=frontend_dir)


def discover_founder_ruff_targets(backend_dir: Path) -> list[str]:
    app_targets = list((backend_dir / "app").rglob("*founder*.py"))
    test_targets = list((backend_dir / "tests").glob("test_founder*.py"))
    guard_test = backend_dir / "tests" / "test_agents_founder_mainline_guard_api.py"
    if guard_test.exists():
        test_targets.append(guard_test)
    return _relative_paths(list(dict.fromkeys(app_targets + test_targets)), from_dir=backend_dir)


def build_founder_release_readiness_steps(
    *,
    repo_root: Path | None = None,
    include_live_e2e: bool = False,
) -> list[ReleaseReadinessStep]:
    repo_root = repo_root or _repo_root()
    backend_dir = repo_root / "backend"
    frontend_dir = repo_root / "frontend"

    backend_ruff_targets = discover_founder_ruff_targets(backend_dir)
    backend_test_targets = discover_founder_backend_test_targets(backend_dir)
    frontend_test_targets = discover_founder_frontend_test_targets(frontend_dir)

    if not backend_ruff_targets:
        raise ValueError("No founder backend files found for ruff verification.")
    if not backend_test_targets:
        raise ValueError("No founder backend tests found for pytest verification.")
    if not frontend_test_targets:
        raise ValueError("No founder frontend tests found for node --test verification.")

    steps = [
        ReleaseReadinessStep(
            name="Backend founder ruff",
            cwd=backend_dir,
            args=(sys.executable, "-m", "ruff", "check", *backend_ruff_targets),
        ),
        ReleaseReadinessStep(
            name="Backend founder pytest",
            cwd=backend_dir,
            args=(sys.executable, "-m", "pytest", "-q", *backend_test_targets),
        ),
        ReleaseReadinessStep(
            name="Frontend founder node tests",
            cwd=frontend_dir,
            args=("node", "--test", *frontend_test_targets),
        ),
        ReleaseReadinessStep(
            name="Frontend build",
            cwd=frontend_dir,
            args=(_npm_executable(), "run", "build"),
        ),
    ]

    if include_live_e2e:
        steps.append(
            ReleaseReadinessStep(
                name="Frontend live founder E2E",
                cwd=frontend_dir,
                args=(_npm_executable(), "run", "test:e2e:founder"),
            )
        )

    return steps


def _display_command(args: tuple[str, ...]) -> str:
    return shlex.join(args)


def run_founder_release_readiness(
    *,
    include_live_e2e: bool = False,
    dry_run: bool = False,
    repo_root: Path | None = None,
) -> int:
    steps = build_founder_release_readiness_steps(
        repo_root=repo_root,
        include_live_e2e=include_live_e2e,
    )

    for index, step in enumerate(steps, start=1):
        print(f"[{index}/{len(steps)}] {step.name}", flush=True)
        print(f"cwd: {step.cwd}", flush=True)
        print(f"cmd: {_display_command(step.args)}", flush=True)
        if dry_run:
            continue

        completed = subprocess.run(step.args, cwd=step.cwd)
        if completed.returncode != 0:
            print(f"Step failed: {step.name} (exit {completed.returncode})", flush=True)
            return completed.returncode

    print("Founder release-readiness checks completed.", flush=True)
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the founder release-readiness verification lane.")
    parser.add_argument(
        "--include-live-e2e",
        action="store_true",
        help="Append the live founder browser E2E check after the deterministic release-readiness steps.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned commands without executing them.",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    raise SystemExit(
        run_founder_release_readiness(
            include_live_e2e=args.include_live_e2e,
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    main()
