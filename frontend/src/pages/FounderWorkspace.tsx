import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
    buildFounderMainlinePlanningPayload,
    enterpriseApi,
    FOUNDER_MAINLINE_INTERVIEW_FIELDS,
    getFounderMainlineStateLabel,
    type FounderMainlineInterviewAnswerMap,
} from '../services/api';
import { buildFounderMainlineAgentCreateSummary } from '../services/founderMainlineDraftPlanSummary';
import {
    resolveFounderCompanyDashboardSnapshot,
    saveFounderCompanyDashboardSnapshot,
} from '../services/founderCompanyDashboard';
import {
    buildFounderWorkspaceAnswerMap,
    deriveFounderWorkspaceStep,
    founderWorkspaceApi,
    loadFounderActiveWorkspaceId,
    resolveFounderWorkspaceSelection,
    saveFounderActiveWorkspaceId,
    type FounderWorkspace,
} from '../services/founderWorkspace';
import {
    buildFounderProviderPresetCards,
    loadFounderPreferredProvider,
    requestFounderProviderSpecs,
    saveFounderPreferredProvider,
    type FounderProviderPresetCard,
} from '../services/founderProviderPresets';

function getStepLabel(step: ReturnType<typeof deriveFounderWorkspaceStep>, isChinese: boolean) {
    if (isChinese) {
        if (step === 'dashboard') return '已进入运营视图';
        if (step === 'review') return '已进入方案评审';
        return '信息采集';
    }

    if (step === 'dashboard') return 'Operating dashboard';
    if (step === 'review') return 'Plan review';
    return 'Intake';
}

function renderBusinessLogic(value: unknown) {
    if (!value || typeof value !== 'object') {
        return 'N/A';
    }

    return Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => Boolean(item))
        .map(([key, item]) => `${key}: ${String(item)}`)
        .join(' | ');
}

function getModelProvider(model: any): string {
    return String(model?.provider || model?.provider_type || model?.vendor || '').trim();
}

function getModelName(model: any): string {
    return String(model?.model || model?.name || model?.label || '').trim();
}

function getModelBaseUrl(model: any): string | undefined {
    const value = String(model?.base_url || model?.baseUrl || '').trim();
    return value || undefined;
}

function findWorkspaceModelId(workspace: FounderWorkspace | null, models: any[]): string {
    const context = workspace?.planning_context?.model_ready_context;
    if (!context?.recommended_model) {
        return '';
    }

    const matched = models.find((model) => {
        const sameModel = getModelName(model) === context.recommended_model;
        const sameProvider = !context.resolved_provider || getModelProvider(model) === context.resolved_provider;
        const sameBaseUrl = !context.normalized_base_url || getModelBaseUrl(model) === context.normalized_base_url;
        return sameModel && sameProvider && sameBaseUrl;
    });

    return matched?.id || '';
}

