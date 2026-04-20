import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
    enterpriseApi,
    skillApi,
    type DuoduoCoordinationPattern,
    type DuoduoTemplateLibraryItem,
    type DuoduoTemplateLibraryResponse,
    type LLMProbeResult,
    type SkillLibraryItem,
    type SkillPackCatalogItem,
} from '../services/api';
import PromptModal from '../components/PromptModal';
import FileBrowser from '../components/FileBrowser';
import type { FileBrowserApi } from '../components/FileBrowser';
import {
    findTemplateByCanonicalName,
    openSkillPackDetailState,
    openTemplateDetailState,
} from './enterpriseSettingsDetailNavigation';
import {
    filterSkillPackCatalog,
    filterTemplateCatalog,
} from './enterpriseSettingsCatalogFilters';
import {
    focusSkillPackCatalog,
    focusTemplateCatalog,
} from './enterpriseSettingsCatalogFocus';
import { buildCatalogManagementLens } from './enterpriseSettingsCatalogLens';
import {
    buildSkillPackCatalogStats,
    buildTemplateCatalogStats,
} from './enterpriseSettingsCatalogStats';
import { saveAccentColor, getSavedAccentColor, resetAccentColor, PRESET_COLORS } from '../utils/theme';
import UserManagement from './UserManagement';
import InvitationCodes from './InvitationCodes';
import LinearCopyButton from '../components/LinearCopyButton';
// API helpers for enterprise endpoints
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Pydantic validation errors return detail as an array of objects,
        // each with {loc, msg, type}. Extract readable messages from the array.
        const detail = body.detail;
        const msg = Array.isArray(detail)
            ? detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ')
            : (typeof detail === 'string' ? detail : 'Error');
        throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

interface LLMModel {
    id: string; provider: string; model: string; label: string;
    base_url?: string; api_key_masked?: string; max_tokens_per_day?: number; enabled: boolean; supports_vision?: boolean; max_output_tokens?: number; request_timeout?: number; temperature?: number; created_at: string;
}

interface LLMProviderSpec {
    provider: string;
    display_name: string;
    protocol: string;
    default_base_url?: string | null;
    supports_tool_choice: boolean;
    default_max_tokens: number;
    base_url_required?: boolean;
    base_url_editable?: boolean;
    base_url_examples?: string[];
    auth_scheme?: string;
    probe_strategy?: string;
    capabilities?: {
        supports_tool_choice?: boolean;
    };
}

interface ProbeUiState {
    status: 'idle' | 'dirty' | 'testing' | 'test_success' | 'test_failed' | 'autofill_applied';
    message: string;
    detail?: string;
    appliedFields?: ('resolved_provider' | 'recommended_model' | 'normalized_base_url')[];
    result?: LLMProbeResult;
}

function LLMProbeStatusCard({ status, t }: { status: ProbeUiState; t: any }) {
    const palette = {
        idle: {
            color: 'var(--text-secondary)',
            background: 'rgba(148,163,184,0.08)',
            border: 'rgba(148,163,184,0.2)',
        },
        dirty: {
            color: 'rgb(180, 83, 9)',
            background: 'rgba(245, 158, 11, 0.12)',
            border: 'rgba(245, 158, 11, 0.28)',
        },
        testing: {
            color: 'rgb(29, 78, 216)',
            background: 'rgba(59, 130, 246, 0.12)',
            border: 'rgba(59, 130, 246, 0.28)',
        },
        test_success: {
            color: 'rgb(21, 128, 61)',
            background: 'rgba(34, 197, 94, 0.12)',
            border: 'rgba(34, 197, 94, 0.28)',
        },
        test_failed: {
            color: 'rgb(185, 28, 28)',
            background: 'rgba(239, 68, 68, 0.12)',
            border: 'rgba(239, 68, 68, 0.28)',
        },
        autofill_applied: {
            color: 'rgb(17, 94, 89)',
            background: 'rgba(20, 184, 166, 0.12)',
            border: 'rgba(20, 184, 166, 0.28)',
        },
    } as const;
    const tone = palette[status.status];
    const stateLabels = {
        idle: t('enterprise.llm.probeStates.idle', '\u5f85\u6d4b\u8bd5'),
        dirty: t('enterprise.llm.probeStates.dirty', '\u5f85\u91cd\u6d4b'),
        testing: t('enterprise.llm.probeStates.testing', '\u6d4b\u8bd5\u4e2d'),
        test_success: t('enterprise.llm.probeStates.test_success', '\u901a\u8fc7'),
        test_failed: t('enterprise.llm.probeStates.test_failed', '\u5931\u8d25'),
        autofill_applied: t('enterprise.llm.probeStates.autofill_applied', '\u5df2\u81ea\u52a8\u586b\u5199'),
    } as const;
    const autofillFieldLabels = {
        resolved_provider: t('enterprise.llm.autofillField.resolved_provider', '\u63d0\u4f9b\u5546'),
        recommended_model: t('enterprise.llm.autofillField.recommended_model', '\u6a21\u578b\u540d'),
        normalized_base_url: t('enterprise.llm.autofillField.normalized_base_url', 'Base URL'),
    } as const;

    return (
        <div style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '10px',
            border: `1px solid ${tone.border}`,
            background: tone.background,
            color: tone.color,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>
                    {t('enterprise.llm.probeStatusLabel', '\u8fde\u63a5\u63a2\u6d4b')}
                </div>
                <div style={{
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.5)',
                }}>
                    {stateLabels[status.status]}
                </div>
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
                {status.message}
            </div>
            {status.detail && (
                <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {status.detail}
                </div>
            )}
            {status.result?.gateway_hint && (
                <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    <strong>{t('enterprise.llm.gatewayHintLabel', '\u63a5\u53e3\u8bc6\u522b\uff1a')}</strong> {status.result.gateway_hint}
                </div>
            )}
            {status.result?.reply_preview && (
                <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    <strong>{t('enterprise.llm.replyPreviewLabel', '\u8fd4\u56de\u9884\u89c8\uff1a')}</strong> {status.result.reply_preview}
                </div>
            )}
            {!!status.appliedFields?.length && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('enterprise.llm.probeAppliedFields', {
                        defaultValue: '\u5df2\u81ea\u52a8\u586b\u5199\uff1a{{fields}}',
                        fields: status.appliedFields.map((field) => autofillFieldLabels[field]).join(' / '),
                    })}
                </div>
            )}
        </div>
    );
}

