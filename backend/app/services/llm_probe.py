"""Structured LLM probe service for Duoduo model-center."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.services.llm_client import (
    LLMMessage,
    create_llm_client,
    get_provider_base_url,
    get_provider_spec,
    normalize_provider,
)


SUPPORTED_PROBE_PROVIDERS = {
    "anthropic",
    "openai",
    "openai-response",
    "deepseek",
    "qwen",
    "zhipu",
    "baidu",
    "kimi",
    "custom",
}


@dataclass
class ProbeInput:
    provider: str
    model: str
    api_key: str
    base_url: str | None = None


def _classify_gateway(provider: str, base_url: str | None) -> tuple[str, str]:
    normalized = normalize_provider(provider)
    url = (base_url or "").lower()

    if normalized == "anthropic" or "anthropic" in url:
        return "official-anthropic-compatible", "已识别为 Anthropic 兼容接口。"
    if normalized == "qwen" or "dashscope" in url:
        return "official-openai-compatible", "已识别为 OpenAI 兼容接口。"
    if normalized == "zhipu" or "bigmodel" in url:
        return "official-openai-compatible", "已识别为 OpenAI 兼容接口。"
    if normalized == "baidu" or "qianfan" in url:
        return "official-openai-compatible", "已识别为 OpenAI 兼容接口。"
    if normalized == "kimi" or "moonshot" in url:
        return "official-openai-compatible", "已识别为 OpenAI 兼容接口。"
    if normalized == "deepseek" or "deepseek" in url:
        return "official-openai-compatible", "已识别为 OpenAI 兼容接口。"
    if normalized == "openai-response":
        return "official-openai-responses", "已识别为 OpenAI Responses 接口。"
    if normalized == "custom":
        return "custom-openai-compatible", "当前按自定义 OpenAI 兼容接口探测。"
    return "official-openai-compatible", "已识别为 OpenAI 兼容接口。"


def build_provider_unsupported_result(data: ProbeInput) -> dict[str, Any]:
    return {
        "success": False,
        "input": {
            "provider_raw": data.provider,
            "base_url_raw": data.base_url,
            "model_raw": data.model,
        },
        "resolved_provider": None,
        "protocol": None,
        "recommended_model": None,
        "normalized_base_url": data.base_url,
        "base_url_source": "api_input" if data.base_url else "none",
        "supports_completion": False,
        "supports_stream": False,
        "supports_tool_call": False,
        "supports_reasoning_signal": False,
        "requires_manual_model_id": False,
        "supports_vision": False,
        "supports_structured_output": False,
        "registry_declared_capabilities": {},
        "probe_observed_capabilities": {
            "supports_completion": False,
            "supports_stream": False,
            "supports_tool_call": False,
        },
        "gateway_profile": "unknown",
        "gateway_hint": "当前接入类型不在第一阶段正式支持范围内。",
        "error_code": "PROBE_PROVIDER_UNSUPPORTED",
        "error_message": "当前接入类型不在第一阶段正式支持范围内。",
        "warnings": [],
        "latency_ms": 0,
        "reply_preview": "",
        "autofill": {"applied_fields": []},
    }


async def run_llm_probe(data: ProbeInput) -> dict[str, Any]:
    normalized_provider = normalize_provider(data.provider)
    if normalized_provider not in SUPPORTED_PROBE_PROVIDERS:
        return build_provider_unsupported_result(data)

    spec = get_provider_spec(normalized_provider)
    normalized_base_url = get_provider_base_url(normalized_provider, data.base_url)
    base_url_source = "api_input" if data.base_url else "provider_default"
    gateway_profile, gateway_hint = _classify_gateway(normalized_provider, normalized_base_url)

    start = time.perf_counter()
    try:
        client = create_llm_client(
            provider=normalized_provider,
            api_key=data.api_key,
            model=data.model,
            base_url=normalized_base_url,
        )
        response = await client.complete(
            messages=[LLMMessage(role="user", content="Say 'ok' and nothing else.")],
            max_tokens=16,
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        reply_preview = ((response.content or response.reasoning_content) or "")[:100]
        success = bool(response.content or response.reasoning_content)

        return {
            "success": success,
            "input": {
                "provider_raw": data.provider,
                "base_url_raw": data.base_url,
                "model_raw": data.model,
            },
            "resolved_provider": normalized_provider,
            "protocol": spec.protocol if spec else "openai_compatible",
            "recommended_model": response.model or data.model,
            "normalized_base_url": normalized_base_url,
            "base_url_source": base_url_source,
            "supports_completion": success,
            "supports_stream": False,
            "supports_tool_call": False,
            "supports_reasoning_signal": bool(response.reasoning_content),
            "requires_manual_model_id": False,
            "supports_vision": False,
            "supports_structured_output": False,
            "registry_declared_capabilities": {
                "supports_tool_choice": spec.supports_tool_choice if spec else False,
            },
            "probe_observed_capabilities": {
                "supports_completion": success,
                "supports_stream": False,
                "supports_tool_call": False,
            },
            "gateway_profile": gateway_profile,
            "gateway_hint": gateway_hint,
            "warnings": [],
            "latency_ms": latency_ms,
            "reply_preview": reply_preview,
            "autofill": {"applied_fields": []},
        }
    except Exception as exc:  # pragma: no cover - exercised in API tests via return payload
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {
            "success": False,
            "input": {
                "provider_raw": data.provider,
                "base_url_raw": data.base_url,
                "model_raw": data.model,
            },
            "resolved_provider": normalized_provider,
            "protocol": spec.protocol if spec else "openai_compatible",
            "recommended_model": None,
            "normalized_base_url": normalized_base_url,
            "base_url_source": base_url_source,
            "supports_completion": False,
            "supports_stream": False,
            "supports_tool_call": False,
            "supports_reasoning_signal": False,
            "requires_manual_model_id": False,
            "supports_vision": False,
            "supports_structured_output": False,
            "registry_declared_capabilities": {
                "supports_tool_choice": spec.supports_tool_choice if spec else False,
            },
            "probe_observed_capabilities": {
                "supports_completion": False,
                "supports_stream": False,
                "supports_tool_call": False,
            },
            "gateway_profile": gateway_profile,
            "gateway_hint": gateway_hint,
            "error_code": "PROBE_COMPLETION_FAILED",
            "error_message": str(exc)[:500],
            "warnings": [],
            "latency_ms": latency_ms,
            "reply_preview": "",
            "autofill": {"applied_fields": []},
        }