export default function FounderWorkspace() {
    const { i18n } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const isChinese = i18n.language?.startsWith('zh');
    const [preferredProvider, setPreferredProvider] = useState(() => loadFounderPreferredProvider());
    const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => loadFounderActiveWorkspaceId());

    const [form, setForm] = useState({
        name: '',
        businessBrief: '',
        offer: '',
        channel: '',
    });
    const [planningBrief, setPlanningBrief] = useState('');
    const [planningAnswers, setPlanningAnswers] = useState<FounderMainlineInterviewAnswerMap>({});
    const [selectedModelId, setSelectedModelId] = useState('');
    const [correctionNotes, setCorrectionNotes] = useState('');
    const [userConfirmed, setUserConfirmed] = useState(false);
    const [localError, setLocalError] = useState('');

    const { data: workspaces = [], isLoading } = useQuery({
        queryKey: ['founder-workspaces'],
        queryFn: founderWorkspaceApi.list,
    });
    const { data: providerSpecs = [] } = useQuery({
        queryKey: ['founder-provider-specs', 'founder-workspace'],
        queryFn: requestFounderProviderSpecs,
    });
    const { data: models = [] } = useQuery({
        queryKey: ['llm-models', 'founder-workspace'],
        queryFn: enterpriseApi.llmModels,
    });

    const createMutation = useMutation({
        mutationFn: founderWorkspaceApi.create,
        onSuccess: async (createdWorkspace) => {
            await queryClient.invalidateQueries({ queryKey: ['founder-workspaces'] });
            saveFounderActiveWorkspaceId(createdWorkspace.id);
            setActiveWorkspaceId(createdWorkspace.id);
            setForm({
                name: '',
                businessBrief: '',
                offer: '',
                channel: '',
            });
            setLocalError('');
        },
    });

    const currentWorkspace = resolveFounderWorkspaceSelection(
        workspaces,
        activeWorkspaceId,
        createMutation.data || null,
    );
    const currentStep = currentWorkspace ? deriveFounderWorkspaceStep(currentWorkspace) : 'intake';
    const mutationError = createMutation.error instanceof Error ? createMutation.error.message : '';
    const providerPresetCards = useMemo(
        () => buildFounderProviderPresetCards(providerSpecs).slice(0, 4),
        [providerSpecs],
    );
    const enabledModels = useMemo(
        () => models.filter((item: any) => item?.is_enabled !== false && item?.is_active !== false),
        [models],
    );
    const selectedModel = enabledModels.find((item: any) => item.id === selectedModelId) || null;
    const currentPlanStatus = currentWorkspace?.latest_plan?.plan_status || 'step0_blocked';
    const canMaterializeCurrentWorkspace = Boolean(
        currentWorkspace
        && currentWorkspace.materialization_status !== 'completed'
        && currentPlanStatus === 'ready_for_deploy_prep',
    );

    useEffect(() => {
        if (!currentWorkspace?.id) {
            return;
        }

        if (activeWorkspaceId !== currentWorkspace.id) {
            saveFounderActiveWorkspaceId(currentWorkspace.id);
            setActiveWorkspaceId(currentWorkspace.id);
        }
    }, [activeWorkspaceId, currentWorkspace?.id]);

    useEffect(() => {
        if (!currentWorkspace) {
            return;
        }

        setPlanningBrief(currentWorkspace.planning_context?.business_brief || currentWorkspace.business_brief || '');
        setPlanningAnswers(buildFounderWorkspaceAnswerMap(currentWorkspace));
        setCorrectionNotes(currentWorkspace.planning_context?.correction_notes || '');
        setUserConfirmed(Boolean(currentWorkspace.planning_context?.user_confirmed));
    }, [currentWorkspace?.id, currentWorkspace?.updated_at]);

    useEffect(() => {
        if (!currentWorkspace) {
            setSelectedModelId('');
            return;
        }

        const matchedModelId = findWorkspaceModelId(currentWorkspace, enabledModels);
        if (matchedModelId) {
            setSelectedModelId(matchedModelId);
        }
    }, [currentWorkspace?.id, currentWorkspace?.updated_at, enabledModels]);

    const planningPayload = currentWorkspace
        ? buildFounderMainlinePlanningPayload({
            businessBrief: planningBrief || currentWorkspace.business_brief,
            locale: isChinese ? 'zh-CN' : (i18n.language || 'en'),
            scenarioId: currentWorkspace.planning_context?.scenario_id,
            selectedModel: selectedModel
                ? {
                    provider: getModelProvider(selectedModel),
                    model: getModelName(selectedModel),
                    base_url: getModelBaseUrl(selectedModel) || null,
                }
                : null,
            answersByGroup: planningAnswers,
        })
        : null;
    const answeredCount = planningPayload?.answers.length || 0;
    const hasModelConfigured = Boolean(selectedModel && planningPayload?.model_ready_context?.recommended_model);
    const canSaveProgress = Boolean(currentWorkspace && planningPayload?.business_brief.trim() && hasModelConfigured);
    const canGenerateDraft = Boolean(
        currentWorkspace
        && planningPayload
        && planningPayload.business_brief.trim()
        && hasModelConfigured
        && answeredCount === FOUNDER_MAINLINE_INTERVIEW_FIELDS.length,
    );
    const latestPlanNextQuestions = Array.isArray((currentWorkspace?.latest_plan as any)?.next_questions)
        ? ((currentWorkspace?.latest_plan as any)?.next_questions as Array<{ group_id: string; question_zh: string }>)
        : [];
    const latestPlanMissingGroups = new Set(
        Array.isArray((currentWorkspace?.latest_plan as any)?.missing_groups)
            ? ((currentWorkspace?.latest_plan as any)?.missing_groups as string[])
            : [],
    );
    const draftSummary = currentWorkspace?.draft_plan
        ? buildFounderMainlineAgentCreateSummary(currentWorkspace.draft_plan)
        : null;
    const displayedPlanState = (draftSummary?.planStatus || currentPlanStatus) as any;
    const planStateLabel = getFounderMainlineStateLabel(displayedPlanState, isChinese);

    const savePlanningMutation = useMutation({
        mutationFn: async () => {
            if (!currentWorkspace || !planningPayload) {
                throw new Error(isChinese ? '请先创建工作区。' : 'Create a workspace first.');
            }
            return founderWorkspaceApi.saveInterviewProgress(currentWorkspace.id, planningPayload);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['founder-workspaces'] });
        },
    });

    const generateDraftMutation = useMutation({
        mutationFn: async () => {
            if (!currentWorkspace || !planningPayload) {
                throw new Error(isChinese ? '请先创建工作区。' : 'Create a workspace first.');
            }
            return founderWorkspaceApi.generateDraftPlan(currentWorkspace.id, {
                ...planningPayload,
                user_confirmed: userConfirmed,
                ...(correctionNotes.trim() ? { correction_notes: correctionNotes.trim() } : {}),
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['founder-workspaces'] });
        },
    });

    const materializeMutation = useMutation({
        mutationFn: (workspaceId: string) => founderWorkspaceApi.materialize(workspaceId),
        onSuccess: async (result) => {
            saveFounderActiveWorkspaceId(result.workspace_id);
            setActiveWorkspaceId(result.workspace_id);
            const snapshot = resolveFounderCompanyDashboardSnapshot(
                {
                    name: currentWorkspace?.name,
                    dashboard_snapshot: result.dashboard_snapshot,
                },
                {
                    workspaceId: result.workspace_id,
                    companyName: currentWorkspace?.name || 'Founder Workspace',
                    agents: result.created_agents.map((agent) => ({
                        name: agent.name,
                        status: 'idle',
                    })),
                    blockers: [],
                    relationshipCount: result.relationship_count,
                    triggerCount: result.trigger_count,
                    generatedAt: new Date().toISOString(),
                },
            );
            saveFounderCompanyDashboardSnapshot(snapshot);
            await queryClient.invalidateQueries({ queryKey: ['founder-workspaces'] });
            navigate('/founder-workspace/dashboard');
        },
    });

    const selectWorkspace = (workspaceId: string) => {
        saveFounderActiveWorkspaceId(workspaceId);
        setActiveWorkspaceId(workspaceId);
        setLocalError('');
    };

    const handleCreate = () => {
        const name = form.name.trim();
        const businessBrief = form.businessBrief.trim();
        if (!name || !businessBrief) {
            setLocalError(
                isChinese
                    ? '请至少填写工作区名称和业务目标。'
                    : 'Please fill in the workspace name and business brief.',
            );
            return;
        }

        setLocalError('');
        createMutation.mutate({
            name,
            business_brief: businessBrief,
            business_logic: {
                offer: form.offer.trim(),
                channel: form.channel.trim(),
            },
        });
    };

    const planningError = savePlanningMutation.error instanceof Error ? savePlanningMutation.error.message : '';
    const draftError = generateDraftMutation.error instanceof Error ? generateDraftMutation.error.message : '';

    const sectionStyle: React.CSSProperties = {
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '18px',
        padding: '24px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
    };

    return (
        <div style={{ padding: '32px', display: 'grid', gap: '20px' }}>
            <section
                style={{
                    ...sectionStyle,
                    background:
                        'linear-gradient(135deg, rgba(27, 110, 194, 0.15), rgba(23, 145, 103, 0.12))',
                }}
            >
                <div style={{ display: 'grid', gap: '12px' }}>
                    <div
                        style={{
                            fontSize: '12px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Founder Workspace
                    </div>
                    <h1 style={{ margin: 0, fontSize: '30px', lineHeight: 1.1 }}>
                        {isChinese
                            ? '先沉淀创业工作区，再自动生成多 Agent 公司骨架'
                            : 'Capture the company context first, then generate the multi-agent company scaffold'}
                    </h1>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '860px', lineHeight: 1.7 }}>
                        {isChinese
                            ? 'Founder Workspace 现在直接承接创业访谈、草案评审和公司物料化。你不需要再跳到旧的单 Agent 创建流里手工拼装。'
                            : 'Founder Workspace now owns the interview, draft-plan review, and company materialization flow directly so you no longer need to assemble everything in the legacy single-agent flow.'}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending
                                ? (isChinese ? '创建中...' : 'Creating...')
                                : (isChinese ? '创建 Founder Workspace' : 'Create Founder Workspace')}
                        </button>
                        <button className="btn btn-secondary" onClick={() => navigate('/enterprise')}>
                            {isChinese ? '先配置模型与供应商' : 'Configure providers and models'}
                        </button>
                    </div>
                </div>
            </section>

            <section style={sectionStyle}>
                <div style={{ display: 'grid', gap: '16px' }}>
                    <div style={{ display: 'grid', gap: '6px' }}>
                        <h2 style={{ margin: 0, fontSize: '20px' }}>
                            {isChinese ? '新手友好的模型提供商预设' : 'Beginner-friendly provider presets'}
                        </h2>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {isChinese
                                ? '先选一个预设，再去填 API Key 和模型。这样你不用先理解 Base URL 和协议差异这些工程细节。'
                                : 'Pick a preset first, then fill in the API key and model later without thinking about raw base URLs or protocol details upfront.'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                        {providerPresetCards.map((card) => (
                            <ProviderPresetCard
                                key={card.provider}
                                card={card}
                                isChinese={isChinese}
                                isSelected={preferredProvider === card.provider}
                                onUse={() => {
                                    saveFounderPreferredProvider(card.provider);
                                    setPreferredProvider(card.provider);
                                }}
                                onConfigure={() => {
                                    saveFounderPreferredProvider(card.provider);
                                    setPreferredProvider(card.provider);
                                    navigate('/enterprise');
                                }}
                            />
                        ))}
                    </div>
                </div>
            </section>

            <section style={sectionStyle}>
                <div style={{ display: 'grid', gap: '16px' }}>
                    <div style={{ display: 'grid', gap: '6px' }}>
                        <h2 style={{ margin: 0, fontSize: '20px' }}>
                            {isChinese ? '创建新的创业工作区' : 'Create a new founder workspace'}
                        </h2>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {isChinese
                                ? '先保存一个最小业务壳层，后面继续补充访谈、生成草案并一键物料化。'
                                : 'Save the minimal business shell first, then continue into interview, plan generation, and one-click materialization.'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                        <label style={{ display: 'grid', gap: '8px' }}>
                            <span>{isChinese ? '工作区名称' : 'Workspace name'}</span>
                            <input
                                className="form-input"
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder={isChinese ? '例如：Solo Growth Studio' : 'For example: Solo Growth Studio'}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '8px' }}>
                            <span>{isChinese ? '核心交付' : 'Core offer'}</span>
                            <input
                                className="form-input"
                                value={form.offer}
                                onChange={(event) => setForm((prev) => ({ ...prev, offer: event.target.value }))}
                                placeholder={isChinese ? '例如：咨询 + 训练营' : 'For example: consulting + cohort'}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '8px' }}>
                            <span>{isChinese ? '获客渠道' : 'Acquisition channel'}</span>
                            <input
                                className="form-input"
                                value={form.channel}
                                onChange={(event) => setForm((prev) => ({ ...prev, channel: event.target.value }))}
                                placeholder={isChinese ? '例如：短视频 + 邮件 + 社群' : 'For example: short video + email + community'}
                            />
                        </label>
                    </div>

                    <label style={{ display: 'grid', gap: '8px' }}>
                        <span>{isChinese ? '业务目标 / 业务逻辑' : 'Business brief'}</span>
                        <textarea
                            className="form-input"
                            style={{ minHeight: '140px', resize: 'vertical' }}
                            value={form.businessBrief}
                            onChange={(event) => setForm((prev) => ({ ...prev, businessBrief: event.target.value }))}
                            placeholder={
                                isChinese
                                    ? '请描述你要做什么业务、服务谁、如何成交，以及哪些环节希望交给 AI 自动完成。'
                                    : 'Describe what business you are building, who it serves, how it converts, and what should be automated.'
                            }
                        />
                    </label>

                    {(localError || mutationError) && (
                        <div
                            style={{
                                padding: '12px 14px',
                                borderRadius: '12px',
                                background: 'rgba(214, 48, 49, 0.1)',
                                color: 'var(--error)',
                            }}
                        >
                            {localError || mutationError}
                        </div>
                    )}
                </div>
            </section>

            <section id="founder-planning-section" style={sectionStyle}>
                <div style={{ display: 'grid', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'grid', gap: '6px' }}>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>
                                {isChinese ? 'Founder 访谈与方案生成' : 'Founder interview and plan generation'}
                            </h2>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                {isChinese
                                    ? '所有答案、模型上下文和草案都会回写到当前工作区，不再只存在浏览器本地。'
                                    : 'Answers, model context, and draft plans are now persisted on the workspace instead of only living in local browser state.'}
                            </div>
                        </div>
                        {currentWorkspace && (
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '999px',
                                        background: 'rgba(27, 110, 194, 0.12)',
                                        fontSize: '12px',
                                    }}
                                >
                                    {isChinese ? '当前状态' : 'State'}: {planStateLabel}
                                </span>
                                <span
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-secondary)',
                                        fontSize: '12px',
                                        border: '1px solid var(--border-subtle)',
                                    }}
                                >
                                    {isChinese ? '已回答' : 'Answered'}: {answeredCount}/{FOUNDER_MAINLINE_INTERVIEW_FIELDS.length}
                                </span>
                            </div>
                        )}
                    </div>

                    {!currentWorkspace ? (
                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '16px',
                                border: '1px dashed var(--border-subtle)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {isChinese
                                ? '先创建一个 Founder Workspace，然后这里会直接进入业务访谈和草案生成。'
                                : 'Create a Founder Workspace first, then continue the interview and plan generation here.'}
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gap: '14px' }}>
                                <div style={{ fontWeight: 600 }}>
                                    {isChinese ? '1. 选择当前要用的模型' : '1. Choose the model for this planning run'}
                                </div>
                                {enabledModels.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                                        {enabledModels.map((model: any) => {
                                            const isSelected = selectedModelId === model.id;
                                            return (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => setSelectedModelId(model.id)}
                                                    style={{
                                                        textAlign: 'left',
                                                        border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                                                        background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                                                        borderRadius: '16px',
                                                        padding: '16px',
                                                        display: 'grid',
                                                        gap: '6px',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <strong>{model.label || getModelName(model) || 'Model'}</strong>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                        {getModelProvider(model) || (isChinese ? '未标记 provider' : 'Provider not labeled')}
                                                    </span>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                        {getModelName(model) || (isChinese ? '未标记模型名' : 'Model name not labeled')}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            padding: '16px',
                                            borderRadius: '14px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-subtle)',
                                            display: 'grid',
                                            gap: '10px',
                                        }}
                                    >
                                        <div style={{ color: 'var(--text-secondary)' }}>
                                            {isChinese
                                                ? '当前还没有可用模型。先去企业设置里配置一个可用 provider 和模型，工作区才能继续进入 step0 之后的访谈流程。'
                                                : 'No model is available yet. Configure at least one provider and model in Enterprise settings to continue past step 0.'}
                                        </div>
                                        <div>
                                            <button className="btn btn-secondary" onClick={() => navigate('/enterprise')}>
                                                {isChinese ? '前往企业设置' : 'Open Enterprise settings'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gap: '14px' }}>
                                <div style={{ fontWeight: 600 }}>
                                    {isChinese ? '2. 完成创业访谈' : '2. Complete the founder interview'}
                                </div>
                                <label style={{ display: 'grid', gap: '8px' }}>
                                    <span>{isChinese ? '当前业务 brief' : 'Current business brief'}</span>
                                    <textarea
                                        className="form-input"
                                        style={{ minHeight: '120px', resize: 'vertical' }}
                                        value={planningBrief}
                                        onChange={(event) => setPlanningBrief(event.target.value)}
                                        placeholder={isChinese ? '继续打磨你的业务目标与业务逻辑。' : 'Refine the business goal and business logic.'}
                                    />
                                </label>

                                <div style={{ display: 'grid', gap: '14px' }}>
                                    {FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => {
                                        const isMissing = latestPlanMissingGroups.has(field.group_id);
                                        return (
                                            <label
                                                key={field.group_id}
                                                style={{
                                                    display: 'grid',
                                                    gap: '8px',
                                                    padding: '16px',
                                                    borderRadius: '16px',
                                                    background: 'var(--bg-secondary)',
                                                    border: `1px solid ${isMissing ? 'rgba(214, 48, 49, 0.35)' : 'var(--border-subtle)'}`,
                                                }}
                                            >
                                                <div style={{ display: 'grid', gap: '4px' }}>
                                                    <strong>{isChinese ? field.label_zh : field.label_en}</strong>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                        {isChinese ? field.question_zh : field.question_en}
                                                    </span>
                                                </div>
                                                <textarea
                                                    className="form-input"
                                                    style={{ minHeight: '90px', resize: 'vertical' }}
                                                    value={planningAnswers[field.group_id] || ''}
                                                    onChange={(event) => setPlanningAnswers((prev) => ({
                                                        ...prev,
                                                        [field.group_id]: event.target.value,
                                                    }))}
                                                    placeholder={isChinese ? field.placeholder_zh : field.placeholder_en}
                                                />
                                            </label>
                                        );
                                    })}
                                </div>

                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => savePlanningMutation.mutate()}
                                        disabled={!canSaveProgress || savePlanningMutation.isPending}
                                    >
                                        {savePlanningMutation.isPending
                                            ? (isChinese ? '保存中...' : 'Saving...')
                                            : (isChinese ? '保存访谈进度' : 'Save interview progress')}
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => generateDraftMutation.mutate()}
                                        disabled={!canGenerateDraft || generateDraftMutation.isPending}
                                    >
                                        {generateDraftMutation.isPending
                                            ? (isChinese ? '生成中...' : 'Generating...')
                                            : (isChinese ? '生成 Founder 草案' : 'Generate founder draft plan')}
                                    </button>
                                </div>

                                {(planningError || draftError) && (
                                    <div
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            background: 'rgba(214, 48, 49, 0.1)',
                                            color: 'var(--error)',
                                        }}
                                    >
                                        {planningError || draftError}
                                    </div>
                                )}

                                {latestPlanNextQuestions.length > 0 && (
                                    <div
                                        style={{
                                            padding: '16px',
                                            borderRadius: '16px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-subtle)',
                                            display: 'grid',
                                            gap: '8px',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600 }}>
                                            {isChinese ? '当前系统还需要你补充这些信息' : 'The system still needs these answers'}
                                        </div>
                                        {latestPlanNextQuestions.map((question) => (
                                            <div key={question.group_id} style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                • {question.question_zh}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gap: '14px' }}>
                                <div style={{ fontWeight: 600 }}>
                                    {isChinese ? '3. 评审草案并确认是否可进入物料化' : '3. Review the draft and confirm materialization readiness'}
                                </div>
                                <label style={{ display: 'grid', gap: '8px' }}>
                                    <span>{isChinese ? '修正说明（可选）' : 'Correction notes (optional)'}</span>
                                    <textarea
                                        className="form-input"
                                        style={{ minHeight: '100px', resize: 'vertical' }}
                                        value={correctionNotes}
                                        onChange={(event) => setCorrectionNotes(event.target.value)}
                                        placeholder={
                                            isChinese
                                                ? '如果你希望系统调整团队角色、渠道重点、交付方式或人工边界，可以在这里补充修正意见。'
                                                : 'Use this to request changes to roles, channels, delivery, or human approval boundaries.'
                                        }
                                    />
                                </label>
                                <label style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={userConfirmed}
                                        onChange={(event) => setUserConfirmed(event.target.checked)}
                                    />
                                    <span>
                                        {isChinese
                                            ? '我确认当前草案方向可作为首版公司骨架，并允许进入 deploy prep / materialize。'
                                            : 'I confirm the current draft direction can be used as the first company scaffold and can move toward deploy prep / materialize.'}
                                    </span>
                                </label>

                                {draftSummary ? (
                                    <div
                                        style={{
                                            padding: '18px',
                                            borderRadius: '16px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-subtle)',
                                            display: 'grid',
                                            gap: '14px',
                                        }}
                                    >
                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <strong>{draftSummary.blueprintSummaryZh}</strong>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                {isChinese ? '场景' : 'Scenario'}: {draftSummary.scenarioNameZh}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                                            <MetricCard label={isChinese ? 'Founder 主控' : 'Founder lead'} value={draftSummary.founderDisplayNameZh} />
                                            <MetricCard label={isChinese ? '团队草案' : 'Draft teams'} value={draftSummary.teamNamesZh.join(' / ') || '-'} />
                                            <MetricCard label={isChinese ? '部署准备' : 'Deploy prep'} value={draftSummary.canEnterDeployPrep ? (isChinese ? '可进入' : 'Ready') : (isChinese ? '暂不可进入' : 'Not ready')} />
                                        </div>

                                        {draftSummary.openQuestions.length > 0 && (
                                            <div style={{ display: 'grid', gap: '8px' }}>
                                                <div style={{ fontWeight: 600 }}>
                                                    {isChinese ? '待确认问题' : 'Open questions'}
                                                </div>
                                                {draftSummary.openQuestions.map((item) => (
                                                    <div key={item} style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                        • {item}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(!draftSummary.canEnterDeployPrep
                                            && (draftSummary.deployPrepBlockerReasonZh || draftSummary.deployPrepMissingItems.length > 0)) && (
                                            <div
                                                style={{
                                                    padding: '14px',
                                                    borderRadius: '14px',
                                                    background: 'rgba(214, 48, 49, 0.08)',
                                                    display: 'grid',
                                                    gap: '8px',
                                                }}
                                            >
                                                {!!draftSummary.deployPrepBlockerReasonZh && (
                                                    <div>{draftSummary.deployPrepBlockerReasonZh}</div>
                                                )}
                                                {draftSummary.deployPrepMissingItems.map((item) => (
                                                    <div key={item} style={{ color: 'var(--text-secondary)' }}>
                                                        • {item}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            padding: '16px',
                                            borderRadius: '14px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px dashed var(--border-subtle)',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {isChinese
                                            ? '完成模型选择和访谈后，就可以在这里生成 Founder 草案并检查团队结构、开放问题与部署准备情况。'
                                            : 'Once the model and interview are ready, this area will show the founder draft, team structure, open questions, and deploy-prep readiness.'}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>

            <section style={sectionStyle}>
                <div style={{ display: 'grid', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>
                                {isChinese ? '当前工作区状态' : 'Current workspace state'}
                            </h2>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
                                {isChinese
                                    ? '这里展示当前已保存的 Founder Workspace、规划状态，以及是否已经进入多 Agent 物料化阶段。'
                                    : 'This shows the saved Founder Workspace, planning status, and whether it has entered multi-agent materialization.'}
                            </div>
                        </div>
                        {currentWorkspace && (
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary" onClick={() => navigate('/enterprise')}>
                                    {isChinese ? '调整模型配置' : 'Adjust model settings'}
                                </button>
                                {canMaterializeCurrentWorkspace && (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => materializeMutation.mutate(currentWorkspace.id)}
                                        disabled={materializeMutation.isPending}
                                    >
                                        {materializeMutation.isPending
                                            ? (isChinese ? '正在生成公司骨架...' : 'Generating company scaffold...')
                                            : (isChinese ? '一键生成多 Agent 公司骨架' : 'Generate multi-agent company scaffold')}
                                    </button>
                                )}
                                {currentWorkspace.materialization_status === 'completed' && (
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            selectWorkspace(currentWorkspace.id);
                                            navigate('/founder-workspace/dashboard');
                                        }}
                                    >
                                        {isChinese ? '打开 Founder Dashboard' : 'Open Founder Dashboard'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {materializeMutation.error instanceof Error && (
                        <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(214, 48, 49, 0.1)', color: 'var(--error)' }}>
                            {materializeMutation.error.message}
                        </div>
                    )}

                    {isLoading ? (
                        <div style={{ color: 'var(--text-secondary)' }}>
                            {isChinese ? '正在加载工作区...' : 'Loading workspaces...'}
                        </div>
                    ) : currentWorkspace ? (
                        <div style={{ display: 'grid', gap: '16px' }}>
                            <WorkspaceCard workspace={currentWorkspace} isChinese={isChinese} currentStep={currentStep} />
                            {workspaces.length > 1 && (
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                        {isChinese ? '其他已保存工作区' : 'Other saved workspaces'}
                                    </div>
                                    {workspaces
                                        .filter((workspace) => workspace.id !== currentWorkspace.id)
                                        .map((workspace) => (
                                        <WorkspaceCard
                                            key={workspace.id}
                                            workspace={workspace}
                                            isChinese={isChinese}
                                            currentStep={deriveFounderWorkspaceStep(workspace)}
                                            compact
                                            onSelect={() => selectWorkspace(workspace.id)}
                                        />
                                        ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '16px',
                                border: '1px dashed var(--border-subtle)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {isChinese
                                ? '还没有已保存的 Founder Workspace。先创建一个业务壳层，我们再继续推进访谈、方案和多 Agent 生成。'
                                : 'No founder workspace has been saved yet. Create the business shell first and then continue into interview, planning, and multi-agent generation.'}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function ProviderPresetCard({
    card,
    isChinese,
    isSelected,
    onUse,
    onConfigure,
}: {
    card: FounderProviderPresetCard;
    isChinese: boolean;
    isSelected: boolean;
    onUse: () => void;
    onConfigure: () => void;
}) {
    return (
        <div
            style={{
                border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: '16px',
                padding: '18px',
                background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                display: 'grid',
                gap: '12px',
            }}
        >
            <div style={{ display: 'grid', gap: '6px' }}>
                <strong style={{ fontSize: '16px' }}>
                    {isChinese ? card.labelZh : card.labelEn}
                </strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
                    {isChinese ? card.descriptionZh : card.descriptionEn}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '6px 10px', borderRadius: '999px', background: 'var(--bg-primary)', fontSize: '12px' }}>
                    {card.setupMode === 'guided'
                        ? (isChinese ? '引导式配置' : 'Guided setup')
                        : (isChinese ? '高级配置' : 'Advanced setup')}
                </span>
                <span style={{ padding: '6px 10px', borderRadius: '999px', background: 'var(--bg-primary)', fontSize: '12px' }}>
                    {card.showRawBaseUrlInput
                        ? (isChinese ? '需要手动 Base URL' : 'Manual base URL')
                        : (isChinese ? '无需手动 Base URL' : 'No raw base URL')}
                </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={onUse}>
                    {isChinese ? '设为首选预设' : 'Set as preferred'}
                </button>
                <button className="btn btn-primary" onClick={onConfigure}>
                    {isChinese ? '去配置模型' : 'Configure model'}
                </button>
            </div>
        </div>
    );
}

function WorkspaceCard({
    workspace,
    isChinese,
    currentStep,
    compact = false,
    onSelect,
}: {
    workspace: FounderWorkspace;
    isChinese: boolean;
    currentStep: ReturnType<typeof deriveFounderWorkspaceStep>;
    compact?: boolean;
    onSelect?: () => void;
}) {
    return (
        <div
            style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: compact ? '16px' : '20px',
                display: 'grid',
                gap: compact ? '10px' : '14px',
                background: 'var(--bg-secondary)',
                cursor: onSelect ? 'pointer' : 'default',
            }}
            onClick={onSelect}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '6px' }}>
                    <strong style={{ fontSize: compact ? '16px' : '18px' }}>{workspace.name}</strong>
                    <span style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {workspace.business_brief}
                    </span>
                </div>
                <div
                    style={{
                        alignSelf: 'start',
                        padding: '8px 12px',
                        borderRadius: '999px',
                        background: 'rgba(27, 110, 194, 0.12)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                    }}
                >
                    {getStepLabel(currentStep, isChinese)}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <MetricCard
                    label={isChinese ? '当前状态' : 'Current state'}
                    value={workspace.current_state}
                />
                <MetricCard
                    label={isChinese ? '规划状态' : 'Plan status'}
                    value={workspace.latest_plan?.plan_status || 'unknown'}
                />
                <MetricCard
                    label={isChinese ? '物料化状态' : 'Materialization'}
                    value={workspace.materialization_status}
                />
            </div>

            {compact && onSelect && (
                <div style={{ color: 'var(--accent-primary)', fontSize: '13px', fontWeight: 600 }}>
                    {isChinese ? 'Continue this workspace' : 'Click to continue with this workspace'}
                </div>
            )}

            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                    {isChinese ? '业务逻辑' : 'Business logic'}
                </strong>
                <span> · {renderBusinessLogic(workspace.business_logic)}</span>
            </div>
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div
            style={{
                padding: '14px',
                borderRadius: '14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gap: '6px',
            }}
        >
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{value}</div>
        </div>
    );
}
