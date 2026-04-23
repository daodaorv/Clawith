import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    agentApi,
    buildFounderMainlineAgentCreateSummary,
    buildFounderMainlinePlanningPayload,
    channelApi,
    enterpriseApi,
    FOUNDER_MAINLINE_INTERVIEW_FIELDS,
    FOUNDER_MAINLINE_INTERVIEW_TOTAL_GROUPS,
    getFounderMainlineStateLabel,
    requestFounderMainlineDraftPlanPreview,
    requestFounderMainlineInterviewProgress,
    skillApi,
    type DuoduoTemplateLibraryItem,
    type FounderMainlineInterviewAnswerMap,
    type FounderMainlineInterviewGroupId,
    type SkillLibraryItem,
    type SkillPackCatalogItem,
} from '../services/api';
import {
    parseSoulTemplate,
    resolveFounderMainlineAgentCreateAutofill,
    resolveFounderMainlineAgentCreateGuard,
} from '../services/founderMainlineDraftPlanSummary';
import {
    buildFounderProviderPresetCards,
    clearFounderPreferredProvider,
    loadFounderPreferredProvider,
    requestFounderProviderSpecs,
    saveFounderPreferredProvider,
} from '../services/founderProviderPresets';
import ChannelConfig from '../components/ChannelConfig';
import LinearCopyButton from '../components/LinearCopyButton';
const STEPS = ['basicInfo', 'personality', 'skills', 'permissions', 'channel'] as const;
const OPENCLAW_STEPS = ['basicInfo', 'permissions'] as const;