const FALLBACK_LLM_PROVIDERS: LLMProviderSpec[] = [
    { provider: 'deepseek', display_name: 'DeepSeek', protocol: 'openai_compatible', default_base_url: 'https://api.deepseek.com/v1', supports_tool_choice: true, default_max_tokens: 8192 },
    { provider: 'qwen', display_name: 'Qwen (DashScope)', protocol: 'openai_compatible', default_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', supports_tool_choice: true, default_max_tokens: 8192 },
    { provider: 'zhipu', display_name: 'Zhipu', protocol: 'openai_compatible', default_base_url: 'https://open.bigmodel.cn/api/paas/v4', supports_tool_choice: true, default_max_tokens: 8192 },
    { provider: 'kimi', display_name: 'Kimi (Moonshot)', protocol: 'openai_compatible', default_base_url: 'https://api.moonshot.cn/v1', supports_tool_choice: true, default_max_tokens: 8192 },
    { provider: 'baidu', display_name: 'Baidu (Qianfan)', protocol: 'openai_compatible', default_base_url: 'https://qianfan.baidubce.com/v2', supports_tool_choice: false, default_max_tokens: 4096 },
    { provider: 'openai', display_name: 'OpenAI', protocol: 'openai_compatible', default_base_url: 'https://api.openai.com/v1', supports_tool_choice: true, default_max_tokens: 16384 },
    { provider: 'anthropic', display_name: 'Anthropic', protocol: 'anthropic', default_base_url: 'https://api.anthropic.com', supports_tool_choice: false, default_max_tokens: 8192 },
    { provider: 'azure', display_name: 'Azure OpenAI', protocol: 'openai_compatible', default_base_url: '', supports_tool_choice: true, default_max_tokens: 16384 },
    { provider: 'minimax', display_name: 'MiniMax', protocol: 'openai_compatible', default_base_url: 'https://api.minimaxi.com/v1', supports_tool_choice: true, default_max_tokens: 16384 },
    { provider: 'gemini', display_name: 'Gemini', protocol: 'gemini', default_base_url: 'https://generativelanguage.googleapis.com/v1beta', supports_tool_choice: true, default_max_tokens: 8192 },
    { provider: 'openrouter', display_name: 'OpenRouter', protocol: 'openai_compatible', default_base_url: 'https://openrouter.ai/api/v1', supports_tool_choice: true, default_max_tokens: 4096 },
    { provider: 'vllm', display_name: 'vLLM', protocol: 'openai_compatible', default_base_url: 'http://localhost:8000/v1', supports_tool_choice: true, default_max_tokens: 4096 },
    { provider: 'ollama', display_name: 'Ollama', protocol: 'openai_compatible', default_base_url: 'http://localhost:11434/v1', supports_tool_choice: true, default_max_tokens: 4096 },
    { provider: 'sglang', display_name: 'SGLang', protocol: 'openai_compatible', default_base_url: 'http://localhost:30000/v1', supports_tool_choice: true, default_max_tokens: 4096 },
    { provider: 'custom', display_name: 'Custom', protocol: 'openai_compatible', default_base_url: '', supports_tool_choice: true, default_max_tokens: 4096 },
];

const PREFERRED_PROVIDER_ORDER = ['deepseek', 'qwen', 'zhipu', 'kimi', 'baidu', 'openai', 'anthropic', 'custom'];

const FEISHU_SYNC_PERM_JSON = `{
  "scopes": {
    "tenant": [
      "contact:contact.base:readonly",
      "contact:department.base:readonly",
      "contact:user.base:readonly",
      "contact:user.employee_id:readonly"
    ],
    "user": []
  }
}`;


// 鈹€鈹€鈹€ Department Tree 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function DeptTree({ departments, parentId, selectedDept, onSelect, level }: {
    departments: any[]; parentId: string | null; selectedDept: string | null;
    onSelect: (id: string | null) => void; level: number;
}) {
    const children = departments.filter((d: any) =>
        parentId === null ? !d.parent_id : d.parent_id === parentId
    );
    if (children.length === 0) return null;
    return (
        <>
            {children.map((d: any) => (
                <div key={d.id}>
                    <div
                        style={{
                            padding: '5px 8px',
                            paddingLeft: `${8 + level * 16}px`,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            marginBottom: '1px',
                            background: selectedDept === d.id ? 'rgba(224,238,238,0.12)' : 'transparent',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                        onClick={() => onSelect(d.id)}
                    >
                        <div>
                            <span style={{ color: 'var(--text-tertiary)', marginRight: '4px', fontSize: '11px' }}>
                                {departments.some((c: any) => c.parent_id === d.id) ? '?' : '?'}
                            </span>
                            {d.name}
                        </div>
                        {d.member_count !== undefined && (
                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                {d.member_count}
                            </span>
                        )}
                    </div>
                    <DeptTree departments={departments} parentId={d.id} selectedDept={selectedDept} onSelect={onSelect} level={level + 1} />
                </div>
            ))}
        </>
    );
}

// 鈹€鈹€鈹€ SSO Channel Section 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function SsoChannelSection({ idpType, existingProvider, tenant, t }: {
    idpType: string; existingProvider: any; tenant: any; t: any;
}) {
    const qc = useQueryClient();
    const [liveDomain, setLiveDomain] = useState<string>(existingProvider?.sso_domain || tenant?.sso_domain || '');
    const [ssoError, setSsoError] = useState<string>('');
    const [toggling, setToggling] = useState(false);

    useEffect(() => {
        setLiveDomain(existingProvider?.sso_domain || tenant?.sso_domain || '');
    }, [existingProvider?.sso_domain, tenant?.sso_domain]);

    const ssoEnabled = existingProvider ? !!existingProvider.sso_login_enabled : false;
    const domain = liveDomain;
    const callbackUrl = domain ? (domain.startsWith('http') ? `${domain}/api/auth/${idpType}/callback` : `https://${domain}/api/auth/${idpType}/callback`) : '';

    const handleSsoToggle = async () => {
        if (!existingProvider) {
            alert(t('enterprise.identity.saveFirst', 'Please save the configuration first to enable SSO.'));
            return;
        }
        const newVal = !ssoEnabled;
        setToggling(true);
        setSsoError('');
        try {
            const result = await fetchJson<any>(`/enterprise/identity-providers/${existingProvider.id}`, {
                method: 'PUT',
                body: JSON.stringify({ sso_login_enabled: newVal }),
            });
            if (result?.sso_domain) setLiveDomain(result.sso_domain);
            qc.invalidateQueries({ queryKey: ['identity-providers'] });
            if (tenant?.id) qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
        } catch (e: any) {
            const msg = e?.message || '';
            if (msg.includes('IP address') || msg.includes('multi-tenant')) {
                setSsoError(t('enterprise.identity.ssoIpConflict', 'IP \u6a21\u5f0f\u4e0b\u53ea\u80fd\u6709\u4e00\u4e2a\u4f01\u4e1a\u5f00\u542f SSO\uff0c\u5f53\u524d\u5df2\u6709\u5176\u4ed6\u4f01\u4e1a\u5360\u7528\u3002'));
            } else {
                setSsoError(msg || t('enterprise.identity.ssoToggleFailed', 'Failed to toggle SSO'));
            }
        } finally {
            setToggling(false);
        }
    };

    return (
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px dashed var(--border-subtle)' }}>
            {/* SSO Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ssoError ? '8px' : '16px' }}>
                <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{t('enterprise.identity.ssoLoginToggle', 'SSO Login')}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {t('enterprise.identity.ssoLoginToggleHint', 'Allow users to log in via this identity provider.')}
                    </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', flexShrink: 0, opacity: (existingProvider && !toggling) ? 1 : 0.5 }}>
                    <input
                        type="checkbox"
                        checked={ssoEnabled}
                        onChange={handleSsoToggle}
                        disabled={!existingProvider || toggling}
                        style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        borderRadius: '20px', cursor: (existingProvider && !toggling) ? 'pointer' : 'not-allowed',
                        background: ssoEnabled ? 'var(--accent-primary)' : 'var(--border-subtle)',
                        transition: '0.2s',
                    }}>
                        <span style={{
                            position: 'absolute', left: ssoEnabled ? '18px' : '2px', top: '2px',
                            width: '16px', height: '16px', borderRadius: '50%',
                            background: '#fff', transition: '0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }} />
                    </span>
                </label>
            </div>
            {ssoError && (
                <div style={{ fontSize: '12px', color: 'var(--error)', marginBottom: '12px', padding: '6px 10px', background: 'rgba(var(--error-rgb,220,38,38),0.08)', borderRadius: '6px' }}>
                    {ssoError}
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        {t('enterprise.identity.ssoSubdomain', 'SSO Login URL')}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            flex: 1, maxWidth: '400px',
                            padding: '8px 12px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: domain ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : t('enterprise.identity.ssoUrlEmpty', 'SSO URL will appear here after saving')}
                        </div>
                        <LinearCopyButton
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', width: 'auto', minWidth: '70px', height: '33px' }}
                            disabled={!domain}
                            textToCopy={domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : ''}
                            label={t('common.copy', 'Copy')}
                            copiedLabel="Copied"
                        />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {t('enterprise.identity.ssoSubdomainHint', 'Share this URL with your team. SSO login buttons will appear when they visit this address.')}
                    </div>
                </div>
                <div>
                    <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        {t('enterprise.identity.callbackUrl', 'Redirect URL (paste this in your app settings)')}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            flex: 1, maxWidth: '400px',
                            padding: '8px 12px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: callbackUrl ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {callbackUrl || t('enterprise.identity.ssoUrlEmpty', 'SSO URL will appear here after saving')}
                        </div>
                        <LinearCopyButton
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', width: 'auto', minWidth: '70px', height: '33px' }}
                            disabled={!callbackUrl}
                            textToCopy={callbackUrl}
                            label={t('common.copy', 'Copy')}
                            copiedLabel="Copied"
                        />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {t('enterprise.identity.callbackUrlHint', "Add this URL as the OAuth redirect URI in your identity provider's app configuration.")}
                    </div>
                </div>
            </div>
        </div>
    );
}


// 鈹€鈹€鈹€ Org & Identity Tab 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function OrgTab({ tenant }: { tenant: any }) {
    const { t } = useTranslation();
    const qc = useQueryClient();




    const SsoStatus = () => {
        const [isExpanded, setIsExpanded] = useState(!!tenant?.sso_enabled);
        const [ssoEnabled, setSsoEnabled] = useState(!!tenant?.sso_enabled);
        const [ssoDomain, setSsoDomain] = useState(tenant?.sso_domain || '');
        const [saving, setSaving] = useState(false);
        const [error, setError] = useState('');

        useEffect(() => {
            setSsoEnabled(!!tenant?.sso_enabled);
            setSsoDomain(tenant?.sso_domain || '');
            setIsExpanded(!!tenant?.sso_enabled);
        }, [tenant]);

        const handleSave = async (forceEnabled?: boolean) => {
            if (!tenant?.id) return;
            const targetEnabled = forceEnabled !== undefined ? forceEnabled : ssoEnabled;
            setSaving(true);
            setError('');
            try {
                await fetchJson(`/tenants/${tenant.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        sso_enabled: targetEnabled,
                        sso_domain: targetEnabled ? (ssoDomain.trim() || null) : null,
                    }),
                });
                qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
            } catch (e: any) {
                setError(e.message || 'Failed to update SSO configuration');
            }
            setSaving(false);
        };

        const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
            const checked = e.target.checked;
            setSsoEnabled(checked);
            setIsExpanded(checked);
            if (!checked) {
                // auto-save when disabling
                handleSave(false);
            }
        };

        return (
            <div className="card" style={{ marginBottom: '24px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                            {t('enterprise.identity.ssoTitle', 'Enterprise SSO')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {t('enterprise.identity.ssoDisabledHint', 'Seamless enterprise login via Single Sign-On.')}
                        </div>
                    </div>
                    <div>
                        <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                            <input
                                type="checkbox"
                                checked={ssoEnabled}
                                onChange={handleToggle}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                borderRadius: '20px', cursor: 'pointer',
                                background: ssoEnabled ? 'var(--accent-primary)' : 'var(--border-subtle)',
                                transition: '0.2s'
                            }}>
                                <span style={{
                                    position: 'absolute', left: ssoEnabled ? '18px' : '2px', top: '2px',
                                    width: '16px', height: '16px', borderRadius: '50%',
                                    background: '#fff', transition: '0.2s',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                }} />
                            </span>
                        </label>
                    </div>
                </div>

                {isExpanded && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <label className="form-label" style={{ fontSize: '12px', marginBottom: '8px' }}>
                                {t('enterprise.identity.ssoDomain', 'Custom Access Domain')}
                            </label>
                            <input
                                className="form-input"
                                value={ssoDomain}
                                onChange={e => setSsoDomain(e.target.value)}
                                placeholder={t('enterprise.identity.ssoDomainPlaceholder', 'e.g. acme.clawith.com')}
                                style={{ fontSize: '13px', width: '100%', maxWidth: '400px' }}
                            />
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                                {t('enterprise.identity.ssoDomainDesc', 'The custom domain users will use to log in via SSO.')}
                            </div>
                        </div>

                        {error && <div style={{ color: 'var(--error)', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={saving || !ssoDomain.trim()}>
                                {saving ? t('common.loading') : t('common.save', 'Save Configuration')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const [syncing, setSyncing] = useState<string | null>(null);
    const [syncResult, setSyncResult] = useState<any>(null);
    const [memberSearch, setMemberSearch] = useState('');
    const [selectedDept, setSelectedDept] = useState<string | null>(null);
    const [expandedType, setExpandedType] = useState<string | null>(null);
    const [savingProvider, setSavingProvider] = useState(false);
    const [saveProviderOk, setSaveProviderOk] = useState(false);

    // Identity Providers state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [useOAuth2Form, setUseOAuth2Form] = useState(false);
    const [form, setForm] = useState({
        provider_type: 'feishu',
        name: '',
        config: {} as any,
        app_id: '',
        app_secret: '',
        authorize_url: '',
        token_url: '',
        user_info_url: '',
        scope: 'openid profile email'
    });

    const currentTenantId = localStorage.getItem('current_tenant_id') || '';

    // Queries
    const { data: providers = [] } = useQuery({
        queryKey: ['identity-providers', currentTenantId],
        queryFn: () => fetchJson<any[]>(`/enterprise/identity-providers${currentTenantId ? `?tenant_id=${currentTenantId}` : ''}`),
    });

    const { data: departmentsData = { items: [], total_member: 0 } } = useQuery({
        queryKey: ['org-departments', currentTenantId, editingId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (currentTenantId) params.set('tenant_id', currentTenantId);
            if (editingId) params.set('provider_id', editingId);
            return fetchJson<{ items: any[]; total_member: number }>(`/enterprise/org/departments?${params}`);
        },
        enabled: !!editingId,
    });

    const { data: members = [] } = useQuery({
        queryKey: ['org-members', selectedDept, memberSearch, currentTenantId, editingId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (selectedDept) params.set('department_id', selectedDept);
            if (memberSearch) params.set('search', memberSearch);
            if (currentTenantId) params.set('tenant_id', currentTenantId);
            if (editingId) params.set('provider_id', editingId);
            return fetchJson<any[]>(`/enterprise/org/members?${params}`);
        },
        enabled: !!editingId,
    });

    // Mutations
    const addProvider = useMutation({
        mutationFn: (data: any) => {
            const payload = { ...data, tenant_id: currentTenantId, is_active: true };
            if (data.provider_type === 'oauth2' && useOAuth2Form) {
                return fetchJson('/enterprise/identity-providers/oauth2', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }
            return fetchJson('/enterprise/identity-providers', { method: 'POST', body: JSON.stringify(payload) });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['identity-providers'] });
            setUseOAuth2Form(false);
            setSavingProvider(false);
            setSaveProviderOk(true);
            setTimeout(() => setSaveProviderOk(false), 2500);
        },
        onError: () => setSavingProvider(false),
    });

    const updateProvider = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => {
            if (data.provider_type === 'oauth2' && useOAuth2Form) {
                return fetchJson(`/enterprise/identity-providers/${id}/oauth2`, {
                    method: 'PATCH',
                    body: JSON.stringify(data)
                });
            }
            return fetchJson(`/enterprise/identity-providers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['identity-providers'] });
            setUseOAuth2Form(false);
            setSavingProvider(false);
            setSaveProviderOk(true);
            setTimeout(() => setSaveProviderOk(false), 2500);
        },
        onError: () => setSavingProvider(false),
    });

    const deleteProvider = useMutation({
        mutationFn: (id: string) => fetchJson(`/enterprise/identity-providers/${id}`, { method: 'DELETE' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['identity-providers'] }),
    });

    const triggerSync = async (providerId: string) => {
        setSyncing(providerId);
        setSyncResult(null);
        try {
            const result = await fetchJson<any>(`/enterprise/org/sync?provider_id=${providerId}`, { method: 'POST' });
            setSyncResult({ ...result, providerId });
            qc.invalidateQueries({ queryKey: ['org-departments'] });
            qc.invalidateQueries({ queryKey: ['org-members'] });
            qc.invalidateQueries({ queryKey: ['identity-providers'] });
        } catch (e: any) {
            setSyncResult({ error: e.message, providerId });
        }
        setSyncing(null);
    };

    const initOAuth2FromConfig = (config: any) => ({
        app_id: config?.app_id || config?.client_id || '',
        app_secret: config?.app_secret || config?.client_secret || '',
        authorize_url: config?.authorize_url || '',
        token_url: config?.token_url || '',
        user_info_url: config?.user_info_url || '',
        scope: config?.scope || 'openid profile email'
    });

    const save = () => {
        setSavingProvider(true);
        setSaveProviderOk(false);
        if (editingId) {
            updateProvider.mutate({ id: editingId, data: form });
        } else {
            addProvider.mutate(form);
        }
    };

    const IDP_TYPES = [
        { type: 'feishu', name: 'Feishu', desc: 'Feishu / Lark Integration', icon: <img src="/feishu.png" width="20" height="20" alt="Feishu" /> },
        { type: 'wecom', name: 'WeCom', desc: 'WeChat Work Integration', icon: <img src="/wecom.png" width="20" height="20" style={{ borderRadius: '4px' }} alt="WeCom" /> },
        { type: 'dingtalk', name: 'DingTalk', desc: 'DingTalk App Integration', icon: <img src="/dingtalk.png" width="20" height="20" style={{ borderRadius: '4px' }} alt="DingTalk" /> },
        { type: 'oauth2', name: 'OAuth2', desc: 'Generic OIDC Provider', icon: <div style={{ width: 20, height: 20, background: 'var(--accent-primary)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>O</div> }
    ];

    const handleExpand = (type: string, existingProvider?: any) => {
        if (expandedType === type) {
            setExpandedType(null);
            return;
        }
        setExpandedType(type);
        setEditingId(existingProvider ? existingProvider.id : null);
        setUseOAuth2Form(type === 'oauth2');

        if (existingProvider) {
            setForm({ ...existingProvider, ...(type === 'oauth2' ? initOAuth2FromConfig(existingProvider.config) : {}) });
        } else {
            const defaults: any = {
                feishu: { app_id: '', app_secret: '', corp_id: '' },
                dingtalk: { app_key: '', app_secret: '', corp_id: '' },
                wecom: { corp_id: '', secret: '', agent_id: '', bot_id: '', bot_secret: '' },
            };
            const nameMap: Record<string, string> = { feishu: 'Feishu', wecom: 'WeCom', dingtalk: 'DingTalk', oauth2: 'OAuth2' };
            setForm({
                provider_type: type,
                name: nameMap[type] || type,
                config: defaults[type] || {},
                app_id: '', app_secret: '', authorize_url: '', token_url: '', user_info_url: '',
                scope: 'openid profile email'
            });
        }
        setSelectedDept(null);
        setMemberSearch('');
    };

    const renderForm = (type: string, existingProvider?: any) => {
        return (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                {/* Setup Guide moved to the top */}
                {['feishu', 'dingtalk', 'wecom'].includes(type) && (
                    <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '20px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--text-primary)' }}>
                            {t('enterprise.org.syncSetupGuide', 'Setup Guide & Required Permissions')}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {type === 'feishu' && (
                                <>
                                    {Array.from({ length: 7 }).map((_, i) => (
                                        <div key={i} style={{ marginBottom: '6px' }}>
                                            {i + 1}. {t(`enterprise.org.syncGuide.feishu.step${i + 1}`)}
                                        </div>
                                    ))}
                                    <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                                        {t('enterprise.org.feishuGuideText', 'Permission JSON (bulk import)')}
                                    </div>
                                    <div style={{ position: 'relative', background: '#282c34', borderRadius: '6px', padding: '12px', paddingRight: '40px', color: '#abb2bf', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                                        <LinearCopyButton
                                            className="btn btn-ghost"
                                            style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '10px', color: '#abb2bf', padding: '4px 8px', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', border: 'none', borderRadius: '4px', height: 'fit-content', minWidth: '60px' }}
                                            textToCopy={FEISHU_SYNC_PERM_JSON}
                                            label="Copy"
                                            copiedLabel="Copied"
                                        />
                                        {FEISHU_SYNC_PERM_JSON}
                                    </div>
                                    <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
                                        {t('enterprise.org.feishuGuideWarning', 'Note: You must re-publish the app each time you add new permissions.')}
                                    </div>
                                </>
                            )}
                            {type === 'dingtalk' && (
                                <>
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} style={{ marginBottom: '6px' }}>
                                            {i + 1}. {t(`enterprise.org.syncGuide.dingtalk.step${i + 1}`)}
                                        </div>
                                    ))}
                                </>
                            )}
                            {type === 'wecom' && (
                                <>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} style={{ marginBottom: '6px' }}>
                                            {i + 1}. {t(`enterprise.org.syncGuide.wecom.step${i + 1}`)}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Name field only for oauth2 */}
                {type === 'oauth2' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div className="form-group">
                            <label className="form-label">{t('enterprise.identity.name')}</label>
                            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        </div>
                    </div>
                )}

                {type === 'oauth2' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group">
                            <label className="form-label">Client ID</label>
                            <input className="form-input" value={form.app_id} onChange={e => setForm({ ...form, app_id: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Client Secret</label>
                            <input className="form-input" type="password" value={form.app_secret} onChange={e => setForm({ ...form, app_secret: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Authorize URL</label>
                            <input className="form-input" value={form.authorize_url} onChange={e => setForm({ ...form, authorize_url: e.target.value })} />
                        </div>
                    </div>
                ) : type === 'wecom' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                {t('enterprise.identity.providerHints.wecom')}
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Corp ID</label>
                            <input className="form-input" value={form.config.corp_id || ''} onChange={e => setForm({ ...form, config: { ...form.config, corp_id: e.target.value } })} placeholder="wwxxxxxxxxxxxx" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Secret</label>
                            <input className="form-input" type="password" value={form.config.secret || ''} onChange={e => setForm({ ...form, config: { ...form.config, secret: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Agent ID (Optional)</label>
                            <input className="form-input" value={form.config.agent_id || ''} onChange={e => setForm({ ...form, config: { ...form.config, agent_id: e.target.value } })} />
                        </div>
                        <div style={{ gridColumn: '1 / -1', height: '1px', background: 'var(--border-subtle)', margin: '8px 0' }} />
                        <div className="form-group">
                            <label className="form-label">Bot ID (Intelligent Robot)</label>
                            <input className="form-input" value={form.config.bot_id || ''} onChange={e => setForm({ ...form, config: { ...form.config, bot_id: e.target.value } })} placeholder="aibXXXXXXXXXXXX" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Bot Secret</label>
                            <input className="form-input" type="password" value={form.config.bot_secret || ''} onChange={e => setForm({ ...form, config: { ...form.config, bot_secret: e.target.value } })} />
                        </div>
                    </div>
                ) : type === 'dingtalk' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t('enterprise.identity.providerHints.dingtalk')}</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">App Key</label>
                            <input className="form-input" value={form.config.app_key || ''} onChange={e => setForm({ ...form, config: { ...form.config, app_key: e.target.value } })} placeholder="dingxxxxxxxxxxxx" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">App Secret</label>
                            <input className="form-input" type="password" value={form.config.app_secret || ''} onChange={e => setForm({ ...form, config: { ...form.config, app_secret: e.target.value } })} />
                        </div>
                    </div>
                ) : type === 'feishu' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t('enterprise.identity.providerHints.feishu')}</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">App ID</label>
                            <input className="form-input" value={form.config.app_id || ''} onChange={e => setForm({ ...form, config: { ...form.config, app_id: e.target.value } })} placeholder="cli_xxxxxxxxxxxx" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">App Secret</label>
                            <input className="form-input" type="password" value={form.config.app_secret || ''} onChange={e => setForm({ ...form, config: { ...form.config, app_secret: e.target.value } })} />
                        </div>
                    </div>
                ) : null}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                    <button className="btn btn-primary btn-sm" onClick={save} disabled={savingProvider}>
                        {savingProvider ? t('common.loading') : t('common.save', 'Save')}
                    </button>
                    {saveProviderOk && (
                        <span style={{ fontSize: '12px', color: 'var(--success)' }}>Saved</span>
                    )}
                    {existingProvider && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => confirm('Are you sure you want to delete this configuration?') && deleteProvider.mutate(existingProvider.id)}>
                            {t('common.delete', 'Delete')}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderOrgBrowser = (p: any) => {
        return (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px dashed var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 500, fontSize: '14px' }}>{t('enterprise.org.orgBrowser', 'Organization Browser')}</div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        {['feishu', 'dingtalk', 'wecom'].includes(p.provider_type) && (
                            <button className="btn btn-secondary btn-sm" style={{ fontSize: '12px' }} onClick={() => triggerSync(p.id)} disabled={!!syncing}>
                                {syncing === p.id ? 'Syncing...' : 'Sync Directory'}
                            </button>
                        )}
                        {syncResult && (
                            <div style={{ padding: '6px 10px', borderRadius: '4px', fontSize: '11px', background: syncResult.error ? 'rgba(255,0,0,0.1)' : 'rgba(0,200,0,0.1)' }}>
                                {syncResult.error ? `Error: ${syncResult.error}` : `Sync complete: ${syncResult.users_created || 0} users created, ${syncResult.profiles_synced || 0} profiles synced.`}
                            </div>
                        )}
                    </div>
                </div>


                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ width: '260px', borderRight: '1px solid var(--border-subtle)', paddingRight: '16px', maxHeight: '500px', overflowY: 'auto' }}>
                        <div style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: !selectedDept ? 'rgba(224,238,238,0.1)' : 'transparent' }} onClick={() => setSelectedDept(null)}>
                            {t('common.all')}
                            {departmentsData.total_member > 0 && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>({departmentsData.total_member})</span>}
                        </div>
                        <DeptTree departments={departmentsData.items} parentId={null} selectedDept={selectedDept} onSelect={setSelectedDept} level={0} />
                    </div>

                    <div style={{ flex: 1 }}>
                        <input className="form-input" placeholder={t("enterprise.org.searchMembers")} value={memberSearch} onChange={e => setMemberSearch(e.target.value)} style={{ marginBottom: '12px' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '400px', overflowY: 'auto' }}>
                            {members.map((m: any) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}>{m.name?.[0]}</div>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{m.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                            {m.provider_type && <span style={{ marginRight: '4px', padding: '1px 4px', borderRadius: '3px', background: 'var(--bg-secondary)', fontSize: '10px' }}>{m.provider_type}</span>}
                                            {m.title || '-'} / {m.department_path || m.department_id || '-'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {members.length === 0 && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>{t('enterprise.org.noMembers')}</div>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* SSO status is now derived from per-channel toggles 鈥?no global switch */}

            {/* 1. Identity Providers Section */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                        {t('enterprise.identity.title', 'Organization & Directory Sync')}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Configure enterprise directory synchronization and Identity Provider settings.
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {IDP_TYPES.map((idp, index) => {
                        const existingProvider = providers.find((p: any) => p.provider_type === idp.type);
                        const isExpanded = expandedType === idp.type;

                        return (
                            <div key={idp.type} style={{ borderBottom: index < IDP_TYPES.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                <div
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', background: isExpanded ? 'var(--bg-secondary)' : 'transparent', transition: 'background 0.2s' }}
                                    onClick={() => handleExpand(idp.type, existingProvider)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {idp.icon}
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '14px' }}>{idp.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{idp.desc}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {existingProvider ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '8px' }}>
                                                <span className="badge badge-success" style={{ fontSize: '10px' }}>Active</span>
                                                {existingProvider.last_synced_at && (
                                                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                                        Synced: {new Date(existingProvider.last_synced_at).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="badge badge-secondary" style={{ fontSize: '10px' }}>Not configured</span>
                                        )}
                                        <div style={{ color: 'var(--text-tertiary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: '12px' }}>
                                            ?
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div style={{ padding: '0 20px 20px', background: 'var(--bg-secondary)' }}>
                                        {renderForm(idp.type, existingProvider)}

                                        {/* Per-channel SSO Login URLs & Toggle */}
                                        {['feishu', 'dingtalk', 'wecom', 'oauth2'].includes(idp.type) && (
                                            <SsoChannelSection
                                                idpType={idp.type}
                                                existingProvider={existingProvider}
                                                tenant={tenant}
                                                t={t}
                                            />
                                        )}
                                        {existingProvider && renderOrgBrowser(existingProvider)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}


// 鈹€鈹€鈹€ Theme Color Picker 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function ThemeColorPicker() {
    const { t } = useTranslation();
    const [currentColor, setCurrentColor] = useState(getSavedAccentColor() || '');
    const [customHex, setCustomHex] = useState('');

    const apply = (hex: string) => {
        setCurrentColor(hex);
        saveAccentColor(hex);
    };

    const handleReset = () => {
        setCurrentColor('');
        setCustomHex('');
        resetAccentColor();
    };

    const handleCustom = () => {
        const hex = customHex.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            apply(hex);
        }
    };

    return (
        <div className="card" style={{ marginTop: '16px', marginBottom: '16px' }}>
            <h4 style={{ marginBottom: '12px' }}>{t('enterprise.config.themeColor')}</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {PRESET_COLORS.map(c => (
                    <div
                        key={c.hex}
                        onClick={() => apply(c.hex)}
                        title={c.name}
                        style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: c.hex, cursor: 'pointer',
                            border: currentColor === c.hex ? '2px solid var(--text-primary)' : '2px solid transparent',
                            outline: currentColor === c.hex ? '2px solid var(--bg-primary)' : 'none',
                            transition: 'all 120ms ease',
                        }}
                    />
                ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                    className="input"
                    value={customHex}
                    onChange={e => setCustomHex(e.target.value)}
                    placeholder="#hex"
                    style={{ width: '120px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                    onKeyDown={e => e.key === 'Enter' && handleCustom()}
                />
                <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={handleCustom}>Apply</button>
                {currentColor && (
                    <button className="btn btn-ghost" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }} onClick={handleReset}>Reset</button>
                )}
                {currentColor && (
                    <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: currentColor, border: '1px solid var(--border-default)' }} />
                )}
            </div>
        </div>
    );
}





// Preset common models per provider
const PRESET_MODELS: Record<string, string[]> = {
    'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
    'anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    'google': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
    'deepseek': ['deepseek-chat', 'deepseek-reasoner'],
    'ollama': ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'gemma2'],
    'azure': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
};

// 鈹€鈹€鈹€ Main Component 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鈹€鈹€鈹€ Enterprise KB Browser 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function EnterpriseKBBrowser({ onRefresh }: { onRefresh: () => void; refreshKey: number }) {
    const kbAdapter: FileBrowserApi = {
        list: (path) => enterpriseApi.kbFiles(path),
        read: (path) => enterpriseApi.kbRead(path),
        write: (path, content) => enterpriseApi.kbWrite(path, content),
        delete: (path) => enterpriseApi.kbDelete(path),
        upload: (file, path) => enterpriseApi.kbUpload(file, path),
    };
    return <FileBrowser api={kbAdapter} features={{ upload: true, newFolder: true, edit: true, delete: true, directoryNavigation: true }} onRefresh={onRefresh} />;
}

// 鈹€鈹€鈹€ Skills Tab 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function CatalogFilterPillRow({
    label,
    items,
    activeKey,
    onSelect,
}: {
    label: string;
    items: Array<{ key: string; label: string; count: number }>;
    activeKey: string;
    onSelect: (key: string) => void;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                {label}
            </span>
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onSelect(item.key)}
                    style={{
                        minWidth: 'auto',
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: `1px solid ${activeKey === item.key ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                        background: activeKey === item.key ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                    }}
                >
                    <span>{item.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {item.count}
                    </span>
                </button>
            ))}
        </div>
    );
}

function SkillsTab() {
    const { t, i18n } = useTranslation();
    const isChineseUi = i18n.language?.toLowerCase().startsWith('zh');
    const [refreshKey, setRefreshKey] = useState(0);
    const [libraryView, setLibraryView] = useState<'catalog' | 'files'>('catalog');
    const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
    const [templateCatalogFilter, setTemplateCatalogFilter] = useState<'all' | 'pack-linked' | 'high-autonomy' | 'validated'>('all');
    const [skillPackCatalogFilter, setSkillPackCatalogFilter] = useState<'all' | 'tool-required' | 'role-linked' | 'high-risk'>('all');
    const [templateCatalogSpotlight, setTemplateCatalogSpotlight] = useState<string | null>(null);
    const [skillPackCatalogSpotlight, setSkillPackCatalogSpotlight] = useState<string | null>(null);
    const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<DuoduoTemplateLibraryItem | null>(null);
    const [selectedSkillPackDetail, setSelectedSkillPackDetail] = useState<SkillPackCatalogItem | null>(null);
    const [showClawhubModal, setShowClawhubModal] = useState(false);
    const [showUrlModal, setShowUrlModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);
    const [urlInput, setUrlInput] = useState('');
    const [urlPreview, setUrlPreview] = useState<any | null>(null);
    const [urlPreviewing, setUrlPreviewing] = useState(false);
    const [urlImporting, setUrlImporting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; source: string; masked: string; clawhub_configured?: boolean; clawhub_masked?: string } | null>(null);
    const [savingToken, setSavingToken] = useState(false);
    const [clawhubKeyInput, setClawhubKeyInput] = useState('');
    const [savingClawhubKey, setSavingClawhubKey] = useState(false);
    const templateCatalogSectionRef = useRef<HTMLDivElement | null>(null);
    const skillPackCatalogSectionRef = useRef<HTMLDivElement | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const { data: duoduoTemplateLibrary, isLoading: templateLibraryLoading } = useQuery<DuoduoTemplateLibraryResponse>({
        queryKey: ['duoduo-template-library', 'enterprise-skills-tab'],
        queryFn: () => enterpriseApi.duoduoTemplateLibrary(),
    });
    const { data: duoduoSkillPackCatalog, isLoading: skillPackCatalogLoading } = useQuery({
        queryKey: ['duoduo-skill-packs', 'enterprise-skills-tab'],
        queryFn: () => enterpriseApi.duoduoSkillPacks(),
    });
    const { data: librarySkills = [] } = useQuery<SkillLibraryItem[]>({
        queryKey: ['global-skills', 'enterprise-skills-tab', refreshKey],
        queryFn: skillApi.list,
    });

    const adapter: FileBrowserApi = useMemo(() => ({
        list: (path: string) => skillApi.browse.list(path),
        read: (path: string) => skillApi.browse.read(path),
        write: (path: string, content: string) => skillApi.browse.write(path, content),
        delete: (path: string) => skillApi.browse.delete(path),
    }), []);
    const templateCards = duoduoTemplateLibrary?.items ?? [];
    const skillPackCards = duoduoSkillPackCatalog?.items ?? [];
    const scenarioLabel = duoduoTemplateLibrary?.scenario?.display_name_zh || duoduoSkillPackCatalog?.scenario?.display_name_zh || '';
    const packLabelById = useMemo(
        () => Object.fromEntries(
            skillPackCards.map((pack: SkillPackCatalogItem) => [
                pack.pack_id,
                isChineseUi ? (pack.display_name_zh || pack.display_name_en) : (pack.display_name_en || pack.display_name_zh),
            ]),
        ),
        [isChineseUi, skillPackCards],
    );
    const templateLabelByCanonical = useMemo(
        () => Object.fromEntries(
            templateCards.map((item: DuoduoTemplateLibraryItem) => [
                item.canonical_name,
                isChineseUi ? (item.display_name_zh || item.canonical_name) : item.canonical_name,
            ]),
        ),
        [isChineseUi, templateCards],
    );
    const skillLabelByFolder = useMemo(
        () => Object.fromEntries(
            librarySkills.map((skill: SkillLibraryItem) => [
                skill.folder_name,
                isChineseUi ? (skill.display_name_zh || skill.name) : skill.name,
            ]),
        ),
        [isChineseUi, librarySkills],
    );
    const skillPackById = useMemo(
        () => Object.fromEntries(
            skillPackCards.map((pack: SkillPackCatalogItem) => [pack.pack_id, pack]),
        ),
        [skillPackCards],
    );
    const catalogLoading = templateLibraryLoading || skillPackCatalogLoading;
    const coordinationPatternById = useMemo(
        () => Object.fromEntries(
            (duoduoTemplateLibrary?.coordination_patterns ?? []).map((pattern: DuoduoCoordinationPattern) => [pattern.pattern_id, pattern]),
        ),
        [duoduoTemplateLibrary?.coordination_patterns],
    );
    const sourceById = useMemo(
        () => Object.fromEntries(
            (duoduoTemplateLibrary?.sources ?? []).map((source) => [source.source_id, source]),
        ),
        [duoduoTemplateLibrary?.sources],
    );
    const templatesByPackId = useMemo(
        () => Object.fromEntries(
            skillPackCards.map((pack: SkillPackCatalogItem) => [
                pack.pack_id,
                templateCards.filter((item: DuoduoTemplateLibraryItem) => item.recommended_skill_packs.includes(pack.pack_id)),
            ]),
        ),
        [skillPackCards, templateCards],
    );
    const filteredTemplateCards = useMemo(
        () => filterTemplateCatalog(templateCards, {
            query: catalogSearchQuery,
            filter: templateCatalogFilter,
            packLabelById,
        }),
        [catalogSearchQuery, packLabelById, templateCards, templateCatalogFilter],
    );
    const filteredSkillPackCards = useMemo(
        () => filterSkillPackCatalog(skillPackCards, {
            query: catalogSearchQuery,
            filter: skillPackCatalogFilter,
            templateLabelByCanonical,
            skillLabelByFolder,
        }),
        [catalogSearchQuery, skillLabelByFolder, skillPackCards, skillPackCatalogFilter, templateLabelByCanonical],
    );
    const templateCatalogStats = useMemo(
        () => buildTemplateCatalogStats(templateCards),
        [templateCards],
    );
    const skillPackCatalogStats = useMemo(
        () => buildSkillPackCatalogStats(skillPackCards),
        [skillPackCards],
    );
    const spotlightedTemplateCards = useMemo(
        () => focusTemplateCatalog(templateCards, templateCatalogSpotlight),
        [templateCards, templateCatalogSpotlight],
    );
    const spotlightedSkillPackCards = useMemo(
        () => focusSkillPackCatalog(skillPackCards, skillPackCatalogSpotlight),
        [skillPackCards, skillPackCatalogSpotlight],
    );
    const visibleTemplateCards = templateCatalogSpotlight ? spotlightedTemplateCards : filteredTemplateCards;
    const visibleSkillPackCards = skillPackCatalogSpotlight ? spotlightedSkillPackCards : filteredSkillPackCards;
    const templateSpotlightLabel = templateCatalogSpotlight
        ? (templateLabelByCanonical[templateCatalogSpotlight] || templateCatalogSpotlight)
        : '';
    const skillPackSpotlightLabel = skillPackCatalogSpotlight
        ? (packLabelById[skillPackCatalogSpotlight] || skillPackCatalogSpotlight)
        : '';
    const catalogManagementLens = useMemo(
        () => buildCatalogManagementLens({
            isChineseUi,
            query: catalogSearchQuery,
            templateFilter: templateCatalogFilter,
            skillPackFilter: skillPackCatalogFilter,
            templateSpotlightLabel,
            skillPackSpotlightLabel,
        }),
        [
            catalogSearchQuery,
            isChineseUi,
            skillPackCatalogFilter,
            skillPackSpotlightLabel,
            templateCatalogFilter,
            templateSpotlightLabel,
        ],
    );
    const templateManagementFilters = useMemo(
        () => [
            { key: 'all', label: isChineseUi ? '\u5168\u90e8\u6a21\u677f' : 'All', count: templateCatalogStats.all },
            { key: 'validated', label: isChineseUi ? '\u5df2\u9a8c\u8bc1' : 'Validated', count: templateCatalogStats.validated },
            { key: 'high-autonomy', label: isChineseUi ? '\u9ad8\u81ea\u6cbb' : 'High autonomy', count: templateCatalogStats.highAutonomy },
            { key: 'pack-linked', label: isChineseUi ? '\u5df2\u5173\u8054\u80fd\u529b\u5305' : 'Pack-linked', count: templateCatalogStats.packLinked },
        ],
        [isChineseUi, templateCatalogStats],
    );
    const skillPackManagementFilters = useMemo(
        () => [
            { key: 'all', label: isChineseUi ? '\u5168\u90e8\u80fd\u529b\u5305' : 'All', count: skillPackCatalogStats.all },
            { key: 'high-risk', label: isChineseUi ? '\u9ad8\u98ce\u9669' : 'High risk', count: skillPackCatalogStats.highRisk },
            { key: 'role-linked', label: isChineseUi ? '\u5df2\u6302\u63a5\u89d2\u8272' : 'Role-linked', count: skillPackCatalogStats.roleLinked },
            { key: 'tool-required', label: isChineseUi ? '\u5de5\u5177\u4f9d\u8d56' : 'Tool-required', count: skillPackCatalogStats.toolRequired },
        ],
        [isChineseUi, skillPackCatalogStats],
    );

    const applyDetailState = (nextState: {
        selectedTemplateDetail: DuoduoTemplateLibraryItem | null;
        selectedSkillPackDetail: SkillPackCatalogItem | null;
    }) => {
        setSelectedTemplateDetail(nextState.selectedTemplateDetail);
        setSelectedSkillPackDetail(nextState.selectedSkillPackDetail);
    };

    const openTemplateDetail = (item: DuoduoTemplateLibraryItem) => {
        applyDetailState(openTemplateDetailState({ selectedTemplateDetail, selectedSkillPackDetail }, item));
    };

    const openSkillPackDetail = (pack: SkillPackCatalogItem) => {
        applyDetailState(openSkillPackDetailState({ selectedTemplateDetail, selectedSkillPackDetail }, pack));
    };

    const spotlightTemplateCatalog = (canonicalName: string) => {
        setTemplateCatalogSpotlight(canonicalName);
        templateCatalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const spotlightSkillPackCatalog = (packId: string) => {
        setSkillPackCatalogSpotlight(packId);
        skillPackCatalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const applyTemplateCatalogFilter = (filter: 'all' | 'pack-linked' | 'high-autonomy' | 'validated') => {
        setTemplateCatalogFilter(filter);
        setTemplateCatalogSpotlight(null);
        templateCatalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const applySkillPackCatalogFilter = (filter: 'all' | 'tool-required' | 'role-linked' | 'high-risk') => {
        setSkillPackCatalogFilter(filter);
        setSkillPackCatalogSpotlight(null);
        skillPackCatalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const resetCatalogControls = () => {
        setCatalogSearchQuery('');
        setTemplateCatalogFilter('all');
        setSkillPackCatalogFilter('all');
        setTemplateCatalogSpotlight(null);
        setSkillPackCatalogSpotlight(null);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        setSearchResults([]);
        setHasSearched(true);
        try {
            const results = await skillApi.clawhub.search(searchQuery);
            setSearchResults(results);
        } catch (e: any) {
            showToast(e.message || 'Search failed', 'error');
        }
        setSearching(false);
    };

    const handleInstall = async (slug: string) => {
        setInstalling(slug);
        try {
            const result = await skillApi.clawhub.install(slug);
            const tierLabel = result.tier === 1 ? (isChineseUi ? '\u7b49\u7ea7 1\uff08\u7eaf Prompt\uff09' : 'Tier 1 (Pure Prompt)') : result.tier === 2 ? (isChineseUi ? '\u7b49\u7ea7 2\uff08CLI/API\uff09' : 'Tier 2 (CLI/API)') : (isChineseUi ? '\u7b49\u7ea7 3\uff08OpenClaw \u539f\u751f\uff09' : 'Tier 3 (OpenClaw Native)');
            showToast(isChineseUi ? `\u5df2\u5b89\u88c5 "${result.name}" - ${tierLabel}\uff0c\u5171 ${result.file_count} \u4e2a\u6587\u4ef6` : `Installed "${result.name}" - ${tierLabel}, ${result.file_count} files`);
            setRefreshKey(k => k + 1);
            // Remove from search results
            setSearchResults(prev => prev.filter(r => r.slug !== slug));
        } catch (e: any) {
            showToast(e.message || 'Install failed', 'error');
        }
        setInstalling(null);
    };

    const handleUrlPreview = async () => {
        if (!urlInput.trim()) return;
        setUrlPreviewing(true);
        setUrlPreview(null);
        try {
            const preview = await skillApi.previewUrl(urlInput);
            setUrlPreview(preview);
        } catch (e: any) {
            showToast(e.message || 'Preview failed', 'error');
        }
        setUrlPreviewing(false);
    };

    const handleUrlImport = async () => {
        if (!urlInput.trim()) return;
        setUrlImporting(true);
        try {
            const result = await skillApi.importFromUrl(urlInput);
            showToast(isChineseUi ? `\u5df2\u5bfc\u5165 "${result.name}" - ${result.file_count} \u4e2a\u6587\u4ef6` : `Imported "${result.name}" - ${result.file_count} files`);
            setRefreshKey(k => k + 1);
            setShowUrlModal(false);
            setUrlInput('');
            setUrlPreview(null);
        } catch (e: any) {
            showToast(e.message || 'Import failed', 'error');
        }
        setUrlImporting(false);
    };

    const tierBadge = (tier: number) => {
        const styles: Record<number, { bg: string; color: string; label: string }> = {
            1: { bg: 'rgba(52,199,89,0.12)', color: 'var(--success, #34c759)', label: isChineseUi ? '\u7b49\u7ea7 1 / \u7eaf Prompt' : 'Tier 1 / Pure Prompt' },
            2: { bg: 'rgba(255,159,10,0.12)', color: 'var(--warning, #ff9f0a)', label: isChineseUi ? '\u7b49\u7ea7 2 / CLI/API' : 'Tier 2 / CLI/API' },
            3: { bg: 'rgba(255,59,48,0.12)', color: 'var(--error, #ff3b30)', label: isChineseUi ? '\u7b49\u7ea7 3 / OpenClaw \u539f\u751f' : 'Tier 3 / OpenClaw Native' },
        };
        const s = styles[tier] || styles[1];
        return (
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: s.bg, color: s.color }}>
                {s.label}
            </span>
        );
    };

    return (
        <div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3>{t('enterprise.tabs.skills', 'Skill Registry')}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {t('enterprise.tools.manageGlobalSkills')}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: '13px', padding: '6px 10px', minWidth: 'auto' }}
                        onClick={async () => {
                            setShowSettings(s => !s);
                            if (!tokenStatus) {
                                try {
                                    const status = await skillApi.settings.getToken();
                                    setTokenStatus(status);
                                } catch { /* ignore */ }
                            }
                        }}
                        title="Settings"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: '13px' }}
                        onClick={() => { setShowUrlModal(true); setUrlInput(''); setUrlPreview(null); }}
                    >
                        {t('enterprise.tools.importFromUrl')}
                    </button>
                    <button
                        className="btn btn-primary"
                        style={{ fontSize: '13px' }}
                        onClick={() => { setShowClawhubModal(true); setSearchQuery(''); setSearchResults([]); setHasSearched(false); }}
                    >
                        {t('enterprise.tools.browseClawhub')}
                    </button>
                </div>
            </div>

            {/* GitHub Token Settings Panel */}
            {showSettings && (
                <div style={{
                    marginBottom: '16px', padding: '16px', borderRadius: '8px',
                    border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {t('enterprise.tools.githubToken')}
                        <span className="metric-tooltip-trigger" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', color: 'var(--text-tertiary)' }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5" /><path d="M8 7v4M8 5.5v0" /></svg>
                            <span className="metric-tooltip" style={{ width: '300px', bottom: 'auto', top: 'calc(100% + 6px)', left: '-8px', fontWeight: 400 }}>
                                <div style={{ marginBottom: '6px', fontWeight: 500 }}>{t('enterprise.tools.howToGenerateGithubToken')}</div>
                                {t('enterprise.tools.githubTokenStep1')}<br />
                                {t('enterprise.tools.githubTokenStep2')}<br />
                                {t('enterprise.tools.githubTokenStep3')}<br />
                                {t('enterprise.tools.githubTokenStep4')}<br />
                                {t('enterprise.tools.githubTokenStep5')}<br />
                                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                    {t('enterprise.tools.orVisit')}
                                </div>
                            </span>
                        </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                        {t('enterprise.tools.githubTokenDesc')}
                    </p>
                    {tokenStatus?.configured && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            {t('enterprise.tools.currentToken')} <code style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', fontSize: '11px' }}>{tokenStatus.masked}</code>
                            <span style={{ marginLeft: '8px', color: 'var(--text-tertiary)' }}>({tokenStatus.source})</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Hidden inputs to absorb browser autofill */}
                        <input type="text" name="prevent_autofill_user" style={{ display: 'none' }} tabIndex={-1} />
                        <input type="password" name="prevent_autofill_pass" style={{ display: 'none' }} tabIndex={-1} />
                        <input
                            type="text"
                            className="input"
                            autoComplete="off"
                            data-form-type="other"
                            placeholder="ghp_xxxxxxxxxxxx"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            style={{ flex: 1, fontSize: '13px', fontFamily: 'monospace', WebkitTextSecurity: 'disc' } as React.CSSProperties}
                        />
                        <button
                            className="btn btn-primary"
                            style={{ fontSize: '13px' }}
                            disabled={!tokenInput.trim() || savingToken}
                            onClick={async () => {
                                setSavingToken(true);
                                try {
                                    await skillApi.settings.setToken(tokenInput.trim());
                                    const status = await skillApi.settings.getToken();
                                    setTokenStatus(status);
                                    setTokenInput('');
                                    showToast(t('enterprise.tools.githubTokenSaved'));
                                } catch (e: any) {
                                    showToast(e.message || t('enterprise.tools.failedToSave'), 'error');
                                }
                                setSavingToken(false);
                            }}
                        >
                            {savingToken ? t('enterprise.tools.saving') : t('enterprise.tools.save')}
                        </button>
                        {tokenStatus?.configured && tokenStatus.source === 'tenant' && (
                            <button
                                className="btn btn-secondary"
                                style={{ fontSize: '13px' }}
                                onClick={async () => {
                                    try {
                                        await skillApi.settings.setToken('');
                                        const status = await skillApi.settings.getToken();
                                        setTokenStatus(status);
                                        showToast(t('enterprise.tools.tokenCleared'));
                                    } catch (e: any) {
                                        showToast(e.message || t('enterprise.tools.failed'), 'error');
                                    }
                                }}
                            >
                                {t('enterprise.tools.clear')}
                            </button>
                        )}
                    </div>

                    {/* ClawHub API Key */}
                    <div style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t('enterprise.tools.clawhubApiKey')}
                            <span className="metric-tooltip-trigger" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', color: 'var(--text-tertiary)' }}>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5" /><path d="M8 7v4M8 5.5v0" /></svg>
                                <span className="metric-tooltip" style={{ width: '280px', bottom: 'auto', top: 'calc(100% + 6px)', left: '-8px', fontWeight: 400 }}>
                                    {t('enterprise.tools.clawhubApiKeyDesc')}
                                </span>
                            </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                            {t('enterprise.tools.authenticatedRequestsGetHigherRateLimits')}
                        </p>
                        {tokenStatus?.clawhub_configured && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                {t('enterprise.tools.currentKey')} <code style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', fontSize: '11px' }}>{tokenStatus.clawhub_masked}</code>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="text" name="prevent_autofill_ch_user" style={{ display: 'none' }} tabIndex={-1} />
                            <input type="password" name="prevent_autofill_ch_pass" style={{ display: 'none' }} tabIndex={-1} />
                            <input
                                type="text"
                                className="input"
                                autoComplete="off"
                                data-form-type="other"
                                placeholder="sk-ant-xxxxxxxxxxxx"
                                value={clawhubKeyInput}
                                onChange={e => setClawhubKeyInput(e.target.value)}
                                style={{ flex: 1, fontSize: '13px', fontFamily: 'monospace', WebkitTextSecurity: 'disc' } as React.CSSProperties}
                            />
                            <button
                                className="btn btn-primary"
                                style={{ fontSize: '13px' }}
                                disabled={!clawhubKeyInput.trim() || savingClawhubKey}
                                onClick={async () => {
                                    setSavingClawhubKey(true);
                                    try {
                                        await skillApi.settings.setClawhubKey(clawhubKeyInput.trim());
                                        const status = await skillApi.settings.getToken();
                                        setTokenStatus(status);
                                        setClawhubKeyInput('');
                                        showToast(t('enterprise.tools.clawhubApiKeySaved'));
                                    } catch (e: any) {
                                        showToast(e.message || t('enterprise.tools.failedToSave'), 'error');
                                    }
                                    setSavingClawhubKey(false);
                                }}
                            >
                                {savingClawhubKey ? t('enterprise.tools.saving') : t('enterprise.tools.save')}
                            </button>
                            {tokenStatus?.clawhub_configured && (
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '13px' }}
                                    onClick={async () => {
                                        try {
                                            await skillApi.settings.setClawhubKey('');
                                            const status = await skillApi.settings.getToken();
                                            setTokenStatus(status);
                                            showToast(t('enterprise.tools.tokenCleared'));
                                        } catch (e: any) {
                                            showToast(e.message || t('enterprise.tools.failed'), 'error');
                                        }
                                    }}
                                >
                                    {t('enterprise.tools.clear')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
                padding: '6px',
                borderRadius: '10px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                width: 'fit-content',
            }}>
                {[
                    {
                        key: 'catalog',
                        label: isChineseUi ? '\u80fd\u529b\u76ee\u5f55' : 'Capability Catalog',
                        description: isChineseUi ? '\u5148\u770b\u6a21\u677f\u5e93\u548c\u80fd\u529b\u5305' : 'Templates and packs first',
                    },
                    {
                        key: 'files',
                        label: isChineseUi ? '\u6280\u80fd\u6587\u4ef6' : 'Skill Files',
                        description: isChineseUi ? '\u518d\u7ba1\u7406\u5e95\u5c42 skill \u6587\u4ef6' : 'Then manage low-level files',
                    },
                ].map((item) => (
                    <button
                        key={item.key}
                        className="btn btn-ghost"
                        onClick={() => setLibraryView(item.key as 'catalog' | 'files')}
                        style={{
                            minWidth: '170px',
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: libraryView === item.key ? 'var(--accent-subtle)' : 'transparent',
                            border: `1px solid ${libraryView === item.key ? 'var(--accent-primary)' : 'transparent'}`,
                            color: 'var(--text-primary)',
                        }}
                    >
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px' }}>{item.description}</div>
                    </button>
                ))}
            </div>

            {libraryView === 'catalog' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-default)',
                        background: 'linear-gradient(135deg, rgba(12,74,110,0.10), rgba(14,116,144,0.04))',
                    }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {isChineseUi ? '\u9996\u573a\u666f\u4e1a\u52a1\u80fd\u529b\u76ee\u5f55' : 'First-scenario capability catalog'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.6 }}>
                            {isChineseUi
                                ? `${scenarioLabel || '\u591a\u591a\u6807\u51c6\u573a\u666f / \u591a\u4ee3\u7406\u534f\u540c'}\u3002\u4f7f\u7528\u6a21\u677f\u4e0e\u80fd\u529b\u5305\u4f5c\u4e3a\u4e3b\u8981\u7ba1\u7406\u89c6\u56fe\uff0c\u53ea\u6709\u5728\u9700\u8981\u65f6\u518d\u4e0b\u94bb\u5230\u5e95\u5c42 skill \u6587\u4ef6\u3002`
                                : 'Use templates and packs as the primary management surface, then drop down to low-level skill files only when needed.'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? `\u6a21\u677f ${templateCards.length} \u9879` : `${templateCards.length} templates`}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? `\u80fd\u529b\u5305 ${skillPackCards.length} \u9879` : `${skillPackCards.length} packs`}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? '\u4e2d\u6587\u4f18\u5148\u5c55\u793a' : 'Chinese-first display'}
                            </span>
                        </div>
                    </div>

                    <div
                        ref={templateCatalogSectionRef}
                        style={{
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-primary)',
                        }}
                    >
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {isChineseUi ? '\u5feb\u901f\u68c0\u7d22' : 'Quick find'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px', lineHeight: 1.6 }}>
                            {isChineseUi
                                ? '\u6309\u6a21\u677f\u540d\u3001\u80fd\u529b\u5305\u540d\u3001\u4e1a\u52a1\u76ee\u6807\u3001\u5173\u8054\u89d2\u8272\u6216\u5de5\u5177\u4f9d\u8d56\u5feb\u901f\u7f29\u5c0f\u8303\u56f4\u3002'
                                : 'Search and narrow the catalog by names, goals, linked roles, or tool requirements.'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                                className="input"
                                value={catalogSearchQuery}
                                onChange={(e) => setCatalogSearchQuery(e.target.value)}
                                placeholder={isChineseUi ? '\u641c\u7d22\u6a21\u677f\u3001\u80fd\u529b\u5305\u3001\u76ee\u6807\u3001\u89d2\u8272\u6216\u5de5\u5177' : 'Search templates, packs, goals, roles, or tools'}
                                style={{ flex: '1 1 280px', minWidth: '240px', fontSize: '13px' }}
                            />
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={resetCatalogControls}
                                style={{ fontSize: '12px' }}
                            >
                                {isChineseUi ? '\u91cd\u7f6e' : 'Reset'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? `\u6a21\u677f ${visibleTemplateCards.length}/${templateCards.length}` : `Templates ${visibleTemplateCards.length}/${templateCards.length}`}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? `\u80fd\u529b\u5305 ${visibleSkillPackCards.length}/${skillPackCards.length}` : `Packs ${visibleSkillPackCards.length}/${skillPackCards.length}`}
                            </span>
                        </div>
                        <div style={{
                            marginTop: '14px',
                            padding: '12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-elevated)',
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {isChineseUi ? '\u5f53\u524d\u7ba1\u7406\u89c6\u89d2' : 'Current management lens'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.6 }}>
                                {catalogManagementLens.summary}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px', lineHeight: 1.6 }}>
                                {catalogManagementLens.explanation}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                                {catalogManagementLens.segments.map((segment) => (
                                    <span
                                        key={segment.label}
                                        style={{
                                            fontSize: '11px',
                                            padding: '4px 8px',
                                            borderRadius: '999px',
                                            color: segment.tone === 'focus' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            background: segment.tone === 'neutral' ? 'var(--bg-primary)' : 'var(--accent-subtle)',
                                            border: segment.tone === 'focus'
                                                ? '1px solid var(--accent-primary)'
                                                : '1px solid var(--border-default)',
                                        }}
                                    >
                                        {segment.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {isChineseUi ? '\u7ba1\u7406\u901f\u89c8' : 'Management snapshot'}
                            </div>
                            <CatalogFilterPillRow
                                label={isChineseUi ? '\u6a21\u677f\u89c6\u89d2' : 'Template view'}
                                items={templateManagementFilters}
                                activeKey={templateCatalogFilter}
                                onSelect={(key) => applyTemplateCatalogFilter(key as 'all' | 'validated' | 'high-autonomy' | 'pack-linked')}
                            />
                            <CatalogFilterPillRow
                                label={isChineseUi ? '\u80fd\u529b\u5305\u89c6\u89d2' : 'Pack view'}
                                items={skillPackManagementFilters}
                                activeKey={skillPackCatalogFilter}
                                onSelect={(key) => applySkillPackCatalogFilter(key as 'all' | 'high-risk' | 'role-linked' | 'tool-required')}
                            />
                        </div>
                        {(templateCatalogSpotlight || skillPackCatalogSpotlight) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u5173\u8054\u805a\u7126' : 'Relation spotlight'}
                                </span>
                                {templateCatalogSpotlight && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={() => setTemplateCatalogSpotlight(null)}
                                        style={{
                                            minWidth: 'auto',
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            borderRadius: '999px',
                                            background: 'var(--accent-subtle)',
                                            border: '1px solid var(--accent-primary)',
                                        }}
                                    >
                                        {isChineseUi ? `\u6a21\u677f\u805a\u7126\uff1a${templateSpotlightLabel}` : `Template: ${templateSpotlightLabel}`}
                                    </button>
                                )}
                                {skillPackCatalogSpotlight && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={() => setSkillPackCatalogSpotlight(null)}
                                        style={{
                                            minWidth: 'auto',
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            borderRadius: '999px',
                                            background: 'var(--accent-subtle)',
                                            border: '1px solid var(--accent-primary)',
                                        }}
                                    >
                                        {isChineseUi ? `\u80fd\u529b\u5305\u805a\u7126\uff1a${skillPackSpotlightLabel}` : `Pack: ${skillPackSpotlightLabel}`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-primary)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u6a21\u677f\u5e93\u53ea\u8bfb\u89c6\u56fe' : 'Read-only template library'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                    {isChineseUi ? '\u7528\u4e8e\u5ba1\u67e5\u89d2\u8272\u6a21\u677f\u3001\u63a8\u8350\u80fd\u529b\u5305\u548c\u9ed8\u8ba4\u8fb9\u754c\uff0c\u4e0d\u76f4\u63a5\u66b4\u9732\u4e0a\u6e38\u539f\u59cb\u9879\u76ee\u3002' : 'Review role templates, recommended packs, and default boundaries without exposing raw upstream projects.'}
                                </div>
                            </div>
                        </div>
                        {catalogLoading ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {isChineseUi ? '\u6b63\u5728\u52a0\u8f7d\u6a21\u677f\u5e93...' : 'Loading template library...'}
                            </div>
                        ) : templateCards.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {isChineseUi ? '\u5f53\u524d\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u6a21\u677f\u5e93\u6570\u636e\u3002' : 'No template catalog data available.'}
                            </div>
                        ) : visibleTemplateCards.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {templateCatalogSpotlight
                                    ? (isChineseUi ? '\u5f53\u524d\u6a21\u677f\u805a\u7126\u672a\u547d\u4e2d\u53ef\u5c55\u793a\u9879\uff0c\u6e05\u9664\u805a\u7126\u540e\u53ef\u8fd4\u56de\u5b8c\u6574\u76ee\u5f55\u3002' : 'The current template spotlight has no visible match. Clear it to return to the full catalog.')
                                    : (isChineseUi ? '\u5f53\u524d\u641c\u7d22\u6216\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u5339\u914d\u6a21\u677f\u3002' : 'No templates match the current search or filters.')}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                                {visibleTemplateCards.map((item: DuoduoTemplateLibraryItem) => (
                                    <div
                                        key={item.template_key}
                                        onClick={() => openTemplateDetail(item)}
                                        style={{
                                            padding: '14px',
                                            borderRadius: '10px',
                                            border: templateCatalogSpotlight === item.canonical_name ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                                            background: 'var(--bg-elevated)',
                                            cursor: 'pointer',
                                            boxShadow: templateCatalogSpotlight === item.canonical_name ? '0 0 0 2px rgba(14,116,144,0.12)' : 'none',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {isChineseUi ? (item.display_name_zh || item.canonical_name) : item.canonical_name}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                    {item.role_level} / {item.role_type}
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: '10px',
                                                padding: '2px 8px',
                                                borderRadius: '999px',
                                                background: 'var(--accent-subtle)',
                                                color: 'var(--text-secondary)',
                                            }}>
                                                {item.validation_status}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                                            {item.primary_goal}
                                        </div>
                                        {!!item.recommended_skill_packs?.length && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                                {item.recommended_skill_packs.map((packId: string) => (
                                                    <button
                                                        key={`${item.template_key}-${packId}`}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            spotlightSkillPackCatalog(packId);
                                                        }}
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '3px 8px',
                                                            borderRadius: '999px',
                                                            border: skillPackCatalogSpotlight === packId ? '1px solid var(--accent-primary)' : '1px solid transparent',
                                                            background: skillPackCatalogSpotlight === packId ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                                                            color: 'var(--text-secondary)',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {packLabelById[packId] || packId}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {!!item.default_boundaries?.length && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: '10px' }}>
                                                {isChineseUi ? '\u9ed8\u8ba4\u8fb9\u754c\uff1a' : 'Boundary: '}
                                                {item.default_boundaries[0]}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '11px', color: 'var(--accent-primary)', marginTop: '10px', fontWeight: 600 }}>
                                            {isChineseUi ? '\u67e5\u770b\u6a21\u677f\u8be6\u60c5 ->' : 'View details ->'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div
                        ref={skillPackCatalogSectionRef}
                        style={{
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-primary)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u80fd\u529b\u5305\u5e93\u53ea\u8bfb\u89c6\u56fe' : 'Read-only skill-pack library'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                    {isChineseUi ? '\u4ee5\u80fd\u529b\u5305\u4f5c\u4e3a\u4ea7\u54c1\u5355\u4f4d\uff0c\u8ba9\u56e2\u961f\u5148\u770b\u5230\u4e1a\u52a1\u80fd\u529b\uff0c\u518d\u6309\u9700\u4e0b\u94bb\u5230\u5e95\u5c42 skill\u3002' : 'Use packs as the product surface so teams see business capabilities before raw skills.'}
                                </div>
                            </div>
                        </div>
                        {catalogLoading ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {isChineseUi ? '\u6b63\u5728\u52a0\u8f7d\u80fd\u529b\u5305...' : 'Loading skill packs...'}
                            </div>
                        ) : skillPackCards.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {isChineseUi ? '\u5f53\u524d\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u80fd\u529b\u5305\u6570\u636e\u3002' : 'No skill-pack data available.'}
                            </div>
                        ) : visibleSkillPackCards.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {skillPackCatalogSpotlight
                                    ? (isChineseUi ? '\u5f53\u524d\u80fd\u529b\u5305\u805a\u7126\u672a\u547d\u4e2d\u53ef\u5c55\u793a\u9879\uff0c\u6e05\u9664\u805a\u7126\u540e\u53ef\u8fd4\u56de\u5b8c\u6574\u76ee\u5f55\u3002' : 'The current pack spotlight has no visible match. Clear it to return to the full catalog.')
                                    : (isChineseUi ? '\u5f53\u524d\u641c\u7d22\u6216\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u5339\u914d\u80fd\u529b\u5305\u3002' : 'No skill packs match the current search or filters.')}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                                {visibleSkillPackCards.map((pack: SkillPackCatalogItem) => (
                                    <div
                                        key={pack.pack_id}
                                        onClick={() => openSkillPackDetail(pack)}
                                        style={{
                                            padding: '14px',
                                            borderRadius: '10px',
                                            border: skillPackCatalogSpotlight === pack.pack_id ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                                            background: 'var(--bg-elevated)',
                                            cursor: 'pointer',
                                            boxShadow: skillPackCatalogSpotlight === pack.pack_id ? '0 0 0 2px rgba(14,116,144,0.12)' : 'none',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {isChineseUi ? pack.display_name_zh : pack.display_name_en}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                    {pack.pack_id}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                                <span style={{
                                                    fontSize: '10px',
                                                    padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-secondary)',
                                                }}>
                                                    {pack.risk_level}
                                                </span>
                                                <span style={{
                                                    fontSize: '10px',
                                                    padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    background: 'var(--accent-subtle)',
                                                    color: 'var(--text-secondary)',
                                                }}>
                                                    {pack.status}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                                            {pack.business_goal}
                                        </div>
                                        {!!pack.recommended_roles?.length && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                                {pack.recommended_roles.map((roleName: string) => (
                                                    <button
                                                        key={`${pack.pack_id}-${roleName}`}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            spotlightTemplateCatalog(roleName);
                                                        }}
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '3px 8px',
                                                            borderRadius: '999px',
                                                            border: templateCatalogSpotlight === roleName ? '1px solid var(--accent-primary)' : '1px solid transparent',
                                                            background: templateCatalogSpotlight === roleName ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                                                            color: 'var(--text-secondary)',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {templateLabelByCanonical[roleName] || roleName}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {!!pack.included_skills?.length && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                                {pack.included_skills.map((slug: string) => (
                                                    <span
                                                        key={`${pack.pack_id}-${slug}`}
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '3px 8px',
                                                            borderRadius: '999px',
                                                            background: 'rgba(148,163,184,0.12)',
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        {skillLabelByFolder[slug] || slug}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {!!pack.required_tools?.length && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: '10px' }}>
                                                {isChineseUi ? '\u4f9d\u8d56\u5de5\u5177\uff1a' : 'Required tools: '}
                                                {pack.required_tools.join(' / ')}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '11px', color: 'var(--accent-primary)', marginTop: '10px', fontWeight: 600 }}>
                                            {isChineseUi ? '\u67e5\u770b\u80fd\u529b\u5305\u8be6\u60c5 ->' : 'View pack details ->'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <FileBrowser
                    key={refreshKey}
                    api={adapter}
                    features={{ newFile: true, newFolder: true, edit: true, delete: true, directoryNavigation: true }}
                    title={t('agent.skills.skillFiles', 'Skill Files')}
                    onRefresh={() => setRefreshKey(k => k + 1)}
                />
            )}

            {selectedTemplateDetail && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.45)',
                        zIndex: 10010,
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                    onClick={() => setSelectedTemplateDetail(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(560px, 92vw)',
                            height: '100%',
                            background: 'var(--bg-primary)',
                            borderLeft: '1px solid var(--border-default)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                            padding: '24px',
                            overflowY: 'auto',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    {isChineseUi ? '\u6a21\u677f\u8be6\u60c5' : 'Template details'}
                                </div>
                                <h3 style={{ margin: '6px 0 0', fontSize: '20px' }}>
                                    {isChineseUi ? (selectedTemplateDetail.display_name_zh || selectedTemplateDetail.canonical_name) : selectedTemplateDetail.canonical_name}
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                                    {selectedTemplateDetail.template_key} / {selectedTemplateDetail.role_level} / {selectedTemplateDetail.role_type}
                                </div>
                            </div>
                            <button className="btn btn-ghost" aria-label={isChineseUi ? '\u5173\u95ed' : 'Close'} onClick={() => setSelectedTemplateDetail(null)} style={{ fontSize: '18px', padding: '4px 8px', minWidth: 'auto' }}>
                                {'\u00d7'}
                            </button>
                        </div>

                        <div style={{ marginTop: '18px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}>
                                {selectedTemplateDetail.validation_status}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? scenarioLabel : duoduoTemplateLibrary?.scenario?.scenario_id}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? `\u81ea\u6cbb\u7b49\u7ea7 ${selectedTemplateDetail.default_autonomy_level}` : `Autonomy ${selectedTemplateDetail.default_autonomy_level}`}
                            </span>
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {isChineseUi ? '\u4e3b\u8981\u76ee\u6807' : 'Primary goal'}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: '8px' }}>
                                {selectedTemplateDetail.primary_goal}
                            </div>
                        </div>

                        {!!selectedTemplateDetail.recommended_skill_packs?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u63a8\u8350\u80fd\u529b\u5305' : 'Recommended packs'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                                    {selectedTemplateDetail.recommended_skill_packs.map((packId) => {
                                        const pack = skillPackById[packId];
                                        const packGoal = pack?.business_goal || duoduoTemplateLibrary?.skill_pack_refs.find((ref) => ref.skill_pack_id === packId)?.goal || '';
                                        const relatedPackStyle: React.CSSProperties = {
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-default)',
                                            background: 'var(--bg-elevated)',
                                        };
                                        if (pack) {
                                            return (
                                                <button
                                                    key={`${selectedTemplateDetail.template_key}-${packId}`}
                                                    type="button"
                                                    onClick={() => openSkillPackDetail(pack)}
                                                    style={{
                                                        ...relatedPackStyle,
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                                                        {isChineseUi ? pack.display_name_zh : pack.display_name_en}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '6px' }}>
                                                        {packGoal}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--accent-primary)', marginTop: '8px', fontWeight: 600 }}>
                                                        {isChineseUi ? '\u67e5\u770b\u80fd\u529b\u5305\u8be6\u60c5 ->' : 'View pack details ->'}
                                                    </div>
                                                </button>
                                            );
                                        }
                                        return (
                                            <div key={`${selectedTemplateDetail.template_key}-${packId}`} style={relatedPackStyle}>
                                                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                                                    {packId}
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '6px' }}>
                                                    {packGoal}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!!selectedTemplateDetail.default_boundaries?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u9ed8\u8ba4\u8fb9\u754c' : 'Default boundaries'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                    {selectedTemplateDetail.default_boundaries.map((boundary, index) => (
                                        <div key={`${selectedTemplateDetail.template_key}-boundary-${index}`} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {index + 1}. {boundary}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!!selectedTemplateDetail.coordination_pattern_ids?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u534f\u540c\u6a21\u5f0f' : 'Coordination patterns'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                                    {selectedTemplateDetail.coordination_pattern_ids.map((patternId) => {
                                        const pattern = coordinationPatternById[patternId];
                                        if (!pattern) {
                                            return null;
                                        }
                                        return (
                                            <div key={`${selectedTemplateDetail.template_key}-${patternId}`} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                                                    {isChineseUi ? pattern.display_name_zh : pattern.name}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                    {pattern.topology_type}
                                                </div>
                                                {!!pattern.handoff_rules?.length && (
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                                                        {pattern.handoff_rules[0]}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!!selectedTemplateDetail.source_ids?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u6765\u6e90\u53c2\u8003' : 'Source references'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                                    {selectedTemplateDetail.source_ids.map((sourceId) => {
                                        const source = sourceById[sourceId];
                                        if (!source) {
                                            return null;
                                        }
                                        return (
                                            <div key={`${selectedTemplateDetail.template_key}-${sourceId}`} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600 }}>{source.project_name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '6px' }}>
                                                    {source.primary_value}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {selectedSkillPackDetail && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.45)',
                        zIndex: 10010,
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                    onClick={() => setSelectedSkillPackDetail(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(560px, 92vw)',
                            height: '100%',
                            background: 'var(--bg-primary)',
                            borderLeft: '1px solid var(--border-default)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                            padding: '24px',
                            overflowY: 'auto',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    {isChineseUi ? '\u80fd\u529b\u5305\u8be6\u60c5' : 'Skill-pack details'}
                                </div>
                                <h3 style={{ margin: '6px 0 0', fontSize: '20px' }}>
                                    {isChineseUi ? selectedSkillPackDetail.display_name_zh : selectedSkillPackDetail.display_name_en}
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                                    {selectedSkillPackDetail.pack_id} / {selectedSkillPackDetail.version}
                                </div>
                            </div>
                            <button className="btn btn-ghost" aria-label={isChineseUi ? '\u5173\u95ed' : 'Close'} onClick={() => setSelectedSkillPackDetail(null)} style={{ fontSize: '18px', padding: '4px 8px', minWidth: 'auto' }}>
                                {'\u00d7'}
                            </button>
                        </div>

                        <div style={{ marginTop: '18px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}>
                                {selectedSkillPackDetail.status}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                {selectedSkillPackDetail.risk_level}
                            </span>
                            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                {isChineseUi ? scenarioLabel : duoduoSkillPackCatalog?.scenario?.scenario_id}
                            </span>
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {isChineseUi ? '\u4e1a\u52a1\u76ee\u6807' : 'Business goal'}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: '8px' }}>
                                {selectedSkillPackDetail.business_goal}
                            </div>
                        </div>

                        {!!selectedSkillPackDetail.recommended_roles?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u63a8\u8350\u89d2\u8272' : 'Recommended roles'}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                                    {selectedSkillPackDetail.recommended_roles.map((roleName) => {
                                        const linkedTemplate = findTemplateByCanonicalName(templateCards, roleName);
                                        if (linkedTemplate) {
                                            return (
                                                <button
                                                    key={`${selectedSkillPackDetail.pack_id}-${roleName}`}
                                                    type="button"
                                                    onClick={() => openTemplateDetail(linkedTemplate)}
                                                    style={{
                                                        fontSize: '11px',
                                                        padding: '6px 10px',
                                                        borderRadius: '999px',
                                                        border: '1px solid var(--border-default)',
                                                        background: 'var(--bg-elevated)',
                                                        color: 'var(--text-secondary)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {templateLabelByCanonical[roleName] || roleName}
                                                    <span style={{ color: 'var(--accent-primary)', marginLeft: '6px', fontWeight: 600 }}>
                                                        {isChineseUi ? '\u67e5\u770b\u6a21\u677f' : 'View template'}
                                                    </span>
                                                </button>
                                            );
                                        }
                                        return (
                                            <span
                                                key={`${selectedSkillPackDetail.pack_id}-${roleName}`}
                                                style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                                            >
                                                {templateLabelByCanonical[roleName] || roleName}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!!selectedSkillPackDetail.included_skills?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u5305\u542b\u6280\u80fd' : 'Included skills'}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                                    {selectedSkillPackDetail.included_skills.map((slug) => (
                                        <span key={`${selectedSkillPackDetail.pack_id}-skill-${slug}`} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(148,163,184,0.12)', color: 'var(--text-secondary)' }}>
                                            {skillLabelByFolder[slug] || slug}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!!selectedSkillPackDetail.required_tools?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u4f9d\u8d56\u5de5\u5177' : 'Required tools'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                                    {selectedSkillPackDetail.required_tools.join(' / ')}
                                </div>
                            </div>
                        )}

                        {!!selectedSkillPackDetail.required_integrations?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u96c6\u6210\u4f9d\u8d56' : 'Required integrations'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                                    {selectedSkillPackDetail.required_integrations.join(' / ')}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '22px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {isChineseUi ? '\u517c\u5bb9\u8bf4\u660e' : 'Compatibility notes'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>
                                {selectedSkillPackDetail.compatibility_notes}
                            </div>
                        </div>

                        {!!selectedSkillPackDetail.acceptance_metrics?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u9a8c\u6536\u53e3\u5f84' : 'Acceptance metrics'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                    {selectedSkillPackDetail.acceptance_metrics.map((metric, index) => (
                                        <div key={`${selectedSkillPackDetail.pack_id}-metric-${index}`} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {index + 1}. {metric}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!!templatesByPackId[selectedSkillPackDetail.pack_id]?.length && (
                            <div style={{ marginTop: '22px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '\u5173\u8054\u6a21\u677f' : 'Linked templates'}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                                    {templatesByPackId[selectedSkillPackDetail.pack_id].map((item: DuoduoTemplateLibraryItem) => (
                                        <button
                                            key={`${selectedSkillPackDetail.pack_id}-${item.template_key}`}
                                            type="button"
                                            onClick={() => openTemplateDetail(item)}
                                            style={{
                                                fontSize: '11px',
                                                padding: '6px 10px',
                                                borderRadius: '999px',
                                                border: '1px solid var(--border-default)',
                                                background: 'var(--bg-elevated)',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {isChineseUi ? (item.display_name_zh || item.canonical_name) : item.canonical_name}
                                            <span style={{ color: 'var(--accent-primary)', marginLeft: '6px', fontWeight: 600 }}>
                                                {isChineseUi ? '\u67e5\u770b\u6a21\u677f' : 'View template'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
                    padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    background: toast.type === 'error' ? 'rgba(255,59,48,0.95)' : 'rgba(52,199,89,0.95)',
                    color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: '400px',
                    animation: 'fadeIn 200ms ease',
                }}>
                    {toast.message}
                </div>
            )}

            {/* ClawHub Search Modal */}
            {showClawhubModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setShowClawhubModal(false)}>
                    <div style={{
                        background: 'var(--bg-primary)', borderRadius: '12px', width: '640px', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column', border: '1px solid var(--border-default)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
                    }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px' }}>{t('enterprise.tools.browseClawhub')}</h3>
                                <button className="btn btn-ghost" onClick={() => setShowClawhubModal(false)} style={{ padding: '4px 8px', fontSize: '16px', lineHeight: 1 }}>x</button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    className="input"
                                    placeholder={t('enterprise.tools.searchSkills')}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                    autoFocus
                                    style={{ flex: 1, fontSize: '13px' }}
                                />
                                <button className="btn btn-primary" onClick={handleSearch} disabled={searching} style={{ fontSize: '13px' }}>
                                    {searching ? t('enterprise.tools.searching') : t('enterprise.tools.search')}
                                </button>
                            </div>
                        </div>
                        {/* Results */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
                            {searchResults.length === 0 && !searching && (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                                    {hasSearched ? t('enterprise.tools.noResultsFound') : t('enterprise.tools.searchForSkills')}
                                </div>
                            )}
                            {searching && (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                                    {t('enterprise.tools.searchingClawhub')}
                                </div>
                            )}
                            {searchResults.map((r: any) => (
                                <div key={r.slug} style={{
                                    padding: '12px 0', borderBottom: '1px solid var(--border-subtle)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 600, fontSize: '14px' }}>{r.displayName}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{r.slug}</span>
                                            {r.version && <span style={{ fontSize: '10px', color: 'var(--accent-text)', background: 'var(--accent-subtle)', padding: '1px 6px', borderRadius: '4px' }}>v{r.version}</span>}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                            {r.summary?.slice(0, 160)}{r.summary?.length > 160 ? '...' : ''}
                                        </div>
                                        {r.updatedAt && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Updated {new Date(r.updatedAt).toLocaleDateString()}</div>}
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ fontSize: '12px', flexShrink: 0 }}
                                        disabled={installing === r.slug}
                                        onClick={() => handleInstall(r.slug)}
                                    >
                                        {installing === r.slug ? t('enterprise.tools.installing') : t('enterprise.tools.install')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* URL Import Modal */}
            {showUrlModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setShowUrlModal(false)}>
                    <div style={{
                        background: 'var(--bg-primary)', borderRadius: '12px', width: '560px',
                        border: '1px solid var(--border-default)', boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px' }}>{t('enterprise.tools.importFromUrl')}</h3>
                                <button className="btn btn-ghost" onClick={() => setShowUrlModal(false)} style={{ padding: '4px 8px', fontSize: '16px', lineHeight: 1 }}>x</button>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
                                {t('enterprise.tools.pasteGithubUrl')}
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    className="input"
                                    placeholder={t('enterprise.tools.githubUrlPlaceholder')}
                                    value={urlInput}
                                    onChange={e => { setUrlInput(e.target.value); setUrlPreview(null); }}
                                    autoFocus
                                    style={{ flex: 1, fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                                    onKeyDown={e => e.key === 'Enter' && handleUrlPreview()}
                                />
                                <button className="btn btn-secondary" onClick={handleUrlPreview} disabled={urlPreviewing || !urlInput.trim()} style={{ fontSize: '12px' }}>
                                    {urlPreviewing ? t('enterprise.tools.loading') : t('enterprise.tools.preview')}
                                </button>
                            </div>
                        </div>

                        {/* Preview result */}
                        {urlPreview && (
                            <div style={{ padding: '16px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{urlPreview.name}</span>
                                    {tierBadge(urlPreview.tier)}
                                    {urlPreview.has_scripts && (
                                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(255,59,48,0.1)', color: 'var(--error, #ff3b30)' }}>
                                            Contains scripts
                                        </span>
                                    )}
                                </div>
                                {urlPreview.description && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>{urlPreview.description}</p>
                                )}
                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                                    {urlPreview.files?.length} files, {(urlPreview.total_size / 1024).toFixed(1)} KB
                                </div>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-secondary" onClick={() => setShowUrlModal(false)} style={{ fontSize: '13px' }}>Cancel</button>
                                    <button className="btn btn-primary" onClick={handleUrlImport} disabled={urlImporting} style={{ fontSize: '13px' }}>
                                        {urlImporting ? 'Importing...' : 'Import'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}




// 鈹€鈹€鈹€ Company Name Editor 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function CompanyNameEditor() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const tenantId = localStorage.getItem('current_tenant_id') || '';
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!tenantId) return;
        fetchJson<any>(`/tenants/${tenantId}`)
            .then(d => { if (d?.name) setName(d.name); })
            .catch(() => { });
    }, [tenantId]);

    const handleSave = async () => {
        if (!tenantId || !name.trim()) return;
        setSaving(true);
        try {
            await fetchJson(`/tenants/${tenantId}`, {
                method: 'PUT', body: JSON.stringify({ name: name.trim() }),
            });
            qc.invalidateQueries({ queryKey: ['tenants'] });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) { }
        setSaving(false);
    };

    return (
        <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                    className="form-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('enterprise.companyName.placeholder', 'Enter company name')}
                    style={{ flex: 1, fontSize: '14px' }}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
                    {saving ? t('common.loading') : t('common.save', 'Save')}
                </button>
                {saved && <span style={{ color: 'var(--success)', fontSize: '12px' }}>{t('enterprise.config.saved', 'Saved')}</span>}
            </div>
        </div>
    );
}


// 鈹€鈹€鈹€ Company Timezone Editor 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const COMMON_TIMEZONES = [
    'UTC',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Singapore',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Australia/Sydney',
    'Pacific/Auckland',
];

function CompanyTimezoneEditor() {
    const { t } = useTranslation();
    const tenantId = localStorage.getItem('current_tenant_id') || '';
    const [timezone, setTimezone] = useState('UTC');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!tenantId) return;
        fetchJson<any>(`/tenants/${tenantId}`)
            .then(d => { if (d?.timezone) setTimezone(d.timezone); })
            .catch(() => { });
    }, [tenantId]);

    const handleSave = async (tz: string) => {
        if (!tenantId) return;
        setTimezone(tz);
        setSaving(true);
        try {
            await fetchJson(`/tenants/${tenantId}`, {
                method: 'PUT', body: JSON.stringify({ timezone: tz }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) { }
        setSaving(false);
    };

    return (
        <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '4px' }}>{t('enterprise.timezone.title', 'Company Timezone')}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {t('enterprise.timezone.description', 'Default timezone for all agents. Agents can override individually.')}
                    </div>
                </div>
                <select
                    className="form-input"
                    value={timezone}
                    onChange={e => handleSave(e.target.value)}
                    style={{ width: '220px', fontSize: '13px' }}
                    disabled={saving}
                >
                    {COMMON_TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                    ))}
                </select>
                {saved && <span style={{ color: 'var(--success)', fontSize: '12px' }}>{t('enterprise.config.saved', 'Saved')}</span>}
            </div>
        </div>
    );
}


// 鈹€鈹€ Broadcast Section 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function BroadcastSection() {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [sendEmail, setSendEmail] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ users: number; agents: number; emails: number } | null>(null);

    const handleSend = async () => {
        if (!title.trim()) return;
        setSending(true);
        setResult(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/notifications/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: title.trim(), body: body.trim(), send_email: sendEmail }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.detail || 'Failed to send broadcast');
                setSending(false);
                return;
            }
            const data = await res.json();
            setResult({
                users: data.users_notified,
                agents: data.agents_notified,
                emails: data.emails_sent || 0,
            });
            setTitle('');
            setBody('');
            setSendEmail(false);
        } catch (e: any) {
            alert(e.message || 'Failed');
        }
        setSending(false);
    };

    return (
        <div style={{ marginTop: '24px', marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '4px' }}>{t('enterprise.broadcast.title', 'Broadcast Notification')}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                {t('enterprise.broadcast.description', 'Send a notification to all users and agents in this company.')}
            </p>
            <div className="card" style={{ padding: '16px' }}>
                <input
                    className="form-input"
                    placeholder={t('enterprise.broadcast.titlePlaceholder', 'Notification title')}
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    maxLength={200}
                    style={{ marginBottom: '8px', fontSize: '13px' }}
                />
                <textarea
                    className="form-input"
                    placeholder={t('enterprise.broadcast.bodyPlaceholder', 'Optional details...')}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    style={{ resize: 'vertical', fontSize: '13px', marginBottom: '12px' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
                    <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={e => setSendEmail(e.target.checked)}
                    />
                    <span>{t('enterprise.broadcast.sendEmail', 'Also send email to users with a configured address')}</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={handleSend} disabled={sending || !title.trim()}>
                        {sending ? t('common.loading') : t('enterprise.broadcast.send', 'Send Broadcast')}
                    </button>
                    {result && (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {t(
                                'enterprise.broadcast.sentWithEmail',
                                `Sent to ${result.users} users, ${result.agents} agents, and ${result.emails} email recipients`,
                                { users: result.users, agents: result.agents, emails: result.emails },
                            )}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}


// 鈹€鈹€鈹€ Identity Providers Tab 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export default function EnterpriseSettings() {
    const { t, i18n } = useTranslation();
    const isChineseUi = i18n.language?.toLowerCase().startsWith('zh');
    const qc = useQueryClient();
    const [activeTab, setActiveTab] = useState<'llm' | 'org' | 'info' | 'approvals' | 'audit' | 'tools' | 'skills' | 'quotas' | 'users' | 'invites'>('info');

    // Track selected tenant as state so page refreshes on company switch
    const [selectedTenantId, setSelectedTenantId] = useState(localStorage.getItem('current_tenant_id') || '');
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === 'current_tenant_id') {
                setSelectedTenantId(e.newValue || '');
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    // Tenant quota defaults
    const [quotaForm, setQuotaForm] = useState({
        default_message_limit: 50, default_message_period: 'permanent',
        default_max_agents: 2, default_agent_ttl_hours: 48,
        default_max_llm_calls_per_day: 100, min_heartbeat_interval_minutes: 120,
        default_max_triggers: 20, min_poll_interval_floor: 5, max_webhook_rate_ceiling: 5,
    });
    const [quotaSaving, setQuotaSaving] = useState(false);
    const [quotaSaved, setQuotaSaved] = useState(false);
    useEffect(() => {
        if (activeTab === 'quotas') {
            fetchJson<any>('/enterprise/tenant-quotas').then(d => {
                if (d && Object.keys(d).length) setQuotaForm(f => ({ ...f, ...d }));
            }).catch(() => { });
        }
    }, [activeTab]);
    const saveQuotas = async () => {
        setQuotaSaving(true);
        try {
            await fetchJson('/enterprise/tenant-quotas', { method: 'PATCH', body: JSON.stringify(quotaForm) });
            setQuotaSaved(true); setTimeout(() => setQuotaSaved(false), 2000);
        } catch (e) { alert('Failed to save'); }
        setQuotaSaving(false);
    };
    const [companyIntro, setCompanyIntro] = useState('');
    const [companyIntroSaving, setCompanyIntroSaving] = useState(false);
    const [companyIntroSaved, setCompanyIntroSaved] = useState(false);


    // Company intro key: always per-tenant scoped
    const companyIntroKey = selectedTenantId ? `company_intro_${selectedTenantId}` : 'company_intro';

    // Load Company Intro (tenant-scoped only, no fallback to global)
    useEffect(() => {
        setCompanyIntro('');
        if (!selectedTenantId) return;
        const tenantKey = `company_intro_${selectedTenantId}`;
        fetchJson<any>(`/enterprise/system-settings/${tenantKey}`)
            .then(d => {
                if (d?.value?.content) {
                    setCompanyIntro(d.value.content);
                }
                // No fallback 鈥?each company starts empty with placeholder watermark
            })
            .catch(() => { });
    }, [selectedTenantId]);

    const saveCompanyIntro = async () => {
        setCompanyIntroSaving(true);
        try {
            await fetchJson(`/enterprise/system-settings/${companyIntroKey}`, {
                method: 'PUT', body: JSON.stringify({ value: { content: companyIntro } }),
            });
            setCompanyIntroSaved(true);
            setTimeout(() => setCompanyIntroSaved(false), 2000);
        } catch (e) { }
        setCompanyIntroSaving(false);
    };
    const [auditFilter, setAuditFilter] = useState<'all' | 'background' | 'actions'>('all');
    const [infoRefresh, setInfoRefresh] = useState(0);
    const [kbPromptModal, setKbPromptModal] = useState(false);
    const [kbToast, setKbToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const showKbToast = (message: string, type: 'success' | 'error' = 'success') => {
        setKbToast({ message, type });
        setTimeout(() => setKbToast(null), 3000);
    };

    const [allTools, setAllTools] = useState<any[]>([]);
    const [showAddMCP, setShowAddMCP] = useState(false);
    const [mcpForm, setMcpForm] = useState({ server_url: '', server_name: '', api_key: '' });
    const [mcpRawInput, setMcpRawInput] = useState('');
    const [mcpTestResult, setMcpTestResult] = useState<any>(null);
    const [mcpTesting, setMcpTesting] = useState(false);
    // Edit Server modal state 鈥?null when closed, otherwise the server to edit
    const [editingMcpServer, setEditingMcpServer] = useState<{
        server_name: string;
        server_url: string;
        api_key: string;
    } | null>(null);
    const [mcpServerSaving, setMcpServerSaving] = useState(false);
    const [editingToolId, setEditingToolId] = useState<string | null>(null);
    const [editingConfig, setEditingConfig] = useState<Record<string, any>>({});

    const [configCategory, setConfigCategory] = useState<string | null>(null);

    // Category-level config schemas: tools sharing the same key have config on category header
    const GLOBAL_CATEGORY_CONFIG_SCHEMAS: Record<string, { title: string; fields: any[] }> = {
        agentbay: {
            title: 'AgentBay Settings',
            fields: [
                { key: 'api_key', label: 'API Key (from AgentBay)', type: 'password', placeholder: 'Enter your AgentBay API key' },
                { key: 'os_type', label: 'Cloud Computer OS', type: 'select', default: 'windows', options: [{ value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }] },
            ],
        },
    };

    // Labels for tool categories (mirrors AgentDetail getCategoryLabels)
    const categoryLabels: Record<string, string> = {
        file: t('agent.toolCategories.file'),
        task: t('agent.toolCategories.task'),
        communication: t('agent.toolCategories.communication'),
        search: t('agent.toolCategories.search'),
        aware: t('agent.toolCategories.aware', 'Aware & Triggers'),
        social: t('agent.toolCategories.social', 'Social'),
        code: t('agent.toolCategories.code', 'Code & Execution'),
        discovery: t('agent.toolCategories.discovery', 'Discovery'),
        email: t('agent.toolCategories.email', 'Email'),
        feishu: t('agent.toolCategories.feishu', 'Feishu / Lark'),
        custom: t('agent.toolCategories.custom'),
        general: t('agent.toolCategories.general'),
        agentbay: t('agent.toolCategories.agentbay', 'AgentBay'),
    };
    const [toolsView, setToolsView] = useState<'global' | 'agent-installed'>('global');
    const [agentInstalledTools, setAgentInstalledTools] = useState<any[]>([]);
    const loadAllTools = async () => {
        const tid = selectedTenantId;
        const data = await fetchJson<any[]>(`/tools${tid ? `?tenant_id=${tid}` : ''}`);
        setAllTools(data);
    };
    const loadAgentInstalledTools = async () => {
        try {
            const tid = selectedTenantId;
            const data = await fetchJson<any[]>(`/tools/agent-installed${tid ? `?tenant_id=${tid}` : ''}`);
            setAgentInstalledTools(data);
        } catch { }
    };
    useEffect(() => { if (activeTab === 'tools') { loadAllTools(); loadAgentInstalledTools(); } }, [activeTab, selectedTenantId]);

    // 鈹€鈹€鈹€ Jina API Key
    const [jinaKey, setJinaKey] = useState('');
    const [jinaKeySaved, setJinaKeySaved] = useState(false);
    const [jinaKeySaving, setJinaKeySaving] = useState(false);
    const [jinaKeyMasked, setJinaKeyMasked] = useState('');  // stored key from DB
    useEffect(() => {
        if (activeTab !== 'tools') return;
        const token = localStorage.getItem('token');
        fetch('/api/enterprise/system-settings/jina_api_key', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => { if (d.value?.api_key) setJinaKeyMasked(d.value.api_key.slice(0, 8) + '**************'); })
            .catch(() => { });
    }, [activeTab]);
    const saveJinaKey = async () => {
        setJinaKeySaving(true);
        const token = localStorage.getItem('token');
        await fetch('/api/enterprise/system-settings/jina_api_key', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ value: { api_key: jinaKey } }),
        });
        setJinaKeyMasked(jinaKey.slice(0, 8) + '**************');
        setJinaKey('');
        setJinaKeySaving(false);
        setJinaKeySaved(true);
        setTimeout(() => setJinaKeySaved(false), 2000);
    };
    const clearJinaKey = async () => {
        const token = localStorage.getItem('token');
        await fetch('/api/enterprise/system-settings/jina_api_key', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ value: {} }),
        });
        setJinaKeyMasked('');
        setJinaKey('');
    };


    const { data: currentTenant } = useQuery({
        queryKey: ['tenant', selectedTenantId],
        queryFn: () => fetchJson<any>(`/tenants/${selectedTenantId}`),
        enabled: !!selectedTenantId,
    });

    // 鈹€鈹€鈹€ Stats (scoped to selected tenant)
    const { data: stats } = useQuery({
        queryKey: ['enterprise-stats', selectedTenantId],
        queryFn: () => fetchJson<any>(`/enterprise/stats${selectedTenantId ? `?tenant_id=${selectedTenantId}` : ''}`),
    });

    // 鈹€鈹€鈹€ LLM Models
    const { data: models = [] } = useQuery({
        queryKey: ['llm-models', selectedTenantId],
        queryFn: () => fetchJson<LLMModel[]>(`/enterprise/llm-models${selectedTenantId ? `?tenant_id=${selectedTenantId}` : ''}`),
        enabled: activeTab === 'llm',
    });
    const [showAddModel, setShowAddModel] = useState(false);
    const [editingModelId, setEditingModelId] = useState<string | null>(null);
    const [modelForm, setModelForm] = useState({ provider: PREFERRED_PROVIDER_ORDER[0] || 'deepseek', model: '', api_key: '', base_url: '', label: '', supports_vision: false, max_output_tokens: '' as string, request_timeout: '' as string, temperature: '' as string });
    const { data: providerSpecs = [] } = useQuery({
        queryKey: ['llm-provider-specs'],
        queryFn: () => fetchJson<LLMProviderSpec[]>('/enterprise/llm-providers'),
        enabled: activeTab === 'llm',
    });
    const providerOptions = useMemo(() => {
        const options = providerSpecs.length > 0 ? providerSpecs : FALLBACK_LLM_PROVIDERS;
        const priority = new Map(PREFERRED_PROVIDER_ORDER.map((provider, index) => [provider, index]));
        return [...options].sort((left, right) => {
            const leftOrder = priority.get(left.provider) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = priority.get(right.provider) ?? Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            return left.display_name.localeCompare(right.display_name);
        });
    }, [providerSpecs]);
    const [probeUi, setProbeUi] = useState<ProbeUiState>({
        status: 'idle',
        message: t('enterprise.llm.probeIdleMessage', '\u5148\u586b\u5199\u63d0\u4f9b\u5546\u3001\u6a21\u578b\u540d\u3001Base URL \u548c API Key\uff0c\u518d\u70b9\u51fb\u201c\u6d4b\u8bd5\u5e76\u81ea\u52a8\u586b\u5199\u201d\u3002'),
        detail: '',
        appliedFields: [],
    });
    const modelProviderOptions = useMemo(() => {
        if (!modelForm.provider || providerOptions.some((provider) => provider.provider === modelForm.provider)) {
            return providerOptions;
        }
        return [
            ...providerOptions,
            {
                provider: modelForm.provider,
                display_name: modelForm.provider,
                protocol: 'openai_compatible',
                default_base_url: null,
                supports_tool_choice: true,
                default_max_tokens: 4096,
            },
        ];
    }, [modelForm.provider, providerOptions]);
    const resetProbeUi = () => {
        setProbeUi({
            status: 'idle',
            message: t('enterprise.llm.probeIdleMessage', '\u5148\u586b\u5199\u63d0\u4f9b\u5546\u3001\u6a21\u578b\u540d\u3001Base URL \u548c API Key\uff0c\u518d\u70b9\u51fb\u201c\u6d4b\u8bd5\u5e76\u81ea\u52a8\u586b\u5199\u201d\u3002'),
            detail: '',
            appliedFields: [],
        });
    };
    const markProbeDirty = () => {
        setProbeUi((current) => {
            if (current.status === 'testing') {
                return current;
            }
            return {
                status: 'dirty',
                message: t('enterprise.llm.probeDirtyMessage', '\u914d\u7f6e\u5df2\u4fee\u6539\uff0c\u8bf7\u91cd\u65b0\u6d4b\u8bd5\u4ee5\u66f4\u65b0\u8bc6\u522b\u7ed3\u679c\u3002'),
                detail: '',
                appliedFields: [],
            };
        });
    };
    const patchModelForm = (updates: Partial<typeof modelForm>) => {
        setModelForm((current) => ({ ...current, ...updates }));
        markProbeDirty();
    };
    const closeModelEditor = () => {
        setShowAddModel(false);
        setEditingModelId(null);
        resetProbeUi();
    };
    const openAddModelEditor = () => {
        setEditingModelId(null);
        const defaultSpec = providerOptions[0];
        setModelForm({
            provider: defaultSpec?.provider || PREFERRED_PROVIDER_ORDER[0] || 'deepseek',
            model: '',
            api_key: '',
            base_url: defaultSpec?.default_base_url || '',
            label: '',
            supports_vision: false,
            max_output_tokens: defaultSpec ? String(defaultSpec.default_max_tokens) : '4096',
            request_timeout: '',
            temperature: '',
        });
        setShowAddModel(true);
        resetProbeUi();
    };
    const openEditModelEditor = (model: LLMModel) => {
        setEditingModelId(model.id);
        setModelForm({
            provider: model.provider,
            model: model.model,
            label: model.label,
            base_url: model.base_url || '',
            api_key: model.api_key_masked || '',
            supports_vision: model.supports_vision || false,
            max_output_tokens: model.max_output_tokens ? String(model.max_output_tokens) : '',
            request_timeout: model.request_timeout ? String(model.request_timeout) : '',
            temperature: model.temperature !== null && model.temperature !== undefined ? String(model.temperature) : '',
        });
        setShowAddModel(true);
        resetProbeUi();
    };
    const getGatewayProfileLabel = (gatewayProfile?: string | null) => {
        switch (gatewayProfile) {
            case 'official-anthropic-compatible':
                return t('enterprise.llm.gatewayProfiles.officialAnthropicCompatible');
            case 'official-openai-compatible':
                return t('enterprise.llm.gatewayProfiles.officialOpenAICompatible');
            case 'official-openai-responses':
                return t('enterprise.llm.gatewayProfiles.officialOpenAIResponses');
            case 'custom-openai-compatible':
                return t('enterprise.llm.gatewayProfiles.customOpenAICompatible');
            case 'unknown':
                return t('enterprise.llm.gatewayProfiles.unknown');
            default:
                return gatewayProfile || '';
        }
    };
    const describeProbeResult = (result: LLMProbeResult, appliedFields: ('resolved_provider' | 'recommended_model' | 'normalized_base_url')[]) => {
        const parts: string[] = [];
        if (typeof result.latency_ms === 'number') {
            parts.push(t('enterprise.llm.probeLatency', { latency: result.latency_ms, defaultValue: '\u5ef6\u8fdf {{latency}}ms' }));
        }
        const gatewayLabel = getGatewayProfileLabel(result.gateway_profile);
        if (gatewayLabel) {
            parts.push(t('enterprise.llm.probeGatewayHint', { hint: gatewayLabel }));
        }
        if (result.resolved_provider) {
            parts.push(t('enterprise.llm.probeResolvedProvider', { provider: result.resolved_provider, defaultValue: '\u8bc6\u522b\u63d0\u4f9b\u5546\uff1a{{provider}}' }));
        }
        if (result.recommended_model) {
            parts.push(t('enterprise.llm.probeRecommendedModel', { model: result.recommended_model, defaultValue: '\u5efa\u8bae\u6a21\u578b\uff1a{{model}}' }));
        }
        if (result.normalized_base_url) {
            parts.push(t('enterprise.llm.probeNormalizedBaseUrl', { url: result.normalized_base_url, defaultValue: '\u89c4\u8303 Base URL\uff1a{{url}}' }));
        }
        if (appliedFields.length > 0) {
            parts.push(t('enterprise.llm.probeAutofillSummary', '\u5df2\u6309\u63a2\u6d4b\u7ed3\u679c\u81ea\u52a8\u56de\u586b'));
        }
        return parts.join(' / ');
    };
    const runLlmProbe = async () => {
        setProbeUi({
            status: 'testing',
            message: t('enterprise.llm.testingAndAutofill', '\u6d4b\u8bd5\u4e2d\uff0c\u6b63\u5728\u8bc6\u522b\u63a5\u53e3...'),
            detail: '',
            appliedFields: [],
        });
        try {
            const apiKey = modelForm.api_key.trim();
            const result = await enterpriseApi.llmProbe({
                provider: modelForm.provider,
                model: modelForm.model.trim(),
                base_url: modelForm.base_url.trim() || undefined,
                api_key: apiKey && !apiKey.startsWith('****') ? apiKey : undefined,
                model_id: editingModelId || undefined,
            });
            if (!result.success) {
                const errorText = result.error_message || result.error_code || t('enterprise.llm.probeFailedFallback', '\u8fde\u63a5\u6d4b\u8bd5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 API Key\u3001\u6a21\u578b\u540d\u548c Base URL\u3002');
                const detail = [
                    result.error_code ? t('enterprise.llm.probeErrorCode', { code: result.error_code, defaultValue: '\u9519\u8bef\u4ee3\u7801\uff1a{{code}}' }) : '',
                    typeof result.latency_ms === 'number' ? t('enterprise.llm.probeLatency', { latency: result.latency_ms, defaultValue: '\u5ef6\u8fdf {{latency}}ms' }) : '',
                ].filter(Boolean).join(' / ');
                setProbeUi({
                    status: 'test_failed',
                    message: t('enterprise.llm.probeFailedInline', { error: errorText, defaultValue: '\u6d4b\u8bd5\u5931\u8d25\uff1a{{error}}' }),
                    detail,
                    appliedFields: [],
                    result,
                });
                return;
            }

            const appliedFields: ('resolved_provider' | 'recommended_model' | 'normalized_base_url')[] = [];
            const nextProvider = result.resolved_provider || modelForm.provider;
            const nextModel = result.recommended_model || modelForm.model;
            const nextBaseUrl = result.normalized_base_url || modelForm.base_url;

            if (result.resolved_provider && result.resolved_provider !== modelForm.provider) {
                appliedFields.push('resolved_provider');
            }
            if (result.recommended_model && result.recommended_model !== modelForm.model) {
                appliedFields.push('recommended_model');
            }
            if (result.normalized_base_url && result.normalized_base_url !== modelForm.base_url) {
                appliedFields.push('normalized_base_url');
            }

            setModelForm((current) => ({
                ...current,
                provider: nextProvider,
                model: nextModel,
                base_url: nextBaseUrl,
            }));

            setProbeUi({
                status: appliedFields.length > 0 ? 'autofill_applied' : 'test_success',
                message: appliedFields.length > 0
                    ? t('enterprise.llm.probeAutofillAppliedMessage', '\u6d4b\u8bd5\u6210\u529f\uff0c\u5df2\u81ea\u52a8\u586b\u5199\u8bc6\u522b\u51fa\u7684\u914d\u7f6e\u3002')
                    : t('enterprise.llm.probeSuccessMessage', '\u6d4b\u8bd5\u6210\u529f\uff0c\u53ef\u4ee5\u7ee7\u7eed\u4fdd\u5b58\u5f53\u524d\u6a21\u578b\u3002'),
                detail: describeProbeResult(result, appliedFields),
                appliedFields,
                result,
            });
        } catch (e: any) {
            setProbeUi({
                status: 'test_failed',
                message: t('enterprise.llm.probeRequestError', { message: e?.message || t('common.error'), defaultValue: '\u8bf7\u6c42\u5931\u8d25\uff1a{message}' }),
                detail: '',
                appliedFields: [],
            });
        }
    };
    const canRunProbe = Boolean(modelForm.model.trim()) && (Boolean(editingModelId) || Boolean(modelForm.api_key.trim()));
    const canSaveModel = Boolean(modelForm.model.trim()) && (Boolean(editingModelId) || Boolean(modelForm.api_key.trim()));
    const addModel = useMutation({
        mutationFn: (data: any) => fetchJson(`/enterprise/llm-models${selectedTenantId ? `?tenant_id=${selectedTenantId}` : ''}`, { method: 'POST', body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['llm-models', selectedTenantId] }); closeModelEditor(); },
    });
    const updateModel = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => fetchJson(`/enterprise/llm-models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['llm-models', selectedTenantId] }); closeModelEditor(); },
    });
    const deleteModel = useMutation({
        mutationFn: async ({ id, force = false }: { id: string; force?: boolean }) => {
            const url = force ? `/enterprise/llm-models/${id}?force=true` : `/enterprise/llm-models/${id}`;
            const res = await fetch(`/api${url}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (res.status === 409) {
                const data = await res.json();
                const agents = data.detail?.agents || [];
                const msg = `This model is used by ${agents.length} agent(s):\n\n${agents.join(', ')}\n\nDelete anyway? (their model config will be cleared)`;
                if (confirm(msg)) {
                    // Retry with force
                    const r2 = await fetch(`/api/enterprise/llm-models/${id}?force=true`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                    });
                    if (!r2.ok && r2.status !== 204) throw new Error('Delete failed');
                }
                return;
            }
            if (!res.ok && res.status !== 204) throw new Error('Delete failed');
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-models', selectedTenantId] }),
    });

    // 鈹€鈹€鈹€ Approvals
    const { data: approvals = [] } = useQuery({
        queryKey: ['approvals', selectedTenantId],
        queryFn: () => fetchJson<any[]>(`/enterprise/approvals${selectedTenantId ? `?tenant_id=${selectedTenantId}` : ''}`),
        enabled: activeTab === 'approvals',
    });
    const resolveApproval = useMutation({
        mutationFn: ({ id, action }: { id: string; action: string }) =>
            fetchJson(`/enterprise/approvals/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', selectedTenantId] }),
    });

    // 鈹€鈹€鈹€ Audit Logs
    const BG_ACTIONS = ['supervision_tick', 'supervision_fire', 'supervision_error', 'schedule_tick', 'schedule_fire', 'schedule_error', 'heartbeat_tick', 'heartbeat_fire', 'heartbeat_error', 'server_startup'];
    const { data: auditLogs = [] } = useQuery({
        queryKey: ['audit-logs', selectedTenantId],
        queryFn: () => fetchJson<any[]>(`/enterprise/audit-logs?limit=200${selectedTenantId ? `&tenant_id=${selectedTenantId}` : ''}`),
        enabled: activeTab === 'audit',
    });
    const filteredAuditLogs = auditLogs.filter((log: any) => {
        if (auditFilter === 'background') return BG_ACTIONS.includes(log.action);
        if (auditFilter === 'actions') return !BG_ACTIONS.includes(log.action);
        return true;
    });

    return (
        <>
            <div>
                <div className="page-header">
                    <div>
                        <h1 className="page-title">{t('nav.enterprise')}</h1>
                        {stats && (
                            <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
                                <span className="badge badge-info">{t('enterprise.stats.users', { count: stats.total_users })}</span>
                                <span className="badge badge-success">{t('enterprise.stats.runningAgents', { running: stats.running_agents, total: stats.total_agents })}</span>
                                {stats.pending_approvals > 0 && <span className="badge badge-warning">{stats.pending_approvals} {t('enterprise.tabs.approvals')}</span>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="tabs">
                    {(['info', 'llm', 'tools', 'skills', 'invites', 'quotas', 'users', 'org', 'approvals', 'audit'] as const).map(tab => (
                        <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                            {tab === 'quotas' ? t('enterprise.tabs.quotas', 'Quotas') : tab === 'users' ? t('enterprise.tabs.users', 'Users') : tab === 'invites' ? t('enterprise.tabs.invites', 'Invitations') : t(`enterprise.tabs.${tab}`)}
                        </div>
                    ))}
                </div>

                {/* 鈹€鈹€ LLM Model Pool 鈹€鈹€ */}
                {activeTab === 'llm' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                            <button className="btn btn-primary" onClick={openAddModelEditor}>+ {t('enterprise.llm.addModel')}</button>
                        </div>

                        {/* Add Model form 鈥?only shown at top when adding new */}
                        {showAddModel && !editingModelId && (
                            <div className="card" style={{ marginBottom: '16px' }}>
                                <h3 style={{ marginBottom: '16px' }}>{t('enterprise.llm.addModel')}</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.provider')}</label>
                                        <select className="form-input" value={modelForm.provider} onChange={e => {
                                            const newProvider = e.target.value;
                                            const spec = providerOptions.find(p => p.provider === newProvider);
                                            const updates: any = { provider: newProvider };
                                            if (spec?.default_base_url) {
                                                updates.base_url = spec.default_base_url;
                                            } else {
                                                updates.base_url = '';
                                            }
                                            if (spec) {
                                                updates.max_output_tokens = String(spec.default_max_tokens);
                                            }
                                            patchModelForm(updates);
                                        }}>
                                            {modelProviderOptions.map((p) => (
                                                <option key={p.provider} value={p.provider}>{p.display_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.model')}</label>
                                        <input
                                            className="form-input"
                                            placeholder={t('enterprise.llm.modelPlaceholder', 'e.g. claude-sonnet-4-20250514')}
                                            value={modelForm.model}
                                            onChange={e => patchModelForm({ model: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.label')}</label>
                                        <input className="form-input" placeholder={t('enterprise.llm.labelPlaceholder')} value={modelForm.label} onChange={e => patchModelForm({ label: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.baseUrl')}</label>
                                        <input className="form-input" placeholder={t('enterprise.llm.baseUrlPlaceholder')} value={modelForm.base_url} onChange={e => patchModelForm({ base_url: e.target.value })} />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                        <label className="form-label">{t('enterprise.llm.apiKey')}</label>
                                        <input className="form-input" type="password" placeholder={t('enterprise.llm.apiKeyPlaceholder')} value={modelForm.api_key} onChange={e => patchModelForm({ api_key: e.target.value })} />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                            <input type="checkbox" checked={modelForm.supports_vision} onChange={e => patchModelForm({ supports_vision: e.target.checked })} />
                                            {t('enterprise.llm.supportsVision')}
                                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 400 }}>{t('enterprise.llm.supportsVisionDesc')}</span>
                                        </label>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.maxOutputTokens', 'Max Output Tokens')}</label>
                                        <input className="form-input" type="number" placeholder={t('enterprise.llm.maxOutputTokensPlaceholder', 'e.g. 4096')} value={modelForm.max_output_tokens} onChange={e => patchModelForm({ max_output_tokens: e.target.value })} />
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.llm.maxOutputTokensDesc', 'Limits generation length')}</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.requestTimeout', 'Request Timeout (s)')}</label>
                                        <input className="form-input" type="number" min="1" placeholder={t('enterprise.llm.requestTimeoutPlaceholder', 'e.g. 120 (Leave empty for default)')} value={modelForm.request_timeout} onChange={e => patchModelForm({ request_timeout: e.target.value })} />
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.llm.requestTimeoutDesc', 'Increase for slow local models.')}</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('enterprise.llm.temperature', 'Temperature')}</label>
                                        <input className="form-input" type="number" step="0.1" min="0" max="2" placeholder={t('enterprise.llm.temperaturePlaceholder', 'e.g. 0.7 or 1.0 (Leave empty for default)')} value={modelForm.temperature} onChange={e => patchModelForm({ temperature: e.target.value })} />
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.llm.temperatureDesc', 'Leave empty to use the provider default. o1/o3 reasoning models usually require 1.0')}</div>
                                    </div>
                                </div>
                                <LLMProbeStatusCard status={probeUi} t={t} />
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <button className="btn btn-secondary" onClick={closeModelEditor}>{t('common.cancel')}</button>
                                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} disabled={!canRunProbe || probeUi.status === 'testing'} onClick={runLlmProbe}>
                                        {probeUi.status === 'testing'
                                            ? t('enterprise.llm.testingAndAutofill', '\u6d4b\u8bd5\u4e2d\uff0c\u6b63\u5728\u8bc6\u522b\u63a5\u53e3...')
                                            : t('enterprise.llm.testAndAutofill', '\u6d4b\u8bd5\u5e76\u81ea\u52a8\u586b\u5199')}
                                    </button>
                                    <button className="btn btn-primary" onClick={() => {
                                        const data = {
                                            ...modelForm,
                                            max_output_tokens: modelForm.max_output_tokens ? Number(modelForm.max_output_tokens) : null,
                                            request_timeout: modelForm.request_timeout ? Number(modelForm.request_timeout) : null,
                                            temperature: modelForm.temperature !== '' ? Number(modelForm.temperature) : null
                                        };
                                        addModel.mutate(data);
                                    }} disabled={!canSaveModel}>
                                        {t('common.save')}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {models.map((m) => (
                                <div key={m.id}>
                                    {editingModelId === m.id ? (
                                        /* Inline edit form */
                                        <div className="card" style={{ border: '1px solid var(--accent-primary)' }}>
                                            <h3 style={{ marginBottom: '16px' }}>{t('enterprise.llm.editModel')}</h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.provider')}</label>
                                                    <select className="form-input" value={modelForm.provider} onChange={e => {
                                                        const newProvider = e.target.value;
                                                        const spec = providerOptions.find((provider) => provider.provider === newProvider);
                                                        const updates: Partial<typeof modelForm> = { provider: newProvider };
                                                        if (spec) {
                                                            updates.base_url = spec.default_base_url || '';
                                                            updates.max_output_tokens = String(spec.default_max_tokens);
                                                        }
                                                        patchModelForm(updates);
                                                    }}>
                                                        {modelProviderOptions.map((p) => (
                                                            <option key={p.provider} value={p.provider}>{p.display_name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.model')}</label>
                                                    <input
                                                        className="form-input"
                                                        placeholder={t('enterprise.llm.modelPlaceholder', 'e.g. claude-sonnet-4-20250514')}
                                                        value={modelForm.model}
                                                        onChange={e => patchModelForm({ model: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.label')}</label>
                                                    <input className="form-input" placeholder={t('enterprise.llm.labelPlaceholder')} value={modelForm.label} onChange={e => patchModelForm({ label: e.target.value })} />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.baseUrl')}</label>
                                                    <input className="form-input" placeholder={t('enterprise.llm.baseUrlPlaceholder')} value={modelForm.base_url} onChange={e => patchModelForm({ base_url: e.target.value })} />
                                                </div>
                                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                                    <label className="form-label">{t('enterprise.llm.apiKey')}</label>
                                                    <input className="form-input" type="password" placeholder={t('enterprise.llm.apiKeyKeepPlaceholder', isChineseUi ? '\u7559\u7a7a\u5219\u4fdd\u7559\u5f53\u524d API Key' : 'Leave blank to keep the current API key')} value={modelForm.api_key} onChange={e => patchModelForm({ api_key: e.target.value })} />
                                                </div>
                                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                                        <input type="checkbox" checked={modelForm.supports_vision} onChange={e => patchModelForm({ supports_vision: e.target.checked })} />
                                                        {t('enterprise.llm.supportsVision')}
                                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 400 }}>{t('enterprise.llm.supportsVisionDesc')}</span>
                                                    </label>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.maxOutputTokens', 'Max Output Tokens')}</label>
                                                    <input className="form-input" type="number" placeholder={t('enterprise.llm.maxOutputTokensPlaceholder', 'e.g. 4096')} value={modelForm.max_output_tokens} onChange={e => patchModelForm({ max_output_tokens: e.target.value })} />
                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.llm.maxOutputTokensDesc', 'Limits generation length')}</div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.requestTimeout', 'Request Timeout (s)')}</label>
                                                    <input className="form-input" type="number" min="1" placeholder={t('enterprise.llm.requestTimeoutPlaceholder', 'e.g. 120 (Leave empty for default)')} value={modelForm.request_timeout} onChange={e => patchModelForm({ request_timeout: e.target.value })} />
                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.llm.requestTimeoutDesc', 'Increase for slow local models.')}</div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">{t('enterprise.llm.temperature', 'Temperature')}</label>
                                                    <input className="form-input" type="number" step="0.1" min="0" max="2" placeholder={t('enterprise.llm.temperaturePlaceholder', 'e.g. 0.7 or 1.0 (Leave empty for default)')} value={modelForm.temperature} onChange={e => patchModelForm({ temperature: e.target.value })} />
                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.llm.temperatureDesc', 'Leave empty to use the provider default. o1/o3 reasoning models usually require 1.0')}</div>
                                                </div>
                                            </div>
                                            <LLMProbeStatusCard status={probeUi} t={t} />
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button className="btn btn-secondary" onClick={closeModelEditor}>{t('common.cancel')}</button>
                                                <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} disabled={!canRunProbe || probeUi.status === 'testing'} onClick={runLlmProbe}>
                                                    {probeUi.status === 'testing'
                                                        ? t('enterprise.llm.testingAndAutofill', '\u6d4b\u8bd5\u4e2d\uff0c\u6b63\u5728\u8bc6\u522b\u63a5\u53e3...')
                                                        : t('enterprise.llm.testAndAutofill', '\u6d4b\u8bd5\u5e76\u81ea\u52a8\u586b\u5199')}
                                                </button>
                                                <button className="btn btn-primary" onClick={() => {
                                                    const data = {
                                                        ...modelForm,
                                                        max_output_tokens: modelForm.max_output_tokens ? Number(modelForm.max_output_tokens) : null,
                                                        request_timeout: modelForm.request_timeout ? Number(modelForm.request_timeout) : null,
                                                        temperature: modelForm.temperature !== '' ? Number(modelForm.temperature) : null
                                                    };
                                                    updateModel.mutate({ id: editingModelId!, data });
                                                }} disabled={!canSaveModel}>
                                                    {t('common.save')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Normal model row */
                                        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontWeight: 500 }}>{m.label}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                    {m.provider}/{m.model}
                                                    {m.base_url && <span> / {m.base_url}</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {/* Toggle switch for enabled/disabled */}
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const token = localStorage.getItem('token');
                                                            await fetch(`/api/enterprise/llm-models/${m.id}`, {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                body: JSON.stringify({ enabled: !m.enabled }),
                                                            });
                                                            qc.invalidateQueries({ queryKey: ['llm-models', selectedTenantId] });
                                                        } catch (e) { console.error(e); }
                                                    }}
                                                    title={m.enabled ? t('enterprise.llm.clickToDisable', 'Click to disable') : t('enterprise.llm.clickToEnable', 'Click to enable')}
                                                    style={{
                                                        position: 'relative', width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                                                        background: m.enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary, #444)',
                                                        padding: 0, flexShrink: 0,
                                                    }}
                                                >
                                                    <span style={{
                                                        position: 'absolute', left: m.enabled ? '18px' : '2px', top: '2px',
                                                        width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                    }} />
                                                </button>
                                                {m.supports_vision && <span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: 'rgb(99,102,241)', fontSize: '10px' }}>Vision</span>}
                                                <button className="btn btn-ghost" onClick={() => {
                                                    openEditModelEditor(m);
                                                }} style={{ fontSize: '12px' }}>{t('enterprise.tools.edit')}</button>
                                                <button className="btn btn-ghost" onClick={() => deleteModel.mutate({ id: m.id })} style={{ color: 'var(--error)' }}>{t('common.delete')}</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {models.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>{t('common.noData')}</div>}
                        </div>
                    </div>
                )}

                {/* 鈹€鈹€ Org Structure 鈹€鈹€ */}
                {activeTab === 'org' && <OrgTab tenant={currentTenant} />}

                {/* 鈹€鈹€ Approvals 鈹€鈹€ */}
                {activeTab === 'approvals' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {approvals.map((a: any) => (
                            <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 500 }}>{a.action_type}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                        {a.agent_name || `Agent ${a.agent_id.slice(0, 8)}`} / {new Date(a.created_at).toLocaleString()}
                                    </div>
                                </div>
                                {a.status === 'pending' ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" onClick={() => resolveApproval.mutate({ id: a.id, action: 'approve' })}>{t('common.confirm')}</button>
                                        <button className="btn btn-danger" onClick={() => resolveApproval.mutate({ id: a.id, action: 'reject' })}>Reject</button>
                                    </div>
                                ) : (
                                    <span className={`badge ${a.status === 'approved' ? 'badge-success' : 'badge-error'}`}>
                                        {a.status === 'approved' ? 'Approved' : 'Rejected'}
                                    </span>
                                )}
                            </div>
                        ))}
                        {approvals.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>{t('common.noData')}</div>}
                    </div>
                )}

                {/* 鈹€鈹€ Audit Logs 鈹€鈹€ */}
                {activeTab === 'audit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {/* Sub-filter pills */}
                        <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                            {([
                                ['all', t('enterprise.audit.filterAll')],
                                ['background', t('enterprise.audit.filterBackground')],
                                ['actions', t('enterprise.audit.filterActions')],
                            ] as const).map(([key, label]) => (
                                <button key={key}
                                    onClick={() => setAuditFilter(key as any)}
                                    style={{
                                        padding: '4px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                                        border: auditFilter === key ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                                        background: auditFilter === key ? 'var(--accent-primary)' : 'transparent',
                                        color: auditFilter === key ? '#fff' : 'var(--text-secondary)',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >{label}</button>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                                {t('enterprise.audit.records', { count: filteredAuditLogs.length })}
                            </span>
                        </div>
                        {/* Log entries */}
                        {filteredAuditLogs.map((log: any) => {
                            const isBg = BG_ACTIONS.includes(log.action);
                            const details = log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 ? log.details : null;
                            return (
                                <div key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '6px 12px' }}>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '13px', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                            {new Date(log.created_at).toLocaleString()}
                                        </span>
                                        <span style={{
                                            padding: '1px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500,
                                            background: isBg ? 'rgba(99,102,241,0.12)' : 'rgba(34,197,94,0.12)',
                                            color: isBg ? 'var(--accent-color)' : 'rgb(34,197,94)',
                                        }}>{isBg ? t('enterprise.audit.filterBackground') : t('enterprise.audit.filterActions')}</span>
                                        <span style={{ flex: 1, fontWeight: 500 }}>{log.action}</span>
                                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{log.agent_id?.slice(0, 8) || '-'}</span>
                                    </div>
                                    {details && (
                                        <div style={{ marginLeft: '100px', marginTop: '2px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                                            {Object.entries(details).map(([k, v]) => (
                                                <span key={k} style={{ marginRight: '12px' }}>{k}={typeof v === 'string' ? v : JSON.stringify(v)}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredAuditLogs.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>{t('common.noData')}</div>}
                    </div>
                )}

                {/* 鈹€鈹€ Company Management 鈹€鈹€ */}
                {activeTab === 'info' && (
                    <div>

                        {/* 鈹€鈹€ 0. Company Name 鈹€鈹€ */}
                        <h3 style={{ marginBottom: '8px' }}>{t('enterprise.companyName.title', 'Company Name')}</h3>
                        <CompanyNameEditor key={`name-${selectedTenantId}`} />

                        {/* 鈹€鈹€ 0.5. Company Timezone 鈹€鈹€ */}
                        <CompanyTimezoneEditor key={`tz-${selectedTenantId}`} />

                        {/* 鈹€鈹€ 2. Company Intro 鈹€鈹€ */}
                        <h3 style={{ marginBottom: '8px' }}>{t('enterprise.companyIntro.title', 'Company Intro')}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                            {t('enterprise.companyIntro.description', 'Describe your company\'s mission, products, and culture. This information is included in every agent conversation as context.')}
                        </p>
                        <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
                            <textarea
                                className="form-input"
                                value={companyIntro}
                                onChange={e => setCompanyIntro(e.target.value)}
                                placeholder={`# Company Name\nClawith\n\n# About\nOpenClaw\uD83E\uDD9E For Teams\nOpen Source \u00B7 Multi-OpenClaw Collaboration\n\nOpenClaw empowers individuals.\nClawith scales it to frontier organizations.`}
                                style={{
                                    minHeight: '200px', resize: 'vertical',
                                    fontFamily: 'var(--font-mono)', fontSize: '13px',
                                    lineHeight: '1.6', whiteSpace: 'pre-wrap',
                                }}
                            />
                            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button className="btn btn-primary" onClick={saveCompanyIntro} disabled={companyIntroSaving}>
                                    {companyIntroSaving ? t('common.loading') : t('common.save', 'Save')}
                                </button>
                                {companyIntroSaved && <span style={{ color: 'var(--success)', fontSize: '12px' }}>{t('enterprise.config.saved', 'Saved')}</span>}
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                                    {'\u63d0\u793a\uff1a'}{t('enterprise.companyIntro.hint', 'This content appears in every agent\'s system prompt')}
                                </span>
                            </div>
                        </div>

                        {/* 鈹€鈹€ 2. Company Knowledge Base 鈹€鈹€ */}
                        <h3 style={{ marginBottom: '8px' }}>{t('enterprise.kb.title')}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                            {t('enterprise.kb.description', 'Shared files accessible to all agents via enterprise_info/ directory.')}
                        </p>
                        <div className="card" style={{ marginBottom: '24px', padding: '16px' }}>
                            <EnterpriseKBBrowser onRefresh={() => setInfoRefresh((v: number) => v + 1)} refreshKey={infoRefresh} />
                        </div>



                        {/* 鈹€鈹€ Theme Color 鈹€鈹€ */}
                        <ThemeColorPicker />

                        {/* 鈹€鈹€ Broadcast 鈹€鈹€ */}
                        <BroadcastSection />

                        {/* 鈹€鈹€ Danger Zone: Delete Company 鈹€鈹€ */}
                        <div style={{ marginTop: '32px', padding: '16px', border: '1px solid var(--status-error, #e53e3e)', borderRadius: '8px' }}>
                            <h3 style={{ marginBottom: '4px', color: 'var(--status-error, #e53e3e)' }}>{t('enterprise.dangerZone', 'Danger Zone')}</h3>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                                {t('enterprise.deleteCompanyDesc', 'Permanently delete this company and all its data including agents, models, tools, and skills. This action cannot be undone.')}
                            </p>
                            <button
                                className="btn"
                                onClick={async () => {
                                    const name = document.querySelector<HTMLInputElement>('.company-name-input')?.value || selectedTenantId;
                                    if (!confirm(t('enterprise.deleteCompanyConfirm', 'Are you sure you want to delete this company and ALL its data? This cannot be undone.'))) return;
                                    try {
                                        const res = await fetchJson<any>(`/tenants/${selectedTenantId}`, { method: 'DELETE' });
                                        // Switch to fallback tenant
                                        const fallbackId = res.fallback_tenant_id;
                                        localStorage.setItem('current_tenant_id', fallbackId);
                                        setSelectedTenantId(fallbackId);
                                        window.dispatchEvent(new StorageEvent('storage', { key: 'current_tenant_id', newValue: fallbackId }));
                                        qc.invalidateQueries({ queryKey: ['tenants'] });
                                    } catch (e: any) {
                                        alert(e.message || 'Delete failed');
                                    }
                                }}
                                style={{
                                    background: 'transparent', color: 'var(--status-error, #e53e3e)',
                                    border: '1px solid var(--status-error, #e53e3e)', borderRadius: '6px',
                                    padding: '6px 16px', fontSize: '13px', cursor: 'pointer',
                                }}
                            >
                                {t('enterprise.deleteCompany', 'Delete This Company')}
                            </button>
                        </div>
                    </div>
                )}

                {/* 鈹€鈹€ Quotas Tab 鈹€鈹€ */}
                {activeTab === 'quotas' && (
                    <div>
                        <h3 style={{ marginBottom: '4px' }}>{t('enterprise.quotas.defaultUserQuotas')}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                            {t('enterprise.quotas.defaultsApply')}
                        </p>
                        <div className="card" style={{ padding: '16px' }}>
                            {/* 鈹€鈹€ Conversation Limits 鈹€鈹€ */}
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>{t('enterprise.quotas.conversationLimits')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.messageLimit')}</label>
                                    <input className="form-input" type="number" min={0} value={quotaForm.default_message_limit}
                                        onChange={e => setQuotaForm({ ...quotaForm, default_message_limit: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.quotas.maxMessagesPerPeriod')}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.messagePeriod')}</label>
                                    <select className="form-input" value={quotaForm.default_message_period}
                                        onChange={e => setQuotaForm({ ...quotaForm, default_message_period: e.target.value })}>
                                        <option value="permanent">{t('enterprise.quotas.permanent')}</option>
                                        <option value="daily">{t('enterprise.quotas.daily')}</option>
                                        <option value="weekly">{t('enterprise.quotas.weekly')}</option>
                                        <option value="monthly">{t('enterprise.quotas.monthly')}</option>
                                    </select>
                                </div>
                            </div>

                            {/* 鈹€鈹€ Agent Limits 鈹€鈹€ */}
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>{t('enterprise.quotas.agentLimits')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.maxAgents')}</label>
                                    <input className="form-input" type="number" min={0} value={quotaForm.default_max_agents}
                                        onChange={e => setQuotaForm({ ...quotaForm, default_max_agents: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.quotas.agentsUserCanCreate')}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.agentTTL')}</label>
                                    <input className="form-input" type="number" min={1} value={quotaForm.default_agent_ttl_hours}
                                        onChange={e => setQuotaForm({ ...quotaForm, default_agent_ttl_hours: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.quotas.agentAutoExpiry')}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.dailyLLMCalls')}</label>
                                    <input className="form-input" type="number" min={0} value={quotaForm.default_max_llm_calls_per_day}
                                        onChange={e => setQuotaForm({ ...quotaForm, default_max_llm_calls_per_day: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.quotas.maxLLMCallsPerDay')}</div>
                                </div>
                            </div>

                            {/* 鈹€鈹€ System Limits 鈹€鈹€ */}
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>{t('enterprise.quotas.system')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.minHeartbeatInterval')}</label>
                                    <input className="form-input" type="number" min={1} value={quotaForm.min_heartbeat_interval_minutes}
                                        onChange={e => setQuotaForm({ ...quotaForm, min_heartbeat_interval_minutes: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t('enterprise.quotas.minHeartbeatDesc')}</div>
                                </div>
                            </div>

                            {/* 鈹€鈹€ Trigger Limits 鈹€鈹€ */}
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>{t('enterprise.quotas.triggerLimits')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.defaultMaxTriggers', 'Default Max Triggers')}</label>
                                    <input className="form-input" type="number" min={1} max={100} value={quotaForm.default_max_triggers}
                                        onChange={e => setQuotaForm({ ...quotaForm, default_max_triggers: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                        {t('enterprise.quotas.defaultMaxTriggersDesc', 'Default trigger limit for new agents')}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.minPollInterval', 'Min Poll Interval (min)')}</label>
                                    <input className="form-input" type="number" min={1} max={60} value={quotaForm.min_poll_interval_floor}
                                        onChange={e => setQuotaForm({ ...quotaForm, min_poll_interval_floor: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                        {t('enterprise.quotas.minPollIntervalDesc', 'Company-wide floor: agents cannot poll faster than this')}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('enterprise.quotas.maxWebhookRate', 'Max Webhook Rate (/min)')}</label>
                                    <input className="form-input" type="number" min={1} max={60} value={quotaForm.max_webhook_rate_ceiling}
                                        onChange={e => setQuotaForm({ ...quotaForm, max_webhook_rate_ceiling: Number(e.target.value) })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                        {t('enterprise.quotas.maxWebhookRateDesc', 'Company-wide ceiling: max webhook hits per minute per agent')}
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button className="btn btn-primary" onClick={saveQuotas} disabled={quotaSaving}>
                                    {quotaSaving ? t('common.loading') : t('common.save', 'Save')}
                                </button>
                                {quotaSaved && <span style={{ color: 'var(--success)', fontSize: '12px' }}>{t('enterprise.config.saved', 'Saved')}</span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* 鈹€鈹€ Users Tab 鈹€鈹€ */}
                {activeTab === 'users' && (
                    <UserManagement key={selectedTenantId} />
                )}


                {/* 鈹€鈹€ Tools Tab 鈹€鈹€ */}
                {activeTab === 'tools' && (
                    <div>
                        {/* Sub-tab pills */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                            {([['global', t('enterprise.tools.globalTools')], ['agent-installed', t('enterprise.tools.agentInstalled')]] as const).map(([key, label]) => (
                                <button key={key} onClick={() => { setToolsView(key as any); if (key === 'agent-installed') loadAgentInstalledTools(); }} style={{
                                    padding: '4px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none',
                                    background: toolsView === key ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                    color: toolsView === key ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s',
                                }}>{label}</button>
                            ))}
                        </div>

                        {/* Agent-Installed Tools */}
                        {toolsView === 'agent-installed' && (
                            <div>
                                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>{t('enterprise.tools.agentInstalledHint')}</p>
                                {agentInstalledTools.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>{t('enterprise.tools.noAgentInstalledTools')}</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {agentInstalledTools.map((row: any) => (
                                            <div key={row.agent_tool_id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 500, fontSize: '13px' }}>{row.tool_display_name}</span>
                                                        {row.mcp_server_name && <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#fff', borderRadius: '4px', padding: '1px 5px' }}>MCP</span>}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                        {isChineseUi ? '\u5b89\u88c5\u6765\u6e90\uff1a' : 'Installed by '}{row.installed_by_agent_name || (isChineseUi ? '\u672a\u77e5 Agent' : 'Unknown Agent')}
                                                        {row.installed_at && <span> / {new Date(row.installed_at).toLocaleString()}</span>}
                                                    </div>
                                                </div>
                                                <button className="btn btn-ghost" style={{ color: 'var(--error)', fontSize: '12px' }} onClick={async () => {
                                                    if (!confirm(t('enterprise.tools.removeFromAgent', { name: row.tool_display_name }))) return;
                                                    try {
                                                        await fetchJson(`/tools/agent-tool/${row.agent_tool_id}`, { method: 'DELETE' });
                                                    } catch {
                                                        // Already deleted (e.g. removed via Global Tools) 鈥?just refresh
                                                    }
                                                    loadAgentInstalledTools();
                                                }}>{t('enterprise.tools.delete')}</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {toolsView === 'global' && <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3>{t('enterprise.tools.title')}</h3>
                                <button className="btn btn-primary" onClick={() => setShowAddMCP(true)}>+ {t('enterprise.tools.addMcpServer')}</button>
                            </div>

                            {showAddMCP && (
                                <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
                                    <h4 style={{ marginBottom: '12px' }}>{t('enterprise.tools.mcpServer')}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>{t('enterprise.tools.jsonConfig')}</label>
                                            <textarea className="form-input" value={mcpRawInput} onChange={e => {
                                                const val = e.target.value;
                                                setMcpRawInput(val);
                                                // Auto-parse JSON config format
                                                try {
                                                    const parsed = JSON.parse(val);
                                                    const servers = parsed.mcpServers || parsed;
                                                    const names = Object.keys(servers);
                                                    if (names.length > 0) {
                                                        const name = names[0];
                                                        const cfg = servers[name];
                                                        const url = cfg.url || cfg.uri || '';
                                                        setMcpForm(p => ({ ...p, server_name: name, server_url: url }));
                                                    }
                                                } catch {
                                                    // Not JSON 鈥?treat as plain URL
                                                    setMcpForm(p => ({ ...p, server_url: val }));
                                                }
                                            }} placeholder={'{\n  "mcpServers": {\n    "server-name": {\n      "type": "sse",\n      "url": "https://mcp.example.com/sse"\n    }\n  }\n}\n\nor paste a URL directly'} style={{ minHeight: '120px', fontFamily: 'var(--font-mono)', fontSize: '12px', resize: 'vertical' }} />
                                        </div>
                                        {mcpForm.server_name && (
                                            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                                                <span>Name: <strong>{mcpForm.server_name}</strong></span>
                                                <span>URL: <strong>{mcpForm.server_url}</strong></span>
                                            </div>
                                        )}
                                        {!mcpForm.server_name && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>{t('enterprise.tools.mcpServerName')}</label>
                                                <input className="form-input" value={mcpForm.server_name} onChange={e => setMcpForm(p => ({ ...p, server_name: e.target.value }))} placeholder="My MCP Server" />
                                            </div>
                                        )}

                                        {/* Optional standalone API Key 鈥?sent as Authorization: Bearer */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                                                API Key <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
                                            </label>
                                            <input
                                                type="password"
                                                className="form-input"
                                                value={mcpForm.api_key}
                                                onChange={e => setMcpForm(p => ({ ...p, api_key: e.target.value }))}
                                                placeholder="Leave blank if the key is already embedded in the URL"
                                                autoComplete="new-password"
                                            />
                                        </div>

                                        {/* Auth explanation for non-obvious behavior */}
                                        <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
                                            <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>How authentication works</div>
                                            <div>- If your MCP server embeds the key in the URL (e.g. Tavily uses <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 3px', borderRadius: '3px' }}>?tavilyApiKey=xxx</code>), leave the field above blank.</div>
                                            <div>- For servers that use <strong>Bearer token</strong> auth, enter the key here. It is sent as <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 3px', borderRadius: '3px' }}>Authorization: Bearer ...</code> on every request.</div>
                                            <div>- If both are provided, the API Key field takes priority. All keys are stored encrypted.</div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn btn-secondary" disabled={mcpTesting || !mcpForm.server_url} onClick={async () => {
                                                setMcpTesting(true); setMcpTestResult(null);
                                                try {
                                                    const r = await fetchJson<any>('/tools/test-mcp', { method: 'POST', body: JSON.stringify({ server_url: mcpForm.server_url, api_key: mcpForm.api_key || undefined }) });
                                                    setMcpTestResult(r);
                                                } catch (e: any) { setMcpTestResult({ ok: false, error: e.message }); }
                                                setMcpTesting(false);
                                            }}>{mcpTesting ? t('enterprise.tools.testing') : t('enterprise.tools.testConnection')}</button>
                                            <button className="btn btn-secondary" onClick={() => { setShowAddMCP(false); setMcpTestResult(null); setMcpForm({ server_url: '', server_name: '', api_key: '' }); setMcpRawInput(''); }}>{t('common.cancel')}</button>
                                        </div>
                                        {mcpTestResult && (
                                            <div className="card" style={{ padding: '12px', background: mcpTestResult.ok ? 'rgba(0,200,100,0.1)' : 'rgba(255,0,0,0.1)' }}>
                                                {mcpTestResult.ok ? (
                                                    <div>
                                                        <div style={{ color: 'var(--success)', fontWeight: 600, marginBottom: '8px' }}>{t('enterprise.tools.connectionSuccess', { count: mcpTestResult.tools?.length || 0 })}</div>
                                                        {(mcpTestResult.tools || []).map((tool: any, i: number) => (
                                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                                                                <div>
                                                                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{tool.name}</span>
                                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{tool.description?.slice(0, 80)}</div>
                                                                </div>
                                                                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={async () => {
                                                                    try {
                                                                        const serverName = mcpForm.server_name || mcpForm.server_url;
                                                                        await fetchJson('/tools', {
                                                                            method: 'POST', body: JSON.stringify({
                                                                                name: `mcp_${tool.name}`,
                                                                                display_name: tool.name,
                                                                                description: tool.description || '',
                                                                                type: 'mcp',
                                                                                category: 'custom',
                                                                                icon: 'M',
                                                                                mcp_server_url: mcpForm.server_url,
                                                                                mcp_server_name: serverName,
                                                                                mcp_tool_name: tool.name,
                                                                                parameters_schema: tool.inputSchema || {},
                                                                                is_default: false,
                                                                                tenant_id: selectedTenantId || undefined,
                                                                            })
                                                                        });
                                                                        // Store API key on all tools from this server after creation
                                                                        if (mcpForm.api_key) {
                                                                            await fetchJson('/tools/mcp-server', { method: 'PUT', body: JSON.stringify({ server_name: serverName, server_url: mcpForm.server_url, api_key: mcpForm.api_key, tenant_id: selectedTenantId || undefined }) }).catch(() => {});
                                                                        }
                                                                        await loadAllTools();
                                                                    } catch (e: any) {
                                                                        alert(`${t('enterprise.tools.importFailed') || 'Import failed'}: ${e.message}`);
                                                                    }
                                                                }}>{t('enterprise.tools.import') || 'Import'}</button>
                                                            </div>
                                                        ))}
                                                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                                            <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={async () => {
                                                                const tools = mcpTestResult.tools || [];
                                                                let successCount = 0;
                                                                const errors: string[] = [];
                                                                const serverName = mcpForm.server_name || mcpForm.server_url;
                                                                for (const tool of tools) {
                                                                    try {
                                                                        await fetchJson('/tools', {
                                                                            method: 'POST', body: JSON.stringify({
                                                                                name: `mcp_${tool.name}`,
                                                                                display_name: tool.name,
                                                                                description: tool.description || '',
                                                                                type: 'mcp',
                                                                                category: 'custom',
                                                                                icon: 'M',
                                                                                mcp_server_url: mcpForm.server_url,
                                                                                mcp_server_name: serverName,
                                                                                mcp_tool_name: tool.name,
                                                                                parameters_schema: tool.inputSchema || {},
                                                                                is_default: false,
                                                                                tenant_id: selectedTenantId || undefined,
                                                                            })
                                                                        });
                                                                        successCount++;
                                                                    } catch (e: any) {
                                                                        errors.push(`${tool.name}: ${e.message}`);
                                                                    }
                                                                }
                                                                // Store API key on all tools from this server in one request
                                                                if (mcpForm.api_key && successCount > 0) {
                                                                    await fetchJson('/tools/mcp-server', { method: 'PUT', body: JSON.stringify({ server_name: serverName, server_url: mcpForm.server_url, api_key: mcpForm.api_key, tenant_id: selectedTenantId || undefined }) }).catch(() => {});
                                                                }
                                                                await loadAllTools();
                                                                setShowAddMCP(false); setMcpTestResult(null); setMcpForm({ server_url: '', server_name: '', api_key: '' }); setMcpRawInput('');
                                                                if (errors.length > 0) {
                                                                    alert(`Imported ${successCount}/${tools.length} tools.\nFailed:\n${errors.join('\n')}`);
                                                                }
                                                            }}>{t('enterprise.tools.importAll')}</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ color: 'var(--danger)' }}>{t('enterprise.tools.connectionFailed')}: {mcpTestResult.error}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 鈹€鈹€鈹€ Category-grouped tool list 鈹€鈹€鈹€ */}
                            {(() => {
                                // Group tools by category (same pattern as AgentDetail.tsx)
                                const grouped = allTools.reduce((acc: Record<string, any[]>, tool: any) => {
                                    const cat = tool.category || 'general';
                                    (acc[cat] = acc[cat] || []).push(tool);
                                    return acc;
                                }, {} as Record<string, any[]>);

                                if (allTools.length === 0) {
                                    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>{t('enterprise.tools.emptyState')}</div>;
                                }

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {Object.entries(grouped).map(([category, catTools]) => {
                                            const hasCategoryConfig = !!GLOBAL_CATEGORY_CONFIG_SCHEMAS[category];

                                            // For 'custom' category: sub-group MCP tools by mcp_server_name
                                            // so that Edit Server is presented once per server, not per tool.
                                            if (category === 'custom') {
                                                const mcpByServer: Record<string, any[]> = {};
                                                const nonMcpTools: any[] = [];
                                                (catTools as any[]).forEach((t: any) => {
                                                    if (t.type === 'mcp' && t.mcp_server_name) {
                                                        (mcpByServer[t.mcp_server_name] = mcpByServer[t.mcp_server_name] || []).push(t);
                                                    } else {
                                                        nonMcpTools.push(t);
                                                    }
                                                });

                                                return (
                                                    <div key={category}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 14px', marginBottom: '8px' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                {categoryLabels[category] || category}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                                            {/* MCP servers sub-grouped */}
                                                            {Object.entries(mcpByServer).map(([serverName, serverTools]) => (
                                                                <div key={serverName} style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                                                                    {/* Server sub-header */}
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                                                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }} title={serverName}>{(() => { try { if (serverName.startsWith('http')) { return new URL(serverName).hostname; } } catch {} return serverName; })()}</span>
                                                                            <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.12)', color: 'var(--accent-color)', borderRadius: '4px', padding: '1px 5px' }}>MCP</span>
                                                                            {(serverTools as any[]).some((t: any) => t.config && Object.keys(t.config).length > 0) && (
                                                                                <span style={{ fontSize: '10px', background: 'rgba(0,200,100,0.12)', color: 'var(--success)', borderRadius: '4px', padding: '1px 5px' }}>Configured</span>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <button
                                                                                style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '3px 9px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                                                onClick={() => {
                                                                                    // Pre-fill with current server URL from first tool
                                                                                    const firstTool = (serverTools as any[])[0];
                                                                                    setEditingMcpServer({
                                                                                        server_name: serverName,
                                                                                        server_url: firstTool?.mcp_server_url || '',
                                                                                        api_key: '',
                                                                                    });
                                                                                }}
                                                                            >Edit Server</button>
                                                                            {/* Server-level enable/disable all toggle */}
                                                                            <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer', flexShrink: 0 }} title={`Enable/Disable all ${serverName} tools`}>
                                                                                <input type="checkbox"
                                                                                    checked={(serverTools as any[]).every(t => t.enabled)}
                                                                                    onChange={async (e) => {
                                                                                        const payload = (serverTools as any[]).map(t => ({ tool_id: t.id, enabled: e.target.checked }));
                                                                                        await fetchJson('/tools/bulk', { method: 'PUT', body: JSON.stringify(payload) });
                                                                                        loadAllTools();
                                                                                    }}
                                                                                    style={{ opacity: 0, width: 0, height: 0 }} />
                                                                                <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '22px', background: (serverTools as any[]).every(t => t.enabled) ? 'var(--accent-primary)' : 'var(--bg-tertiary)', transition: '0.3s' }}>
                                                                                    <span style={{ position: 'absolute', left: (serverTools as any[]).every(t => t.enabled) ? '20px' : '2px', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: '0.3s' }} />
                                                                                </span>
                                                                            </label>
                                                                        </div>
                                                                    </div>
                                                                    {/* Tools under this server */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                                                        {(serverTools as any[]).map((tool: any, toolIdx: number) => (
                                                                            <div key={tool.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: toolIdx < serverTools.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                                                    <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>M</span>
                                                                                    <div style={{ minWidth: 0 }}>
                                                                                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{tool.display_name}</div>
                                                                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description?.slice(0, 90)}</div>
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                                                    <button className="btn btn-danger" style={{ padding: '3px 7px', fontSize: '10px' }} onClick={async () => {
                                                                                        if (!confirm(`${t('common.delete')} ${tool.display_name}?`)) return;
                                                                                        await fetchJson(`/tools/${tool.id}`, { method: 'DELETE' });
                                                                                        await loadAllTools();
                                                                                    }}>{t('common.delete')}</button>
                                                                                    <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer', flexShrink: 0 }}>
                                                                                        <input type="checkbox" checked={tool.enabled} onChange={async (e) => {
                                                                                            await fetchJson(`/tools/${tool.id}`, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
                                                                                            loadAllTools();
                                                                                        }} style={{ opacity: 0, width: 0, height: 0 }} />
                                                                                        <span style={{ position: 'absolute', inset: 0, background: tool.enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)', borderRadius: '11px', transition: 'background 0.2s' }}>
                                                                                            <span style={{ position: 'absolute', left: tool.enabled ? '20px' : '2px', top: '2px', width: '18px', height: '18px', background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
                                                                                        </span>
                                                                                    </label>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {/* Non-MCP custom tools shown normally */}
                                                            {nonMcpTools.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    {nonMcpTools.map((tool: any) => {
                                                                        const hasOwnConfig = tool.config_schema?.fields?.length > 0;
                                                                        return (
                                                                            <div key={tool.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                                                        <span style={{ fontSize: '18px' }}>{tool.icon}</span>
                                                                                        <div style={{ minWidth: 0 }}>
                                                                                            <div style={{ fontWeight: 500, fontSize: '13px' }}>{tool.display_name}</div>
                                                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description?.slice(0, 80)}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                                                        {hasOwnConfig && (
                                                                                            <button style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => { setEditingToolId(tool.id); setEditingConfig({ ...tool.config }); }}>Configure</button>
                                                                                        )}
                                                                                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={async () => {
                                                                                            if (!confirm(`${t('common.delete')} ${tool.display_name}?`)) return;
                                                                                            await fetchJson(`/tools/${tool.id}`, { method: 'DELETE' });
                                                                                            loadAllTools();
                                                                                        }}>{t('common.delete')}</button>
                                                                                        <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer', flexShrink: 0 }}>
                                                                                            <input type="checkbox" checked={tool.enabled} onChange={async (e) => {
                                                                                                await fetchJson(`/tools/${tool.id}`, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
                                                                                                loadAllTools();
                                                                                            }} style={{ opacity: 0, width: 0, height: 0 }} />
                                                                                            <span style={{ position: 'absolute', inset: 0, background: tool.enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)', borderRadius: '11px', transition: 'background 0.2s' }}>
                                                                                                <span style={{ position: 'absolute', left: tool.enabled ? '20px' : '2px', top: '2px', width: '18px', height: '18px', background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
                                                                                            </span>
                                                                                        </label>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={category}>
                                                    {/* Category header */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 14px', marginBottom: '8px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                            {categoryLabels[category] || category}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {hasCategoryConfig && (
                                                                <button
                                                                    onClick={() => {
                                                                        setConfigCategory(category);
                                                                        setEditingConfig({});
                                                                        // Load existing global config from the first tool in this category that has a non-empty config.
                                                                        // Do NOT require config_schema 鈥?some categories (e.g. AgentBay)
                                                                        // define their schema only in frontend CATEGORY_CONFIG_SCHEMAS.
                                                                        const firstToolWithConfig = (catTools as any[]).find((tl: any) => tl.config && Object.keys(tl.config).length > 0);
                                                                        if (firstToolWithConfig?.config) {
                                                                            setEditingConfig({ ...firstToolWithConfig.config });
                                                                        }
                                                                    }}
                                                                    style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                                    title={`Configure ${category}`}
                                                                >
                                                                    {t('enterprise.tools.configure', 'Configure')}
                                                                </button>
                                                            )}
                                                            {/* Category Bulk Toggle */}
                                                            <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer', flexShrink: 0 }} title={`Enable/Disable all ${categoryLabels[category] || category} tools`}>
                                                                <input type="checkbox"
                                                                    checked={(catTools as any[]).every(t => t.enabled)}
                                                                    onChange={async (e) => {
                                                                        const targetEnabled = e.target.checked;
                                                                        try {
                                                                            const payload = (catTools as any[]).map(t => ({ tool_id: t.id, enabled: targetEnabled }));
                                                                            await fetchJson('/tools/bulk', { method: 'PUT', body: JSON.stringify(payload) });
                                                                            loadAllTools();
                                                                        } catch (err: any) {
                                                                            alert('Bulk update failed: ' + err.message);
                                                                        }
                                                                    }}
                                                                    style={{ opacity: 0, width: 0, height: 0 }} />
                                                                <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '22px', background: (catTools as any[]).every(t => t.enabled) ? 'var(--accent-primary)' : 'var(--bg-tertiary)', transition: '0.3s', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
                                                                    <span style={{ position: 'absolute', left: (catTools as any[]).every(t => t.enabled) ? '20px' : '2px', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: '0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
                                                                </span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* Tools in this category */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {(catTools as any[]).map((tool: any) => {
                                                            // If this category has shared config, individual tool config buttons are hidden
                                                            const hasOwnConfig = tool.config_schema?.fields?.length > 0 && !hasCategoryConfig;
                                                            const isEditing = editingToolId === tool.id;

                                                            return (
                                                                <div key={tool.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                                            <span style={{ fontSize: '18px' }}>{tool.icon}</span>
                                                                            <div style={{ minWidth: 0 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{tool.display_name}</span>
                                                                                    <span style={{ fontSize: '10px', background: tool.type === 'mcp' ? 'var(--primary)' : 'var(--bg-tertiary)', color: tool.type === 'mcp' ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', padding: '1px 5px' }}>
                                                                                        {tool.type === 'mcp' ? 'MCP' : 'Built-in'}
                                                                                    </span>
                                                                                    {tool.is_default && <span style={{ fontSize: '10px', background: 'rgba(0,200,100,0.15)', color: 'var(--success)', borderRadius: '4px', padding: '1px 5px' }}>Default</span>}
                                                                                    {tool.config && Object.keys(tool.config).length > 0 && (
                                                                                        <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-color)', borderRadius: '4px', padding: '1px 5px' }}>{t('enterprise.tools.configured', 'Configured')}</span>
                                                                                    )}
                                                                                </div>
                                                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                    {tool.description?.slice(0, 80)}
                                                                                    {tool.mcp_server_name && <span> / {tool.mcp_server_name}</span>}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                                            {/* Per-tool config button: only if the tool has its own schema AND is NOT part of a category config */}
                                                                            {hasOwnConfig && (
                                                                                <button
                                                                                    style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                                                    title={t('enterprise.tools.configureSettings', 'Configure settings')}
                                                                                    onClick={async () => {
                                                                                        setEditingToolId(tool.id);
                                                                                        const cfg = { ...tool.config };
                                                                                        if (tool.name === 'jina_search' || tool.name === 'jina_read') {
                                                                                            try {
                                                                                                const token = localStorage.getItem('token');
                                                                                                const res = await fetch('/api/enterprise/system-settings/jina_api_key', { headers: { Authorization: `Bearer ${token}` } });
                                                                                                const d = await res.json();
                                                                                                if (d.value?.api_key) cfg.api_key = d.value.api_key;
                                                                                            } catch { }
                                                                                        }
                                                                                        setEditingConfig(cfg);
                                                                                    }}
                                                                                >
                                                                                    {t('enterprise.tools.configure')}
                                                                                </button>
                                                                            )}

                                                                            {/* Delete (non-builtin only) */}
                                                                            {tool.type !== 'builtin' && (
                                                                                <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={async () => {
                                                                                    if (!confirm(`${t('common.delete')} ${tool.display_name}?`)) return;
                                                                                    await fetchJson(`/tools/${tool.id}`, { method: 'DELETE' });
                                                                                    loadAllTools();
                                                                                    loadAgentInstalledTools();
                                                                                }}>{t('common.delete')}</button>
                                                                            )}

                                                                            {/* Enable toggle */}
                                                                            <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer', flexShrink: 0 }}>
                                                                                <input type="checkbox" checked={tool.enabled} onChange={async (e) => {
                                                                                    await fetchJson(`/tools/${tool.id}`, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
                                                                                    loadAllTools();
                                                                                }} style={{ opacity: 0, width: 0, height: 0 }} />
                                                                                <span style={{ position: 'absolute', inset: 0, background: tool.enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)', borderRadius: '11px', transition: 'background 0.2s' }}>
                                                                                    <span style={{ position: 'absolute', left: tool.enabled ? '20px' : '2px', top: '2px', width: '18px', height: '18px', background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
                                                                                </span>
                                                                            </label>
                                                                        </div>
                                                                    </div>

                                                                    {/* Inline config editing form (per-tool only) */}
                                                                    {/* Inline config editing form replaced by global modal */}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* 鈹€鈹€鈹€ Edit MCP Server Modal 鈹€鈹€鈹€ */}
                            {editingMcpServer && (
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={e => { if (e.target === e.currentTarget) setEditingMcpServer(null); }}>
                                    <div className="card" style={{ width: '480px', maxWidth: '95vw', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px' }}>Edit MCP Server</h3>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: '6px' }}>
                                            <strong>{editingMcpServer.server_name}</strong>
                                            <span style={{ marginLeft: '8px', color: 'var(--text-tertiary)' }}>Updates all tools from this server at once</span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Server URL</label>
                                                <input
                                                    type="password"
                                                    className="form-input"
                                                    value={editingMcpServer.server_url}
                                                    onChange={e => setEditingMcpServer(s => s ? { ...s, server_url: e.target.value } : null)}
                                                    placeholder="https://mcp.example.com/sse"
                                                    autoComplete="off"
                                                />
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px' }}>Stored encrypted. For URL-embedded keys (e.g. Tavily), include the key directly here.</div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                                                    API Key <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
                                                </label>
                                                <input
                                                    type="password"
                                                    className="form-input"
                                                    value={editingMcpServer.api_key}
                                                    onChange={e => setEditingMcpServer(s => s ? { ...s, api_key: e.target.value } : null)}
                                                    placeholder="Leave blank to keep existing key"
                                                    autoComplete="new-password"
                                                />
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px' }}>Sent as <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 3px', borderRadius: '3px' }}>Authorization: Bearer ...</code> Takes priority over URL-embedded keys.</div>
                                            </div>

                                            {/* Auth explanation */}
                                            <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
                                                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>How authentication works</div>
                                                <div>- <strong>URL-embedded key</strong> (e.g. Tavily <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 3px', borderRadius: '3px' }}>?tavilyApiKey=xxx</code>): include in Server URL above, leave API Key blank.</div>
                                                <div>- <strong>Bearer token</strong> auth: enter in the API Key field. It is injected as an HTTP header on every request, so the URL stays clean.</div>
                                                <div>- If both are present, the API Key field takes priority over any URL-embedded value.</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-secondary" onClick={() => setEditingMcpServer(null)} disabled={mcpServerSaving}>Cancel</button>
                                            <button className="btn btn-primary" disabled={mcpServerSaving || !editingMcpServer.server_url} onClick={async () => {
                                                setMcpServerSaving(true);
                                                try {
                                                    await fetchJson('/tools/mcp-server', {
                                                        method: 'PUT',
                                                        body: JSON.stringify({
                                                            server_name: editingMcpServer.server_name,
                                                            server_url: editingMcpServer.server_url,
                                                            // Only send api_key if the user typed something; null = keep existing
                                                            api_key: editingMcpServer.api_key || undefined,
                                                            tenant_id: selectedTenantId || undefined,
                                                        })
                                                    });
                                                    await loadAllTools();
                                                    setEditingMcpServer(null);
                                                } catch (e: any) {
                                                    alert('Failed to update server: ' + e.message);
                                                }
                                                setMcpServerSaving(false);
                                            }}>{mcpServerSaving ? 'Saving...' : 'Save Changes'}</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Per-Tool Config Modal */}
                            {editingToolId && (() => {
                                const tool = allTools.find(t => t.id === editingToolId);
                                if (!tool) return null;
                                return (
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onClick={() => setEditingToolId(null)}>
                                        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <div>
                                                    <h3 style={{ margin: 0 }}>Tool Config: {tool.display_name}</h3>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Global configuration used by all agents</div>
                                                </div>
                                                <button onClick={() => setEditingToolId(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}>{'\u5173\u95ed'}</button>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {(tool.config_schema.fields || []).map((field: any) => {
                                                    // Check depends_on
                                                    if (field.depends_on) {
                                                        const visible = Object.entries(field.depends_on).every(([k, vals]: [string, any]) =>
                                                            vals.includes(editingConfig[k])
                                                        );
                                                        if (!visible) return null;
                                                    }
                                                    return (
                                                        <div key={field.key}>
                                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>{field.label}</label>
                                                            {field.type === 'checkbox' ? (
                                                                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editingConfig[field.key] ?? field.default ?? false}
                                                                        onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.checked }))}
                                                                        style={{ opacity: 0, width: 0, height: 0 }}
                                                                    />
                                                                    <span style={{
                                                                        position: 'absolute', inset: 0,
                                                                        background: (editingConfig[field.key] ?? field.default) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                                        borderRadius: '11px', transition: 'background 0.2s',
                                                                    }}>
                                                                        <span style={{
                                                                            position: 'absolute', left: (editingConfig[field.key] ?? field.default) ? '20px' : '2px', top: '2px',
                                                                            width: '18px', height: '18px', background: '#fff',
                                                                            borderRadius: '50%', transition: 'left 0.2s',
                                                                        }} />
                                                                    </span>
                                                                </label>
                                                            ) : field.type === 'select' ? (
                                                                <select className="form-input" value={editingConfig[field.key] ?? field.default ?? ''} onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.value }))}>
                                                                    {(field.options || []).map((opt: any) => (
                                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : field.type === 'number' ? (
                                                                <input type="number" className="form-input" value={editingConfig[field.key] ?? field.default ?? ''} min={field.min} max={field.max}
                                                                    onChange={e => setEditingConfig(p => ({ ...p, [field.key]: Number(e.target.value) }))} />
                                                            ) : field.type === 'password' ? (
                                                                <input type="password" autoComplete="new-password" className="form-input" value={editingConfig[field.key] ?? ''} placeholder={field.placeholder || ''}
                                                                    onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.value }))} />
                                                            ) : (
                                                                <input type="text" className="form-input" value={editingConfig[field.key] ?? field.default ?? ''} placeholder={field.placeholder || ''}
                                                                    onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.value }))} />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                                                    <button className="btn btn-secondary" onClick={() => setEditingToolId(null)}>{t('common.cancel')}</button>
                                                    <button className="btn btn-primary" onClick={async () => {
                                                        if (tool.name === 'jina_search' || tool.name === 'jina_read') {
                                                            if (editingConfig.api_key) {
                                                                const token = localStorage.getItem('token');
                                                                await fetch('/api/enterprise/system-settings/jina_api_key', {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                    body: JSON.stringify({ value: { api_key: editingConfig.api_key } }),
                                                                });
                                                            }
                                                        } else {
                                                            await fetchJson(`/tools/${tool.id}`, { method: 'PUT', body: JSON.stringify({ config: editingConfig }) });
                                                        }
                                                        setEditingToolId(null);
                                                        loadAllTools();
                                                    }}>{t('enterprise.tools.saveConfig')}</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Category-level config modal */}
                            {configCategory && GLOBAL_CATEGORY_CONFIG_SCHEMAS[configCategory] && (
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={() => setConfigCategory(null)}>
                                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <div>
                                                <h3 style={{ margin: 0 }}>{GLOBAL_CATEGORY_CONFIG_SCHEMAS[configCategory].title}</h3>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Global configuration shared by all tools in this category</div>
                                            </div>
                                            <button onClick={() => setConfigCategory(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}>x</button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {GLOBAL_CATEGORY_CONFIG_SCHEMAS[configCategory].fields.map((field: any) => (
                                                <div key={field.key}>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>{field.label}</label>
                                                    {field.type === 'password' ? (
                                                        <input type="password" autoComplete="new-password" className="form-input" value={editingConfig[field.key] ?? ''} placeholder={field.placeholder || ''}
                                                            onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.value }))} />
                                                    ) : field.type === 'select' ? (
                                                        <select className="form-input" value={editingConfig[field.key] ?? field.default ?? ''} onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.value }))}>
                                                            {(field.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    ) : (
                                                        <input type="text" className="form-input" value={editingConfig[field.key] ?? ''} placeholder={field.placeholder || ''}
                                                            onChange={e => setEditingConfig(p => ({ ...p, [field.key]: e.target.value }))} />
                                                    )}
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary" onClick={() => setConfigCategory(null)}>{t('common.cancel')}</button>
                                                <button className="btn btn-primary" onClick={async () => {
                                                    // Save config to the first tool in this category.
                                                    // We write to one representative tool per category;
                                                    // get_category_config endpoint reads it back.
                                                    const catTools = allTools.filter((tl: any) => (tl.category || 'general') === configCategory);
                                                    if (catTools.length > 0) {
                                                        await fetchJson(`/tools/${catTools[0].id}`, { method: 'PUT', body: JSON.stringify({ config: editingConfig }) });
                                                    }
                                                    setConfigCategory(null);
                                                    loadAllTools();
                                                }}>{t('common.save', 'Save')}</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>}
                    </div>
                )}

                {/* 鈹€鈹€ Skills Tab 鈹€鈹€ */}
                {activeTab === 'skills' && <SkillsTab />}

                {/* 鈹€鈹€ Invitation Codes Tab 鈹€鈹€ */}
                {activeTab === 'invites' && <InvitationCodes />}
            </div>

            {
                kbToast && (
                    <div style={{
                        position: 'fixed', top: '20px', right: '20px', zIndex: 20000,
                        padding: '12px 20px', borderRadius: '8px',
                        background: kbToast.type === 'success' ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)',
                        color: '#fff', fontSize: '14px', fontWeight: 500,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}>
                        {''}{kbToast.message}
                    </div>
                )
            }
        </>
    );
}
