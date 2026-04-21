"""Compatibility helpers for redis.asyncio pipelines and async test doubles."""

from __future__ import annotations

import inspect
from collections.abc import Iterable


async def run_pipeline_commands(pipe, commands: Iterable[tuple[str, tuple[object, ...]]]) -> None:
    """Run pipeline commands against real redis pipelines or async mock pipelines.

    Real `redis.asyncio` pipelines return the pipeline itself from `setex/delete`
    and apply side effects on `execute()`. Some async test doubles implement
    `setex/delete` as awaitable methods with immediate side effects. This helper
    supports both forms.
    """
    for method_name, args in commands:
        result = getattr(pipe, method_name)(*args)
        if inspect.isawaitable(result):
            await result

    execute = getattr(pipe, "execute", None)
    if execute is None:
        return

    result = execute()
    if inspect.isawaitable(result):
        await result