function sortTemplates(items: any[]) {
    return [...items].sort((a, b) => {
        if (!!a.recommended_for_first_scenario !== !!b.recommended_for_first_scenario) {
            return a.recommended_for_first_scenario ? -1 : 1;
        }
        if (!!a.duoduo_recommended !== !!b.duoduo_recommended) {
            return a.duoduo_recommended ? -1 : 1;
        }
        if ((a.sort_order ?? 999) !== (b.sort_order ?? 999)) {
            return (a.sort_order ?? 999) - (b.sort_order ?? 999);
        }
        if (!!a.is_builtin !== !!b.is_builtin) {
            return a.is_builtin ? -1 : 1;
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function sortSkills(items: any[]) {
    return [...items].sort((a, b) => {
        if (!!a.is_default !== !!b.is_default) {
            return a.is_default ? -1 : 1;
        }
        if (!!a.recommended_for_first_scenario !== !!b.recommended_for_first_scenario) {
            return a.recommended_for_first_scenario ? -1 : 1;
        }
        if (!!a.duoduo_recommended !== !!b.duoduo_recommended) {
            return a.duoduo_recommended ? -1 : 1;
        }
        if ((a.sort_order ?? 999) !== (b.sort_order ?? 999)) {
            return (a.sort_order ?? 999) - (b.sort_order ?? 999);
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function resolveTemplateIncludedSkillIds(template: any, skills: any[]) {
    if (!template?.default_skills?.length || !skills.length) {
        return new Set<string>();
    }
    return new Set(
        skills
            .filter((skill: SkillLibraryItem) => template.default_skills.includes(skill.folder_name))
            .map((skill: SkillLibraryItem) => skill.id),
    );
}

export default function AgentCreate() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [step, setStep] = useState(0);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [agentType, setAgentType] = useState<'native' | 'openclaw'>('native');
    // Clear field error when user edits a field
    const clearFieldError = (field: string) => setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    const [createdApiKey, setCreatedApiKey] = useState('');
    // Current company (tenant) selection from layout sidebar
    const [currentTenant] = useState<string | null>(() => localStorage.getItem('current_tenant_id'));

    const [form, setForm] = useState({
        name: '',
        role_description: '',
        personality: '',
        boundaries: '',
        primary_model_id: '' as string,
        fallback_model_id: '' as string,
        permission_scope_type: 'company',
        permission_access_level: 'use',
        template_id: '' as string,
        max_tokens_per_day: '',
        max_tokens_per_month: '',
        skill_ids: [] as string[],
    });
    const [channelValues, setChannelValues] = useState<Record<string, string>>({});
    const [founderMainlineAnswers, setFounderMainlineAnswers] = useState<FounderMainlineInterviewAnswerMap>({});
    const [founderMainlineCorrectionNotes, setFounderMainlineCorrectionNotes] = useState('');
    const [founderMainlineUserConfirmed, setFounderMainlineUserConfirmed] = useState(false);
    const [founderMainlineRecommendationApplied, setFounderMainlineRecommendationApplied] = useState(false);
    const [founderPreferredProvider, setFounderPreferredProvider] = useState<string | null>(() => loadFounderPreferredProvider());

    // Fetch LLM models for step 1
    const { data: models = [] } = useQuery({
        queryKey: ['llm-models'],
        queryFn: enterpriseApi.llmModels,
    });

    // Fetch templates
    const { data: templates = [] } = useQuery({
        queryKey: ['templates'],
        queryFn: enterpriseApi.templates,
    });

    // Fetch global skills for step 3
    const { data: globalSkills = [] } = useQuery({
        queryKey: ['global-skills'],
        queryFn: skillApi.list,
    });
    const { data: duoduoTemplateLibrary } = useQuery({
        queryKey: ['duoduo-template-library', 'agent-create'],
        queryFn: () => enterpriseApi.duoduoTemplateLibrary(),
    });
    const { data: duoduoSkillPackCatalog } = useQuery({
        queryKey: ['duoduo-skill-packs', 'agent-create'],
        queryFn: () => skillApi.packs.list(),
    });
    const { data: founderProviderSpecs = [] } = useQuery({
        queryKey: ['founder-provider-specs', 'agent-create'],
        queryFn: requestFounderProviderSpecs,
    });

    // Auto-select default skills
    useEffect(() => {
        if (globalSkills.length > 0) {
            const defaultIds = globalSkills.filter((s: any) => s.is_default).map((s: any) => s.id);
            if (defaultIds.length > 0) {
                setForm(prev => ({
                    ...prev,
                    skill_ids: Array.from(new Set([...prev.skill_ids, ...defaultIds]))
                }));
            }
        }
    }, [globalSkills]);

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const agent = await agentApi.create(data);
            return agent;
        },
        onSuccess: async (agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] });

            // Automatically bind channels if configured in wizard
            // Feishu
            if (channelValues.feishu_app_id && channelValues.feishu_app_secret) {
                try {
                    await channelApi.create(agent.id, {
                        channel_type: 'feishu',
                        app_id: channelValues.feishu_app_id,
                        app_secret: channelValues.feishu_app_secret,
                        encrypt_key: channelValues.feishu_encrypt_key || undefined,
                        extra_config: {
                            connection_mode: channelValues.feishu_connection_mode || 'websocket'
                        }
                    });
                } catch (err) {
                    console.error('Failed to bind Feishu channel:', err);
                    setError(
                        'Failed to bind the Feishu channel. Please verify the Feishu configuration on the agent settings page and try again.'
                    );
                }
            }

            // Slack
            if (channelValues.slack_bot_token && channelValues.slack_signing_secret) {
                try {
                    await channelApi.create(agent.id, {
                        channel_type: 'slack',
                        app_id: channelValues.slack_bot_token,
                        app_secret: channelValues.slack_signing_secret,
                    });
                } catch (err) {
                    console.error('Failed to bind Slack channel:', err);
                    setError(
                        'Failed to bind the Slack channel. Please verify the Slack configuration on the agent settings page and try again.'
                    );
                }
            }

            // Discord
            if (channelValues.discord_bot_token && channelValues.discord_application_id) {
                try {
                    await channelApi.create(agent.id, {
                        channel_type: 'discord',
                        app_id: channelValues.discord_application_id,
                        app_secret: channelValues.discord_bot_token,
                        encrypt_key: channelValues.discord_public_key || undefined,
                    });
                } catch (err) {
                    console.error('Failed to bind Discord channel:', err);
                    setError(
                        'Failed to bind the Discord channel. Please verify the Discord configuration on the agent settings page and try again.'
                    );
                }
            }

            // WeCom
            if (channelValues.wecom_bot_id && channelValues.wecom_bot_secret) {
                try {
                    const connMode = channelValues.wecom_connection_mode || 'websocket';
                    await channelApi.create(agent.id, {
                        channel_type: 'wecom',
                        app_id: connMode === 'websocket' ? channelValues.wecom_bot_id : undefined,
                        app_secret: connMode === 'websocket' ? channelValues.wecom_bot_secret : undefined,
                        extra_config: {
                            connection_mode: connMode,
                            bot_id: channelValues.wecom_bot_id,
                            bot_secret: channelValues.wecom_bot_secret,
                        }
                    });
                } catch (err) {
                    console.error('Failed to bind WeCom channel:', err);
                    setError(
                        'Failed to bind the WeCom channel. Please verify the WeCom configuration on the agent settings page and try again.'
                    );
                }
            }

            if (agent.api_key) {
                setCreatedApiKey(agent.api_key);
            } else {
                navigate(`/agents/${agent.id}`);
            }
        },
        onError: (err: any) => setError(err.message),
    });

    const validateStep0 = (): boolean => {
        const errors: Record<string, string> = {};
        const name = form.name.trim();
        if (!name) {
            errors.name = t('wizard.errors.nameRequired', '智能体名称不能为空');
        } else if (name.length < 2) {
            errors.name = t('wizard.errors.nameTooShort', '名称至少需要 2 个字符');
        } else if (name.length > 100) {
            errors.name = t('wizard.errors.nameTooLong', '名称不能超过 100 个字符');
        }
        if (form.role_description.length > 500) {
            errors.role_description = t('wizard.errors.roleDescTooLong', '角色描述不能超过 500 个字符（当前 {{count}} 字符）').replace('{{count}}', String(form.role_description.length));
        }
        if (form.max_tokens_per_day && (isNaN(Number(form.max_tokens_per_day)) || Number(form.max_tokens_per_day) <= 0)) {
            errors.max_tokens_per_day = t('wizard.errors.tokenLimitInvalid', '请输入有效的正整数');
        }
        if (form.max_tokens_per_month && (isNaN(Number(form.max_tokens_per_month)) || Number(form.max_tokens_per_month) <= 0)) {
            errors.max_tokens_per_month = t('wizard.errors.tokenLimitInvalid', '请输入有效的正整数');
        }
        if (agentType === 'native' && enabledModels.length > 0 && !form.primary_model_id) {
            errors.primary_model_id = t('wizard.errors.modelRequired', '请选择一个主模型');
        }
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleNext = () => {
        setError('');
        if (step === 0 && !validateStep0()) return;
        setStep(step + 1);
    };

    const handleFinish = () => {
        setError('');
        if (step === 0 || agentType === 'openclaw') {
            if (!validateStep0()) return;
        }
        if (agentType === 'native' && founderMainlineCreateGuard.isBlocked) {
            setError(founderMainlineCreateGuard.message);
            return;
        }
        createMutation.mutate({
            name: form.name,
            agent_type: agentType,
            role_description: form.role_description,
            personality: agentType === 'native' ? form.personality : undefined,
            boundaries: agentType === 'native' ? form.boundaries : undefined,
            primary_model_id: agentType === 'native' ? (form.primary_model_id || undefined) : undefined,
            fallback_model_id: agentType === 'native' ? (form.fallback_model_id || undefined) : undefined,
            template_id: form.template_id || undefined,
            permission_scope_type: form.permission_scope_type,
            max_tokens_per_day: form.max_tokens_per_day ? Number(form.max_tokens_per_day) : undefined,
            max_tokens_per_month: form.max_tokens_per_month ? Number(form.max_tokens_per_month) : undefined,
            skill_ids: agentType === 'native' ? form.skill_ids : [],
            permission_access_level: form.permission_access_level,
            tenant_id: currentTenant || undefined,
            founder_mainline_guard: (
                agentType === 'native'
                && founderMainlineRecommendationApplied
                && founderMainlinePreviewMutation.data
            ) ? {
                recommendation_applied: true,
                user_confirmed: founderMainlineUserConfirmed,
                scenario_id: founderMainlinePreviewMutation.data.scenario_id,
                answers: founderMainlinePlanningPayload.answers,
                ...(founderMainlineCorrectionNotes.trim()
                    ? { correction_notes: founderMainlineCorrectionNotes.trim() }
                    : {}),
            } : undefined,
        });
    };

    const selectedModel = models.find((m: any) => m.id === form.primary_model_id);
    const isChineseUi = i18n.language?.toLowerCase().startsWith('zh');
    const founderProviderPresetCards = buildFounderProviderPresetCards(founderProviderSpecs);
    const preferredPresetCard = founderProviderPresetCards.find((item) => item.provider === founderPreferredProvider) || null;
    const enabledModels = (models as any[]).filter((m: any) => m.enabled);
    const sortedEnabledModels = [...enabledModels].sort((left: any, right: any) => {
        if (founderPreferredProvider) {
            const leftPreferred = left.provider === founderPreferredProvider ? 0 : 1;
            const rightPreferred = right.provider === founderPreferredProvider ? 0 : 1;
            if (leftPreferred !== rightPreferred) {
                return leftPreferred - rightPreferred;
            }
        }
        return String(left.label || '').localeCompare(String(right.label || ''));
    });
    const templateCards = sortTemplates(templates as any[]);
    const skillCards = sortSkills(globalSkills as any[]);
    const selectedTemplate = templateCards.find((tmpl: any) => tmpl.id === form.template_id);
    const templateIncludedSkillIds = resolveTemplateIncludedSkillIds(selectedTemplate, globalSkills as SkillLibraryItem[]);
    const templateIncludedSkills = skillCards.filter((skill: SkillLibraryItem) => templateIncludedSkillIds.has(skill.id));
    const selectedTemplateLibraryItem = duoduoTemplateLibrary?.items?.find(
        (item: DuoduoTemplateLibraryItem) => item.canonical_name === selectedTemplate?.name,
    );
    const selectedTemplateRecommendedPacks = (selectedTemplateLibraryItem?.recommended_skill_packs || [])
        .map((packId: string) => duoduoSkillPackCatalog?.items?.find((pack: SkillPackCatalogItem) => pack.pack_id === packId))
        .filter((pack): pack is SkillPackCatalogItem => Boolean(pack));
    const founderMainlinePlanningPayload = buildFounderMainlinePlanningPayload({
        businessBrief: form.role_description,
        locale: isChineseUi ? 'zh-CN' : (i18n.language || 'en'),
        scenarioId: duoduoTemplateLibrary?.scenario?.scenario_id,
        selectedModel: selectedModel
            ? {
                provider: selectedModel.provider,
                model: selectedModel.model,
                base_url: selectedModel.base_url,
            }
            : null,
        answersByGroup: founderMainlineAnswers,
    });
    const founderMainlineInterviewProgressMutation = useMutation({
        mutationFn: async () => requestFounderMainlineInterviewProgress(founderMainlinePlanningPayload),
    });
    const founderMainlineDraftPlanPayload = {
        ...founderMainlinePlanningPayload,
        user_confirmed: founderMainlineUserConfirmed,
        ...(founderMainlineCorrectionNotes.trim()
            ? { correction_notes: founderMainlineCorrectionNotes.trim() }
            : {}),
    };
    const skillLabelByFolderName = Object.fromEntries(
        skillCards.map((skill: SkillLibraryItem) => [
            skill.folder_name,
            isChineseUi ? (skill.display_name_zh || skill.name) : skill.name,
        ]),
    );
    const founderMainlinePreviewMutation = useMutation({
        mutationFn: async () => requestFounderMainlineDraftPlanPreview(founderMainlineDraftPlanPayload),
    });
    const founderMainlineInterviewProgress = founderMainlineInterviewProgressMutation.data;
    const founderMainlinePreviewSummary = founderMainlinePreviewMutation.data
        ? buildFounderMainlineAgentCreateSummary(founderMainlinePreviewMutation.data)
        : null;
    const founderMainlinePreviewTemplates = (founderMainlinePreviewSummary?.recommendedTemplateKeys || [])
        .map((templateKey: string) =>
            duoduoTemplateLibrary?.items?.find((item: DuoduoTemplateLibraryItem) => item.template_key === templateKey),
        )
        .filter((item): item is DuoduoTemplateLibraryItem => Boolean(item));
    const founderMainlinePreviewPacks = (founderMainlinePreviewSummary?.recommendedPackIds || [])
        .map((packId: string) =>
            duoduoSkillPackCatalog?.items?.find((pack: SkillPackCatalogItem) => pack.pack_id === packId),
        )
        .filter((pack): pack is SkillPackCatalogItem => Boolean(pack));
    const founderMainlineAutofill = resolveFounderMainlineAgentCreateAutofill({
        summary: founderMainlinePreviewSummary,
        templates: templateCards,
        templateLibraryItems: duoduoTemplateLibrary?.items || [],
        skillPacks: duoduoSkillPackCatalog?.items || [],
        skills: skillCards,
        currentForm: {
            template_id: form.template_id,
            role_description: form.role_description,
            personality: form.personality,
            boundaries: form.boundaries,
            skill_ids: form.skill_ids,
        },
    });
    const founderMainlineAutofillTemplate = founderMainlineAutofill.resolvedTemplateKey
        ? duoduoTemplateLibrary?.items?.find(
            (item: DuoduoTemplateLibraryItem) => item.template_key === founderMainlineAutofill.resolvedTemplateKey,
        )
        : undefined;
    const founderMainlineAutofillNewSkillCount = founderMainlineAutofill.nextForm.skill_ids.filter(
        (skillId: string) => !form.skill_ids.includes(skillId),
    ).length;
    const founderMainlineAutofillHasChanges = (
        founderMainlineAutofill.nextForm.template_id !== form.template_id
        || founderMainlineAutofill.nextForm.role_description !== form.role_description
        || founderMainlineAutofill.nextForm.personality !== form.personality
        || founderMainlineAutofill.nextForm.boundaries !== form.boundaries
        || founderMainlineAutofill.nextForm.skill_ids.length !== form.skill_ids.length
        || founderMainlineAutofill.nextForm.skill_ids.some((skillId: string) => !form.skill_ids.includes(skillId))
    );
    const founderMainlineChangedTemplateLabels = (founderMainlinePreviewSummary?.changedTemplateKeys || []).map(
        (templateKey: string) => {
            const template = duoduoTemplateLibrary?.items?.find(
                (item: DuoduoTemplateLibraryItem) => item.template_key === templateKey,
            );
            return isChineseUi
                ? (template?.display_name_zh || template?.canonical_name || templateKey)
                : (template?.canonical_name || templateKey);
        },
    );
    const founderMainlineChangedPackLabels = (founderMainlinePreviewSummary?.changedPackIds || []).map(
        (packId: string) => {
            const pack = duoduoSkillPackCatalog?.items?.find((item: SkillPackCatalogItem) => item.pack_id === packId);
            return isChineseUi
                ? (pack?.display_name_zh || packId)
                : (pack?.display_name_en || packId);
        },
    );
    const founderMainlineAnsweredCount = founderMainlinePlanningPayload.answers.length;
    const founderMainlineDisplayedState = (
        founderMainlinePreviewMutation.isPending && founderMainlineCorrectionNotes.trim()
            ? 'correction_in_progress'
            : founderMainlinePreviewSummary?.planStatus
                || founderMainlineInterviewProgress?.plan_status
                || (selectedModel ? 'interview_in_progress' : 'step0_blocked')
    );
    const founderMainlineStateLabel = getFounderMainlineStateLabel(founderMainlineDisplayedState, isChineseUi);
    const founderMainlineCanGeneratePreview = founderMainlineInterviewProgress?.plan_status === 'ready_for_plan';
    const founderMainlineHasPreview = Boolean(founderMainlinePreviewSummary);
    const founderMainlineCanShowCorrectionArea = founderMainlineCanGeneratePreview || founderMainlineHasPreview;
    const founderMainlineCanApplyCorrection = Boolean(
        founderMainlineHasPreview
        && founderMainlineCorrectionNotes.trim()
        && !founderMainlinePreviewMutation.isPending,
    );
    const founderMainlineCanApplyRecommendation = Boolean(
        founderMainlineHasPreview
        && founderMainlineAutofillHasChanges
        && !founderMainlinePreviewMutation.isPending,
    );
    const founderMainlineCreateGuard = resolveFounderMainlineAgentCreateGuard({
        summary: founderMainlinePreviewSummary,
        recommendationApplied: founderMainlineRecommendationApplied,
        isChineseUi,
    });
    const founderMainlineNextQuestionsByGroup = Object.fromEntries(
        (founderMainlineInterviewProgress?.next_questions || []).map((question) => [question.group_id, question]),
    );
    const founderMainlineMissingGroupSet = new Set(founderMainlineInterviewProgress?.missing_groups || []);
    const founderMainlineProgressError = founderMainlineInterviewProgressMutation.error instanceof Error
        ? founderMainlineInterviewProgressMutation.error.message
        : '';
    const founderMainlinePreviewError = founderMainlinePreviewMutation.error instanceof Error
        ? founderMainlinePreviewMutation.error.message
        : '';
    const activeSteps = agentType === 'openclaw' ? OPENCLAW_STEPS : STEPS;

    useEffect(() => {
        founderMainlineInterviewProgressMutation.reset();
        founderMainlinePreviewMutation.reset();
        setFounderMainlineRecommendationApplied(false);
    }, [
        form.role_description,
        form.primary_model_id,
        i18n.language,
        duoduoTemplateLibrary?.scenario?.scenario_id,
        founderMainlineAnswers,
        founderMainlineUserConfirmed,
    ]);

    useEffect(() => {
        setFounderMainlineRecommendationApplied(false);
    }, [founderMainlinePreviewMutation.data]);

    // If OpenClaw agent just created, show success page with API key
    if (createdApiKey && createMutation.data) {
        const agent = createMutation.data;
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">{t('openclaw.created', 'OpenClaw Agent Created')}</h1>
                </div>
                <div className="card" style={{ maxWidth: '640px' }}>
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#x2713;</div>
                        <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>{agent.name}</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                            {t('openclaw.createdDesc2', 'Your OpenClaw agent has been registered. Copy the instruction below and send it to your OpenClaw agent to complete the setup.')}
                        </p>
                    </div>

                    {/* Setup Instruction — single block to send to OpenClaw */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                            {t('openclaw.setupInstruction', 'Setup Instruction')}
                        </label>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                            {t('openclaw.setupInstructionDesc', 'Copy and send this to your OpenClaw agent. It will configure itself automatically.')}
                        </p>
                        <div style={{ position: 'relative' }}>
                            <pre style={{
                                padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px',
                                fontSize: '11px', lineHeight: 1.6, overflow: 'auto', maxHeight: '280px',
                                border: '1px solid var(--border-default)', whiteSpace: 'pre-wrap',
                            }}>{`Please create a skill file at skills/clawith_sync.md with the following content, then add "Check Clawith inbox using the clawith_sync skill and process any pending messages" to your HEARTBEAT.md:

---
name: clawith_sync
description: Sync with Clawith platform — check inbox, submit results, and send messages.
---

# Clawith Sync

## When to use
Check for new messages from the Clawith platform during every heartbeat cycle.
You can also proactively send messages to people and agents in your relationships.

## Instructions

### 1. Check inbox
Make an HTTP GET request:
- URL: ${window.location.origin}/api/gateway/poll
- Header: X-Api-Key: ${createdApiKey}

The response contains a \`messages\` array. Each message includes:
- \`id\` — unique message ID (use this for reporting)
- \`content\` — the message text
- \`sender_user_name\` — name of the Clawith user who sent it
- \`sender_user_id\` — unique ID of the sender
- \`conversation_id\` — the conversation this message belongs to
- \`history\` — array of previous messages in this conversation for context

The response also contains a \`relationships\` array describing your colleagues:
- \`name\` — the person or agent name
- \`type\` — "human" or "agent"
- \`role\` — relationship type (e.g. collaborator, supervisor)
- \`channels\` — available communication channels (e.g. ["feishu"], ["agent"])

**IMPORTANT**: Use the \`history\` array to understand conversation context before replying.
Different \`sender_user_name\` values mean different people — address them accordingly.

### 2. Report results
For each completed message, make an HTTP POST request:
- URL: ${window.location.origin}/api/gateway/report
- Header: X-Api-Key: ${createdApiKey}
- Header: Content-Type: application/json
- Body: {"message_id": "<id from the message>", "result": "<your response>"}

### 3. Send a message to someone
To proactively contact a person or agent, make an HTTP POST request:
- URL: ${window.location.origin}/api/gateway/send-message
- Header: X-Api-Key: ${createdApiKey}
- Header: Content-Type: application/json
- Body: {"target": "<name of person or agent>", "content": "<your message>"}

The system auto-detects the best channel. For agents, the reply appears in your next poll.
For humans, the message is delivered via their available channel (e.g. Feishu).`}</pre>
                                    <LinearCopyButton
                                        className="btn btn-ghost"
                                        style={{ position: 'absolute', top: '4px', right: '4px', fontSize: '11px', minWidth: '60px' }}
                                        textToCopy={`Please create a skill file at skills/clawith_sync.md with the following content, then add "Check Clawith inbox using the clawith_sync skill and process any pending messages" to your HEARTBEAT.md:\n\n---\nname: clawith_sync\ndescription: Sync with Clawith platform — check inbox, submit results, and send messages.\n---\n\n# Clawith Sync\n\n## When to use\nCheck for new messages from the Clawith platform during every heartbeat cycle.\nYou can also proactively send messages to people and agents in your relationships.\n\n## Instructions\n\n### 1. Check inbox\nMake an HTTP GET request:\n- URL: ${window.location.origin}/api/gateway/poll\n- Header: X-Api-Key: ${createdApiKey}\n\nThe response contains a \`messages\` array. Each message includes:\n- \`id\` — unique message ID (use this for reporting)\n- \`content\` — the message text\n- \`sender_user_name\` — name of the Clawith user who sent it\n- \`sender_user_id\` — unique ID of the sender\n- \`conversation_id\` — the conversation this message belongs to\n- \`history\` — array of previous messages in this conversation for context\n\nThe response also contains a \`relationships\` array describing your colleagues:\n- \`name\` — the person or agent name\n- \`type\` — "human" or "agent"\n- \`role\` — relationship type (e.g. collaborator, supervisor)\n- \`channels\` — available communication channels (e.g. ["feishu"], ["agent"])\n\n**IMPORTANT**: Use the \`history\` array to understand conversation context before replying.\nDifferent \`sender_user_name\` values mean different people — address them accordingly.\n\n### 2. Report results\nFor each completed message, make an HTTP POST request:\n- URL: ${window.location.origin}/api/gateway/report\n- Header: X-Api-Key: ${createdApiKey}\n- Header: Content-Type: application/json\n- Body: {"message_id": "<id from the message>", "result": "<your response>"}\n\n### 3. Send a message to someone\nTo proactively contact a person or agent, make an HTTP POST request:\n- URL: ${window.location.origin}/api/gateway/send-message\n- Header: X-Api-Key: ${createdApiKey}\n- Header: Content-Type: application/json\n- Body: {"target": "<name of person or agent>", "content": "<your message>"}\n\nThe system auto-detects the best channel. For agents, the reply appears in your next poll.\nFor humans, the message is delivered via their available channel (e.g. Feishu).`}
                                        label={t('common.copy', 'Copy')}
                                        copiedLabel="Copied"
                                    />
                                </div>
                    </div>

                    {/* API Key — collapsed by default */}
                    <details style={{ marginBottom: '24px' }}>
                        <summary style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                            API Key
                        </summary>
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <code style={{
                                    flex: 1, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '6px',
                                    fontSize: '13px', fontFamily: 'monospace', wordBreak: 'break-all',
                                    border: '1px solid var(--border-default)',
                                }}>{createdApiKey}</code>
                                <LinearCopyButton
                                    className="btn btn-secondary"
                                    style={{ fontSize: '11px', padding: '4px 12px', minWidth: '70px', height: 'fit-content' }}
                                    textToCopy={createdApiKey}
                                    label={t('common.copy', 'Copy')}
                                    copiedLabel="Copied"
                                />
                            </div>
                            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                                {t('openclaw.keyNote', 'This key is already embedded in the instruction above. Save it separately if needed for manual configuration.')}
                            </p>
                        </div>
                    </details>

                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(`/agents/${agent.id}`)}>
                        {t('openclaw.goToAgent', 'Go to Agent Page')}
                    </button>
                </div>
            </div>
        );
    }

    // ── Type Selector (shared between both modes) ──
    const typeSelector = (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxWidth: '640px', marginBottom: '24px' }}>
            <div
                onClick={() => { setAgentType('native'); setStep(0); }}
                style={{
                    padding: '16px', borderRadius: '8px', cursor: 'pointer',
                    border: `1.5px solid ${agentType === 'native' ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                    background: agentType === 'native' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                }}
            >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{t('openclaw.nativeTitle', 'Platform Hosted')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('openclaw.nativeDesc', 'Full agent running on Clawith platform')}</div>
            </div>
            <div
                onClick={() => { setAgentType('openclaw'); setStep(0); }}
                style={{
                    padding: '16px', borderRadius: '8px', cursor: 'pointer', position: 'relative',
                    border: `1.5px solid ${agentType === 'openclaw' ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                    background: agentType === 'openclaw' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                }}
            >
                <span style={{
                    position: 'absolute', top: '8px', right: '8px',
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 600,
                    letterSpacing: '0.5px',
                }}>Lab</span>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{t('openclaw.openclawTitle', 'Link OpenClaw')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('openclaw.openclawDesc', 'Connect your existing OpenClaw agent')}</div>
            </div>
        </div>
    );

    // ── OpenClaw mode: completely separate page ──
    if (agentType === 'openclaw') {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">{t('nav.newAgent')}</h1>
                </div>

                {typeSelector}

                {error && (
                    <div style={{ background: 'var(--error-subtle)', color: 'var(--error)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', maxWidth: '640px' }}>
                        {error}
                    </div>
                )}

                <div className="card" style={{ maxWidth: '640px' }}>
                    <h3 style={{ marginBottom: '6px', fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {t('openclaw.basicTitle', 'Link OpenClaw Agent')}
                        <span style={{
                            fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 600,
                        }}>Lab</span>
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                        {t('openclaw.basicDesc', 'Give your OpenClaw agent a name and description. The LLM model, personality, and skills are configured on your OpenClaw instance.')}
                    </p>

                    <div className="form-group">
                        <label className="form-label">{t('agent.fields.name')} *</label>
                        <input className={`form-input${fieldErrors.name ? ' input-error' : ''}`} value={form.name}
                            onChange={(e) => { setForm({ ...form, name: e.target.value }); clearFieldError('name'); }}
                            placeholder={t('openclaw.namePlaceholder', 'e.g. My OpenClaw Bot')} autoFocus />
                        {fieldErrors.name && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.name}</div>}
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('agent.fields.role')}</label>
                        <input className={`form-input${fieldErrors.role_description ? ' input-error' : ''}`} value={form.role_description}
                            onChange={(e) => { setForm({ ...form, role_description: e.target.value }); clearFieldError('role_description'); }}
                            placeholder={t('openclaw.rolePlaceholder', 'e.g. Personal assistant running on my Mac')} />
                        {fieldErrors.role_description && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.role_description}</div>}
                    </div>

                    {/* Permissions */}
                    <div className="form-group" style={{ marginTop: '8px' }}>
                        <label className="form-label">{t('wizard.step4.title')}</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[
                                { value: 'company', label: t('wizard.step4.companyWide'), desc: t('wizard.step4.companyWideDesc') },
                                { value: 'user', label: t('wizard.step4.selfOnly'), desc: t('wizard.step4.selfOnlyDesc') },
                            ].map((scope) => (
                                <label key={scope.value} style={{
                                    flex: 1, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                                    background: form.permission_scope_type === scope.value ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                    border: `1px solid ${form.permission_scope_type === scope.value ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                    borderRadius: '8px', cursor: 'pointer',
                                }}>
                                    <input type="radio" name="scope" checked={form.permission_scope_type === scope.value}
                                        onChange={() => setForm({ ...form, permission_scope_type: scope.value })} />
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{scope.label}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{scope.desc}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                        <button className="btn btn-secondary" onClick={() => navigate('/')}>{t('common.cancel')}</button>
                        <button className="btn btn-primary" onClick={handleFinish}
                            disabled={createMutation.isPending}>
                            {createMutation.isPending ? t('common.loading') : t('openclaw.createBtn', 'Link Agent')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Native mode: original multi-step wizard ──
    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">{t('nav.newAgent')}</h1>
            </div>

            {typeSelector}

            {/* Stepper */}
            <div className="wizard-steps">
                {STEPS.map((s, i) => (
                    <div key={s} style={{ display: 'contents' }}>
                        <div className={`wizard-step ${i === step ? 'active' : i < step ? 'completed' : ''}`}>
                            <div className="wizard-step-number">{i < step ? '\u2713' : i + 1}</div>
                            <span>{t(`wizard.steps.${s}`)}</span>
                        </div>
                        {i < STEPS.length - 1 && <div className="wizard-connector" />}
                    </div>
                ))}
            </div>

            {/* Removed top navigation, moved to bottom */}

            {error && (
                <div style={{ background: 'var(--error-subtle)', color: 'var(--error)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            <div className="card" style={{ maxWidth: '640px' }}>
                {/* Step 1: Basic Info + Model */}
                {step === 0 && (
                    <div>
                        <h3 style={{ marginBottom: '20px', fontWeight: 600, fontSize: '15px' }}>{t('wizard.step1.title')}</h3>

                        {/* Template selector */}
                        {templates.length > 0 && (
                            <div className="form-group">
                                <label className="form-label">{t('wizard.step1.selectTemplate')}</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                    <div
                                        onClick={() => setForm({ ...form, template_id: '' })}
                                        style={{
                                            padding: '12px', borderRadius: '8px', cursor: 'pointer',
                                            border: `1px solid ${!form.template_id ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                            background: !form.template_id ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                        }}
                                    >
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('wizard.step1.custom')}</div>
                                        <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-tertiary)' }}>
                                            {isChineseUi ? '从空白模板开始，自行定义角色与技能。' : 'Start from a blank template and configure everything yourself.'}
                                        </div>
                                    </div>
                                    {templateCards.map((tmpl: any) => (
                                        <div
                                            key={tmpl.id}
                                            onClick={() => {
                                                // Parse soul_template to extract personality and boundaries
                                                const sections = parseSoulTemplate(tmpl.soul_template, ['Personality', 'Boundaries']);
                                                setForm({
                                                    ...form,
                                                    template_id: tmpl.id,
                                                    role_description: tmpl.description,
                                                    personality: sections.personality || '',
                                                    boundaries: sections.boundaries || '',
                                                });
                                            }}
                                            style={{
                                                padding: '12px', borderRadius: '8px', cursor: 'pointer',
                                                border: `1px solid ${form.template_id === tmpl.id ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                                background: form.template_id === tmpl.id ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                    {tmpl.icon || tmpl.name?.[0] || '·'}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {tmpl.recommended_for_first_scenario && (
                                                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: 'var(--accent-primary)', color: '#fff', fontWeight: 600 }}>
                                                            {isChineseUi ? '首场景推荐' : 'First Scenario'}
                                                        </span>
                                                    )}
                                                    {!tmpl.recommended_for_first_scenario && tmpl.duoduo_recommended && (
                                                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                            {isChineseUi ? '多舵推荐' : 'Recommended'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '13px', marginTop: '10px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {isChineseUi
                                                    ? (tmpl.display_name_zh || String(t(`wizard.templates.${tmpl.name}`, tmpl.name)))
                                                    : String(t(`wizard.templates.${tmpl.name}`, tmpl.name))}
                                            </div>
                                            <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                                {isChineseUi
                                                    ? (tmpl.library_summary_zh || tmpl.description)
                                                    : (tmpl.description || tmpl.library_summary_zh)}
                                            </div>
                                            {!!tmpl.default_skills?.length && (
                                                <div style={{ fontSize: '11px', marginTop: '8px', color: 'var(--text-secondary)' }}>
                                                    {isChineseUi
                                                        ? `${tmpl.default_skills.length} 个预设技能`
                                                        : `${tmpl.default_skills.length} preset skills`}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {selectedTemplateLibraryItem && (
                                    <div style={{
                                        marginTop: '12px',
                                        padding: '14px',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '10px',
                                    }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {isChineseUi ? '模板能力说明' : 'Template capability summary'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '6px' }}>
                                            {isChineseUi
                                                ? (selectedTemplateLibraryItem.primary_goal || selectedTemplate.library_summary_zh || selectedTemplate.description)
                                                : (selectedTemplate.description || selectedTemplateLibraryItem.primary_goal)}
                                        </div>
                                        {selectedTemplateRecommendedPacks.length > 0 && (
                                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                    {isChineseUi
                                                        ? '这个模板会优先按下列能力包组织自动技能，帮助大陆团队先用中文流程跑通业务。'
                                                        : 'This template organizes its auto-included skills around the following capability packs.'}
                                                </div>
                                                {selectedTemplateRecommendedPacks.map((pack: SkillPackCatalogItem) => (
                                                    <div
                                                        key={pack.pack_id}
                                                        style={{
                                                            padding: '10px 12px',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border-default)',
                                                            background: 'var(--bg-primary)',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                {isChineseUi ? pack.display_name_zh : pack.display_name_en}
                                                            </div>
                                                            <span style={{
                                                                fontSize: '10px',
                                                                padding: '2px 8px',
                                                                borderRadius: '999px',
                                                                background: 'var(--accent-subtle)',
                                                                color: 'var(--text-secondary)',
                                                            }}>
                                                                {isChineseUi ? '推荐能力包' : 'Recommended pack'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '6px' }}>
                                                            {pack.business_goal}
                                                        </div>
                                                        {!!pack.included_skills?.length && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                                {pack.included_skills.map((slug: string) => (
                                                                    <span
                                                                        key={`${pack.pack_id}-${slug}`}
                                                                        style={{
                                                                            fontSize: '10px',
                                                                            padding: '2px 7px',
                                                                            borderRadius: '999px',
                                                                            background: 'var(--bg-secondary)',
                                                                            color: 'var(--text-secondary)',
                                                                        }}
                                                                    >
                                                                        {skillLabelByFolderName[slug] || slug}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {selectedTemplateLibraryItem.default_boundaries?.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: '10px' }}>
                                                {isChineseUi ? '默认边界：' : 'Default boundary: '}
                                                {selectedTemplateLibraryItem.default_boundaries[0]}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* JSON Import */}
                                <div style={{ marginTop: '8px' }}>
                                    <label className="btn btn-ghost" style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                                        ↑ {t('wizard.step1.importFromJson')}
                                        <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const reader = new FileReader();
                                            reader.onload = ev => {
                                                try {
                                                    const data = JSON.parse(ev.target?.result as string);
                                                    setForm(prev => ({
                                                        ...prev,
                                                        name: data.name || prev.name,
                                                        role_description: data.role_description || data.description || prev.role_description,
                                                        template_id: '',
                                                    }));
                                                } catch {
                                                    alert('Invalid JSON file');
                                                }
                                            };
                                            reader.readAsText(file);
                                            e.target.value = '';
                                        }} />
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">{t('agent.fields.name')} <span style={{ color: 'var(--error)' }}>*</span></label>
                            <input className={`form-input${fieldErrors.name ? ' input-error' : ''}`} value={form.name}
                                onChange={(e) => { setForm({ ...form, name: e.target.value }); clearFieldError('name'); }}
                                placeholder={t("wizard.step1.namePlaceholder")} autoFocus />
                            {fieldErrors.name && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.name}</div>}
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('agent.fields.role')}</label>
                            <input className={`form-input${fieldErrors.role_description ? ' input-error' : ''}`} value={form.role_description}
                                onChange={(e) => { setForm({ ...form, role_description: e.target.value }); clearFieldError('role_description'); }}
                                placeholder={t('wizard.roleHint')} />
                            {fieldErrors.role_description && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.role_description}</div>}
                        </div>
                        <div style={{
                            marginTop: '12px',
                            padding: '14px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '10px',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {isChineseUi ? '创业导师草案预览（实验）' : 'Founder mainline draft preview (experimental)'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.6 }}>
                                            {isChineseUi
                                                ? '先补结构化访谈，再生成团队草案。这样推荐的模板、能力包和团队编排会更接近真实业务。'
                                                : 'Complete the structured interview first, then generate the team draft. This keeps templates, packs, and team layout closer to the real business.'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '11px',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-default)',
                                        color: 'var(--text-secondary)',
                                    }}>
                                        {isChineseUi
                                            ? `当前状态：${founderMainlineStateLabel}`
                                            : `State: ${founderMainlineStateLabel}`}
                                    </span>
                                    <span style={{
                                        fontSize: '11px',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-default)',
                                        color: 'var(--text-secondary)',
                                    }}>
                                        {isChineseUi
                                            ? `已回答 ${founderMainlineAnsweredCount}/${FOUNDER_MAINLINE_INTERVIEW_TOTAL_GROUPS}`
                                            : `Answered ${founderMainlineAnsweredCount}/${FOUNDER_MAINLINE_INTERVIEW_TOTAL_GROUPS}`}
                                    </span>
                                    <span style={{
                                        fontSize: '11px',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-default)',
                                        color: selectedModel ? 'var(--text-secondary)' : 'var(--warning)',
                                    }}>
                                        {selectedModel
                                            ? (isChineseUi ? `模型已选择：${selectedModel.label}` : `Model selected: ${selectedModel.label}`)
                                            : (isChineseUi ? '未选择主模型，当前会停留在 Step 0 blocked' : 'No primary model selected yet, so this stays at step0_blocked')}
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                                    {FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => {
                                        const serverQuestion = founderMainlineNextQuestionsByGroup[field.group_id];
                                        const isMissing = founderMainlineMissingGroupSet.has(field.group_id);
                                        const value = founderMainlineAnswers[field.group_id] || '';
                                        return (
                                            <label
                                                key={`founder-mainline-answer-${field.group_id}`}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    padding: '12px',
                                                    borderRadius: '10px',
                                                    border: `1px solid ${isMissing ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                                    background: isMissing ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {isChineseUi ? field.label_zh : field.label_en}
                                                    </span>
                                                    {isMissing && (
                                                        <span style={{
                                                            fontSize: '10px',
                                                            padding: '2px 6px',
                                                            borderRadius: '999px',
                                                            background: 'var(--bg-secondary)',
                                                            color: 'var(--text-secondary)',
                                                        }}>
                                                            {isChineseUi ? '优先补充' : 'Priority'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                                                    {isChineseUi
                                                        ? (serverQuestion?.question_zh || field.question_zh)
                                                        : field.question_en}
                                                </div>
                                                <textarea
                                                    className="form-textarea"
                                                    rows={3}
                                                    value={value}
                                                    onChange={(e) => {
                                                        const answerValue = e.target.value;
                                                        setFounderMainlineAnswers((prev) => ({
                                                            ...prev,
                                                            [field.group_id]: answerValue,
                                                        }));
                                                    }}
                                                    placeholder={isChineseUi ? field.placeholder_zh : field.placeholder_en}
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                                <div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={!form.role_description.trim() || founderMainlineInterviewProgressMutation.isPending}
                                            onClick={() => founderMainlineInterviewProgressMutation.mutate()}
                                        >
                                            {founderMainlineInterviewProgressMutation.isPending
                                                ? (isChineseUi ? '分析中…' : 'Checking…')
                                                : (isChineseUi ? '检查访谈进度' : 'Check interview progress')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={!form.role_description.trim() || !founderMainlineCanGeneratePreview || founderMainlinePreviewMutation.isPending}
                                            onClick={() => founderMainlinePreviewMutation.mutate()}
                                        >
                                            {founderMainlinePreviewMutation.isPending
                                                ? (isChineseUi ? '生成中…' : 'Generating…')
                                                : (isChineseUi ? '生成草案预览' : 'Generate draft preview')}
                                        </button>
                                        {founderMainlineCanShowCorrectionArea && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!founderMainlineCanApplyCorrection}
                                                onClick={() => founderMainlinePreviewMutation.mutate()}
                                            >
                                                {founderMainlinePreviewMutation.isPending
                                                    ? (isChineseUi ? '应用中…' : 'Applying…')
                                                    : (isChineseUi ? '应用中文纠偏' : 'Apply correction')}
                                            </button>
                                        )}
                                    </div>
                                    {!founderMainlineCanGeneratePreview && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px', lineHeight: 1.6 }}>
                                            {founderMainlineInterviewProgress
                                                ? (isChineseUi
                                                    ? '先按提示补齐关键信息，状态进入“可以生成草案”后再预览。'
                                                    : 'Fill the remaining required answers first. Preview becomes available once the state reaches ready_for_plan.')
                                                : (isChineseUi
                                                    ? '先检查一次访谈进度，系统会告诉你当前缺哪些关键信息。'
                                                    : 'Check the interview progress first. The system will tell you which key inputs are still missing.')}
                                        </div>
                                    )}
                                    {founderMainlineCanShowCorrectionArea && (
                                        <div style={{ marginTop: '12px' }}>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '8px',
                                                    marginBottom: '12px',
                                                    fontSize: '11px',
                                                    color: 'var(--text-secondary)',
                                                    lineHeight: 1.6,
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={founderMainlineUserConfirmed}
                                                    onChange={(e) => setFounderMainlineUserConfirmed(e.target.checked)}
                                                    style={{ marginTop: '2px' }}
                                                />
                                                <span>
                                                    {isChineseUi
                                                        ? '我已审阅当前团队草案，可同步执行部署准备检查。勾选后重新生成草案或应用纠偏时，系统会一起判断是否达到部署准备门槛。'
                                                        : 'I have reviewed the current draft. When checked, the next preview or correction run will also evaluate deploy-prep readiness.'}
                                                </span>
                                            </label>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    fontSize: '11px',
                                                    color: 'var(--text-secondary)',
                                                    lineHeight: 1.6,
                                                }}
                                            >
                                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                                    {isChineseUi ? '中文纠偏说明' : 'Correction notes'}
                                                </span>
                                                <span>
                                                    {isChineseUi
                                                        ? '如果你觉得上一版团队草案有偏差，可直接用中文说明“哪里不对、希望怎么改”，系统会基于当前草案做最小修订。'
                                                        : 'If the last draft feels off, describe what should change. The next preview will revise the current draft with a minimal correction.'}
                                                </span>
                                                <textarea
                                                    className="form-textarea"
                                                    rows={3}
                                                    value={founderMainlineCorrectionNotes}
                                                    onChange={(e) => setFounderMainlineCorrectionNotes(e.target.value)}
                                                    placeholder={
                                                        isChineseUi
                                                            ? '例：不要单独设用户成功团队，先把双语内容增长和海外分发排在更前面。'
                                                            : 'Example: Do not split customer success into a separate team. Prioritize bilingual content growth and overseas distribution first.'
                                                    }
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {!!founderMainlineProgressError && (
                                <div style={{ fontSize: '11px', color: 'var(--error)', lineHeight: 1.6 }}>
                                    {founderMainlineProgressError}
                                </div>
                            )}
                            {founderMainlineInterviewProgress && (
                                <div style={{
                                    padding: '12px',
                                    background: 'var(--bg-primary)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    color: 'var(--text-secondary)',
                                    lineHeight: 1.7,
                                }}>
                                    <div>
                                        {isChineseUi
                                            ? `服务端状态：${founderMainlineStateLabel}`
                                            : `Server state: ${founderMainlineStateLabel}`}
                                    </div>
                                    {!!founderMainlineInterviewProgress.next_questions.length && (
                                        <div style={{ marginTop: '6px' }}>
                                            {isChineseUi ? '建议下一步：' : 'Next recommended questions: '}
                                            {founderMainlineInterviewProgress.next_questions.map((question) => question.question_zh).join('；')}
                                        </div>
                                    )}
                                    {!!founderMainlineInterviewProgress.missing_groups.length && (
                                        <div style={{ marginTop: '6px' }}>
                                            {isChineseUi
                                                ? `仍缺 ${founderMainlineInterviewProgress.missing_groups.length} 个问题组`
                                                : `${founderMainlineInterviewProgress.missing_groups.length} question groups still missing`}
                                        </div>
                                    )}
                                </div>
                            )}
                            {!!founderMainlinePreviewError && (
                                <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '10px', lineHeight: 1.6 }}>
                                    {founderMainlinePreviewError}
                                </div>
                            )}
                            {founderMainlinePreviewSummary && (
                                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {founderMainlinePreviewSummary.blueprintSummaryZh}
                                    </div>
                                    {(founderMainlinePreviewSummary.previousPlanSummaryZh
                                        || founderMainlinePreviewSummary.changeSummaryZh.length > 0
                                        || founderMainlineChangedTemplateLabels.length > 0
                                        || founderMainlineChangedPackLabels.length > 0) && (
                                        <div style={{
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-default)',
                                            background: 'var(--bg-primary)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px',
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {isChineseUi ? '纠偏回显' : 'Correction review'}
                                            </div>
                                            {!!founderMainlinePreviewSummary.previousPlanSummaryZh && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                        {isChineseUi ? '上一版摘要：' : 'Previous summary: '}
                                                    </span>
                                                    {founderMainlinePreviewSummary.previousPlanSummaryZh}
                                                </div>
                                            )}
                                            {founderMainlinePreviewSummary.changeSummaryZh.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                                        {isChineseUi ? '本次调整' : 'Applied changes'}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {founderMainlinePreviewSummary.changeSummaryZh.map((change, index) => (
                                                            <div
                                                                key={`founder-preview-change-${index}`}
                                                                style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}
                                                            >
                                                                {isChineseUi ? '• ' : '- '}
                                                                {change}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {founderMainlineChangedTemplateLabels.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                                        {isChineseUi ? '受影响模板' : 'Changed templates'}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {founderMainlineChangedTemplateLabels.map((label: string) => (
                                                            <span
                                                                key={`founder-preview-changed-template-${label}`}
                                                                style={{
                                                                    fontSize: '10px',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '999px',
                                                                    background: 'var(--bg-secondary)',
                                                                    color: 'var(--text-secondary)',
                                                                }}
                                                            >
                                                                {label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {founderMainlineChangedPackLabels.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                                        {isChineseUi ? '受影响能力包' : 'Changed packs'}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {founderMainlineChangedPackLabels.map((label: string) => (
                                                            <span
                                                                key={`founder-preview-changed-pack-${label}`}
                                                                style={{
                                                                    fontSize: '10px',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '999px',
                                                                    background: 'var(--accent-subtle)',
                                                                    color: 'var(--text-secondary)',
                                                                }}
                                                            >
                                                                {label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-primary)' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                                {isChineseUi ? '主控角色' : 'Founder role'}
                                            </div>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                                {founderMainlinePreviewSummary.founderDisplayNameZh}
                                            </div>
                                        </div>
                                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-primary)' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                                {isChineseUi ? '团队草案' : 'Draft teams'}
                                            </div>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                                {founderMainlinePreviewSummary.teamNamesZh.join(' / ')}
                                            </div>
                                        </div>
                                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-primary)' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                                {isChineseUi ? '部署准备' : 'Deploy prep'}
                                            </div>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                                {founderMainlinePreviewSummary.canEnterDeployPrep
                                                    ? (isChineseUi ? '可进入' : 'Ready')
                                                    : (isChineseUi ? '暂不可进入' : 'Not ready yet')}
                                            </div>
                                        </div>
                                    </div>
                                    {(!founderMainlinePreviewSummary.canEnterDeployPrep
                                        && (founderMainlinePreviewSummary.deployPrepBlockerReasonZh
                                            || founderMainlinePreviewSummary.deployPrepMissingItems.length > 0)) && (
                                        <div style={{
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-default)',
                                            background: 'var(--bg-primary)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                        }}>
                                            {!!founderMainlinePreviewSummary.deployPrepBlockerReasonZh && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                        {isChineseUi ? '当前阻塞：' : 'Current blocker: '}
                                                    </span>
                                                    {founderMainlinePreviewSummary.deployPrepBlockerReasonZh}
                                                </div>
                                            )}
                                            {founderMainlinePreviewSummary.deployPrepMissingItems.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                                        {isChineseUi ? '进入部署准备前还缺' : 'Still missing before deploy prep'}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {founderMainlinePreviewSummary.deployPrepMissingItems.map((item, index) => (
                                                            <div
                                                                key={`founder-preview-deploy-missing-${index}`}
                                                                style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}
                                                            >
                                                                {isChineseUi ? '• ' : '- '}
                                                                {item}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {founderMainlinePreviewTemplates.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                                {isChineseUi ? '推荐模板' : 'Recommended templates'}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {founderMainlinePreviewTemplates.map((item: DuoduoTemplateLibraryItem) => (
                                                    <span
                                                        key={`founder-preview-template-${item.template_key}`}
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '3px 8px',
                                                            borderRadius: '999px',
                                                            background: 'var(--bg-secondary)',
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        {isChineseUi ? (item.display_name_zh || item.canonical_name) : item.canonical_name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {founderMainlinePreviewPacks.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                                {isChineseUi ? '推荐能力包' : 'Recommended packs'}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {founderMainlinePreviewPacks.map((pack: SkillPackCatalogItem) => (
                                                    <span
                                                        key={`founder-preview-pack-${pack.pack_id}`}
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '3px 8px',
                                                            borderRadius: '999px',
                                                            background: 'var(--accent-subtle)',
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        {isChineseUi ? pack.display_name_zh : pack.display_name_en}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {founderMainlinePreviewSummary.openQuestions.length > 0 && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                                            {isChineseUi ? '待确认：' : 'Open questions: '}
                                            {founderMainlinePreviewSummary.openQuestions.join('；')}
                                        </div>
                                    )}
                                    {(founderMainlineAutofill.resolvedTemplateId
                                        || founderMainlineAutofill.resolvedSkillIds.length > 0
                                        || founderMainlineAutofill.unresolvedTemplateKeys.length > 0
                                        || founderMainlineAutofill.unresolvedPackIds.length > 0) && (
                                        <div style={{
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-default)',
                                            background: 'var(--bg-primary)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {isChineseUi ? '创建表单回填' : 'Create-form autofill'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                {founderMainlineAutofillHasChanges
                                                    ? (isChineseUi
                                                        ? `可将当前 founder 推荐写回创建表单${founderMainlineAutofillTemplate ? `：模板 ${founderMainlineAutofillTemplate.display_name_zh || founderMainlineAutofillTemplate.canonical_name}` : ''}${founderMainlineAutofillNewSkillCount > 0 ? `，新增 ${founderMainlineAutofillNewSkillCount} 个技能` : ''}。`
                                                        : `You can apply the current founder recommendation back into this form${founderMainlineAutofillTemplate ? `: template ${founderMainlineAutofillTemplate.canonical_name}` : ''}${founderMainlineAutofillNewSkillCount > 0 ? `, plus ${founderMainlineAutofillNewSkillCount} additional skills` : ''}.`)
                                                    : (isChineseUi
                                                        ? '当前 founder 推荐已经同步到这个创建表单。'
                                                        : 'The current founder recommendation is already reflected in this create form.')}
                                            </div>
                                            {(founderMainlineAutofill.unresolvedTemplateKeys.length > 0
                                                || founderMainlineAutofill.unresolvedPackIds.length > 0) && (
                                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                                                    {isChineseUi
                                                        ? `仍有 ${founderMainlineAutofill.unresolvedTemplateKeys.length} 个模板推荐、${founderMainlineAutofill.unresolvedPackIds.length} 个能力包推荐暂时无法映射到当前目录。`
                                                        : `${founderMainlineAutofill.unresolvedTemplateKeys.length} template recommendations and ${founderMainlineAutofill.unresolvedPackIds.length} pack recommendations cannot be mapped locally yet.`}
                                                </div>
                                            )}
                                            <div>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    disabled={!founderMainlineCanApplyRecommendation}
                                                    onClick={() => {
                                                        setError('');
                                                        setFounderMainlineRecommendationApplied(true);
                                                        setForm((prev) => ({
                                                            ...prev,
                                                            ...founderMainlineAutofill.nextForm,
                                                        }));
                                                    }}
                                                >
                                                    {isChineseUi ? '应用 founder 推荐到表单' : 'Apply founder recommendation'}
                                                </button>
                                            </div>
                                            {founderMainlineRecommendationApplied && founderMainlineCreateGuard.isBlocked && (
                                                <div style={{ fontSize: '10px', color: 'var(--warning, #b7791f)', lineHeight: 1.6 }}>
                                                    {founderMainlineCreateGuard.message}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Model Selection */}
                        <div className="form-group">
                            <label className="form-label">{t('wizard.step1.primaryModel')} <span style={{ color: 'var(--error)' }}>*</span></label>
                            {founderProviderPresetCards.length > 0 && (
                                <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-default)',
                                        color: 'var(--text-secondary)',
                                        fontSize: '12px',
                                        lineHeight: 1.6,
                                    }}>
                                        {preferredPresetCard
                                            ? (
                                                isChineseUi
                                                    ? `已沿用 Founder Workspace 中的 ${preferredPresetCard.labelZh} 预设，相关模型会优先展示。`
                                                    : `Using the ${preferredPresetCard.labelEn} preset from Founder Workspace. Matching models are shown first.`
                                            )
                                            : (
                                                isChineseUi
                                                    ? '如果你不想先理解提供商和 Base URL，可以先点一个 Founder 预设，我们会优先展示对应模型。'
                                                    : 'If you do not want to think about providers or base URLs yet, choose a founder preset and matching models will be prioritized.'
                                            )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {founderProviderPresetCards.slice(0, 3).map((card) => (
                                            <button
                                                key={card.provider}
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => {
                                                    saveFounderPreferredProvider(card.provider);
                                                    setFounderPreferredProvider(card.provider);
                                                }}
                                                style={{
                                                    borderColor: founderPreferredProvider === card.provider ? 'var(--accent-primary)' : undefined,
                                                    color: founderPreferredProvider === card.provider ? 'var(--accent-primary)' : undefined,
                                                }}
                                            >
                                                {isChineseUi ? card.labelZh : card.labelEn}
                                            </button>
                                        ))}
                                        {founderPreferredProvider && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => {
                                                    clearFounderPreferredProvider();
                                                    setFounderPreferredProvider(null);
                                                }}
                                            >
                                                {isChineseUi ? '清除预设' : 'Clear preset'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {models.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {sortedEnabledModels.map((m: any) => (
                                        <label key={m.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                            background: form.primary_model_id === m.id ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                            border: `1px solid ${form.primary_model_id === m.id ? 'var(--accent-primary)' : fieldErrors.primary_model_id ? 'var(--error)' : 'var(--border-default)'}`,
                                            borderRadius: '8px', cursor: 'pointer',
                                        }}>
                                            <input type="radio" name="model" checked={form.primary_model_id === m.id}
                                                onChange={() => { setForm({ ...form, primary_model_id: m.id }); clearFieldError('primary_model_id'); }} />
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '13px' }}>{m.label}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                    {m.provider}/{m.model}
                                                    {founderPreferredProvider === m.provider
                                                        ? (isChineseUi ? ' · Founder 预设优先' : ' · Founder preset priority')
                                                        : ''}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                    {fieldErrors.primary_model_id && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '2px' }}>{fieldErrors.primary_model_id}</div>}
                                </div>
                            ) : (
                                <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                                    {t('wizard.step1.noModels')} <span style={{ color: 'var(--accent-primary)', cursor: 'pointer' }} onClick={() => navigate('/enterprise')}>{t('wizard.step1.enterpriseSettings')}</span> {t('wizard.step1.addModels')}
                                </div>
                            )}
                        </div>

                        {/* Token limits */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                                <label className="form-label">{t('wizard.step1.dailyTokenLimit')}</label>
                                <input className={`form-input${fieldErrors.max_tokens_per_day ? ' input-error' : ''}`} type="number" value={form.max_tokens_per_day}
                                    onChange={(e) => { setForm({ ...form, max_tokens_per_day: e.target.value }); clearFieldError('max_tokens_per_day'); }}
                                    placeholder={t("wizard.step1.unlimited")} />
                                {fieldErrors.max_tokens_per_day && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.max_tokens_per_day}</div>}
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('wizard.step1.monthlyTokenLimit')}</label>
                                <input className={`form-input${fieldErrors.max_tokens_per_month ? ' input-error' : ''}`} type="number" value={form.max_tokens_per_month}
                                    onChange={(e) => { setForm({ ...form, max_tokens_per_month: e.target.value }); clearFieldError('max_tokens_per_month'); }}
                                    placeholder={t("wizard.step1.unlimited")} />
                                {fieldErrors.max_tokens_per_month && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.max_tokens_per_month}</div>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Personality */}
                {step === 1 && (
                    <div>
                        <h3 style={{ marginBottom: '20px', fontWeight: 600, fontSize: '15px' }}>{t('wizard.step2.title')}</h3>
                        <div className="form-group">
                            <label className="form-label">{t('agent.fields.personality')}</label>
                            <textarea className="form-textarea" rows={4} value={form.personality}
                                onChange={(e) => setForm({ ...form, personality: e.target.value })}
                                placeholder={t("wizard.step2.personalityPlaceholder")} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('agent.fields.boundaries')}</label>
                            <textarea className="form-textarea" rows={4} value={form.boundaries}
                                onChange={(e) => setForm({ ...form, boundaries: e.target.value })}
                                placeholder={t("wizard.step2.boundariesPlaceholder")} />
                        </div>
                    </div>
                )}

                {/* Step 3: Skills */}
                {step === 2 && (
                    <div>
                        <h3 style={{ marginBottom: '20px', fontWeight: 600, fontSize: '15px' }}>{t('wizard.step3.title')}</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {t('wizard.step3.description')}
                        </p>
                        {selectedTemplate && templateIncludedSkills.length > 0 && (
                            <div style={{
                                marginBottom: '14px',
                                padding: '12px',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-default)',
                                borderRadius: '10px',
                            }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {isChineseUi ? '当前模板会自动装配以下技能' : 'The selected template will auto-include these skills'}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                    {isChineseUi
                                        ? '这些技能无需手动勾选，创建后会随模板一起写入 Agent 工作区。'
                                        : 'These skills do not need manual selection and will be written into the agent workspace automatically.'}
                                </div>
                                {selectedTemplateRecommendedPacks.length > 0 && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
                                        {isChineseUi ? '这些自动技能主要来自：' : 'These auto-included skills mainly come from: '}
                                        {selectedTemplateRecommendedPacks.map((pack: SkillPackCatalogItem) => (
                                            <span
                                                key={`source-pack-${pack.pack_id}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    marginRight: '6px',
                                                    marginTop: '4px',
                                                    padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-secondary)',
                                                }}
                                            >
                                                {isChineseUi ? pack.display_name_zh : pack.display_name_en}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                    {templateIncludedSkills.map((skill: SkillLibraryItem) => (
                                        <span
                                            key={skill.id}
                                            style={{
                                                fontSize: '11px',
                                                padding: '4px 8px',
                                                borderRadius: '999px',
                                                background: 'var(--accent-subtle)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--border-default)',
                                            }}
                                        >
                                            {isChineseUi ? (skill.display_name_zh || skill.name) : skill.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {skillCards.map((skill: SkillLibraryItem) => {
                                const isDefault = skill.is_default;
                                const isTemplateIncluded = templateIncludedSkillIds.has(skill.id);
                                const isChecked = isDefault || isTemplateIncluded || form.skill_ids.includes(skill.id);
                                return (
                                    <label key={skill.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                                        background: isChecked ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                        border: `1px solid ${isChecked ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                        borderRadius: '8px', cursor: (isDefault || isTemplateIncluded) ? 'default' : 'pointer',
                                        opacity: (isDefault || isTemplateIncluded) ? 0.85 : 1,
                                    }}>
                                        <input type="checkbox"
                                            checked={isChecked}
                                            disabled={isDefault || isTemplateIncluded}
                                            onChange={(e) => {
                                                if (isDefault || isTemplateIncluded) return;
                                                if (e.target.checked) {
                                                    setForm({ ...form, skill_ids: [...form.skill_ids, skill.id] });
                                                } else {
                                                    setForm({ ...form, skill_ids: form.skill_ids.filter((id: string) => id !== skill.id) });
                                                }
                                            }}
                                        />
                                        <div style={{ fontSize: '18px' }}>{skill.icon}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 500, fontSize: '13px' }}>
                                                    {isChineseUi ? (skill.display_name_zh || skill.name) : skill.name}
                                                </span>
                                                {isDefault && (
                                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--accent-primary)', color: '#fff', fontWeight: 500 }}>
                                                        {isChineseUi ? '必带' : 'Required'}
                                                    </span>
                                                )}
                                                {!isDefault && isTemplateIncluded && (
                                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--accent-primary)', color: '#fff', fontWeight: 500 }}>
                                                        {isChineseUi ? '模板预置' : 'Template'}
                                                    </span>
                                                )}
                                                {!isDefault && skill.recommended_for_first_scenario && (
                                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                        {isChineseUi ? '首场景推荐' : 'Recommended'}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                {isChineseUi
                                                    ? (skill.library_summary_zh || skill.description)
                                                    : (skill.description || skill.library_summary_zh)}
                                            </div>
                                            {skill.pack_hint_zh && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    {isChineseUi ? skill.pack_hint_zh : `Pack: ${skill.pack_id || skill.pack_key || 'general-support'}`}
                                                </div>
                                            )}
                                        </div>
                                    </label>);
                            })}
                            {globalSkills.length === 0 && (
                                <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                                    {isChineseUi ? '当前没有可用技能，请先在企业设置中配置。' : 'No skills available. Add skills in Company Settings.'}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 4: Permissions */}
                {step === 3 && (
                    <div>
                        <h3 style={{ marginBottom: '20px', fontWeight: 600, fontSize: '15px' }}>{t('wizard.step4.title')}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                            {[
                                { value: 'company', label: t('wizard.step4.companyWide'), desc: t('wizard.step4.companyWideDesc') },
                                { value: 'user', label: t('wizard.step4.selfOnly'), desc: t('wizard.step4.selfOnlyDesc') },
                            ].map((scope) => (
                                <label key={scope.value} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px',
                                    background: form.permission_scope_type === scope.value ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                    border: `1px solid ${form.permission_scope_type === scope.value ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                    borderRadius: '8px', cursor: 'pointer',
                                }}>
                                    <input type="radio" name="scope" checked={form.permission_scope_type === scope.value}
                                        onChange={() => setForm({ ...form, permission_scope_type: scope.value })} />

                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{scope.label}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{scope.desc}</div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Access Level — only for company scope */}
                        {form.permission_scope_type === 'company' && (
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
                                    {t('wizard.step4.accessLevel', 'Default Access Level')}
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[
                                        { value: 'use', icon: '👁️', label: t('wizard.step4.useLevel', 'Use'), desc: t('wizard.step4.useDesc', 'Can use Task, Chat, Tools, Skills, Workspace') },
                                        { value: 'manage', icon: '⚙️', label: t('wizard.step4.manageLevel', 'Manage'), desc: t('wizard.step4.manageDesc', 'Full access including Settings, Mind, Relationships') },
                                    ].map((lvl) => (
                                        <label key={lvl.value} style={{
                                            flex: 1, display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px',
                                            background: form.permission_access_level === lvl.value ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                                            border: `1px solid ${form.permission_access_level === lvl.value ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                            borderRadius: '8px', cursor: 'pointer',
                                        }}>
                                            <input type="radio" name="access_level" checked={form.permission_access_level === lvl.value}
                                                onChange={() => setForm({ ...form, permission_access_level: lvl.value })} style={{ marginTop: '2px' }} />
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '13px' }}>{lvl.icon} {lvl.label}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{lvl.desc}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 5: Channel */}
                {step === 4 && (
                    <div>
                        <h3 style={{ marginBottom: '20px', fontWeight: 600, fontSize: '15px' }}>{t('wizard.step5.title', 'Channel Configuration')}</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {t('wizard.step5.description', 'Connect messaging platforms to enable your agent to communicate through different channels.')}
                        </p>

                        <ChannelConfig mode="create" values={channelValues} onChange={setChannelValues} />

                        {Object.keys(channelValues).length === 0 && (
                            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '12px' }}>
                                {t('wizard.step5.skipHint')}
                            </div>
                        )}
                    </div>
                )}


            </div>

            {/* Summary sidebar */}
            {selectedModel && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '640px', marginBottom: '80px' }}>
                    <strong>{form.name || t('wizard.summary.unnamed')}</strong> · {t('wizard.summary.model')}: {selectedModel.label}
                    {form.max_tokens_per_day && ` · ${t('wizard.summary.dailyLimit')}: ${Number(form.max_tokens_per_day).toLocaleString()}`}
                </div>
            )}
            {!selectedModel && <div style={{ marginBottom: '80px' }}></div>}

            {/* Navigation — sticky footer at the bottom */}
            <div style={{
                position: 'fixed', bottom: 0, left: 'var(--sidebar-width)', right: 0,
                background: 'var(--bg-primary)', borderTop: '1px solid var(--border-subtle)',
                padding: '16px 32px', zIndex: 100,
                display: 'flex', justifyContent: 'flex-start',
                transition: 'left var(--transition-default)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '640px' }}>
                    <button className="btn btn-secondary" onClick={() => step > 0 ? setStep(step - 1) : navigate('/')}
                        disabled={createMutation.isPending}>
                        {step === 0 ? t('common.cancel') : t('wizard.prev')}
                    </button>
                    {step < STEPS.length - 1 ? (
                        <button className="btn btn-primary" onClick={handleNext}>
                            {t('wizard.next')} →
                        </button>
                    ) : (
                        <button className="btn btn-primary" onClick={handleFinish}
                            disabled={createMutation.isPending}>
                            {createMutation.isPending ? t('common.loading') : t('wizard.finish')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
