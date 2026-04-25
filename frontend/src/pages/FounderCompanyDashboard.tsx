import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { agentApi } from '../services/api';
import {
    founderWorkspaceApi,
    loadFounderActiveWorkspaceId,
    saveFounderActiveWorkspaceId,
} from '../services/founderWorkspace';
import {
    buildFounderCompanyDashboardBlockers,
    hydrateFounderCompanyDashboardSnapshot,
    loadFounderCompanyDashboardSnapshot,
    resolveFounderCompanyDashboardSnapshot,
    resolveFounderCompanyDashboardWorkspace,
    summarizeFounderCompanyDashboard,
    type FounderCompanyDashboardSnapshot,
} from '../services/founderCompanyDashboard';

function buildFallbackSnapshot(workspaceName?: string): FounderCompanyDashboardSnapshot {
    return {
        companyName: workspaceName || 'Founder Workspace',
        agents: [],
        blockers: ['还没有可展示的公司运行快照。'],
        relationshipCount: 0,
        triggerCount: 0,
    };
}

export default function FounderCompanyDashboard() {
    const { i18n } = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const isChinese = i18n.language?.startsWith('zh');
    const routeWorkspaceId = searchParams.get('workspaceId');
    const persistedWorkspaceId = loadFounderActiveWorkspaceId();

    const { data: workspaces = [] } = useQuery({
        queryKey: ['founder-workspaces'],
        queryFn: founderWorkspaceApi.list,
        refetchInterval: 15000,
    });
    const { data: runtimeAgents = [] } = useQuery({
        queryKey: ['agents', 'founder-dashboard'],
        queryFn: () => agentApi.list(),
        refetchInterval: 15000,
    });

    const localSnapshot = loadFounderCompanyDashboardSnapshot();
    const currentWorkspace = resolveFounderCompanyDashboardWorkspace(workspaces, {
        routeWorkspaceId,
        persistedWorkspaceId,
        localSnapshot,
    });
    const scaffoldSnapshot = resolveFounderCompanyDashboardSnapshot(
        currentWorkspace,
        localSnapshot || buildFallbackSnapshot(currentWorkspace?.name),
    );
    const snapshot = useMemo(() => {
        const hydratedSnapshot = hydrateFounderCompanyDashboardSnapshot(scaffoldSnapshot, runtimeAgents);
        return {
            ...hydratedSnapshot,
            blockers: buildFounderCompanyDashboardBlockers(currentWorkspace, hydratedSnapshot),
        };
    }, [currentWorkspace, runtimeAgents, scaffoldSnapshot]);
    const summary = useMemo(() => summarizeFounderCompanyDashboard(snapshot), [snapshot]);

    useEffect(() => {
        if (!currentWorkspace?.id) {
            return;
        }

        if (persistedWorkspaceId !== currentWorkspace.id) {
            saveFounderActiveWorkspaceId(currentWorkspace.id);
        }

        if (routeWorkspaceId !== currentWorkspace.id) {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.set('workspaceId', currentWorkspace.id);
            setSearchParams(nextSearchParams, { replace: true });
        }
    }, [currentWorkspace?.id, persistedWorkspaceId, routeWorkspaceId, searchParams, setSearchParams]);

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
                    background: 'linear-gradient(135deg, rgba(0, 137, 123, 0.14), rgba(24, 90, 157, 0.14))',
                }}
            >
                <div style={{ display: 'grid', gap: '10px' }}>
                    <div
                        style={{
                            fontSize: '12px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Founder Company Dashboard
                    </div>
                    <h1 style={{ margin: 0, fontSize: '30px', lineHeight: 1.1 }}>
                        {isChinese ? summary.headlineZh : summary.headlineEn}
                    </h1>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '860px' }}>
                        {isChinese ? summary.nextActionZh : summary.nextActionEn}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => navigate(
                                currentWorkspace?.id
                                    ? `/founder-workspace?workspaceId=${encodeURIComponent(currentWorkspace.id)}`
                                    : '/founder-workspace',
                            )}
                        >
                            {isChinese ? '返回 Founder Workspace' : 'Back to Founder Workspace'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => navigate('/enterprise')}>
                            {isChinese ? '调整模型配置' : 'Adjust model settings'}
                        </button>
                    </div>
                </div>
            </section>

            <section style={sectionStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                    <MetricCard label={isChinese ? '总 Agent 数' : 'Total agents'} value={String(summary.totalAgentCount)} />
                    <MetricCard label={isChinese ? '活跃 Agent' : 'Active agents'} value={String(summary.activeAgentCount)} />
                    <MetricCard label={isChinese ? '暂停 Agent' : 'Paused agents'} value={String(summary.pausedAgentCount)} />
                    <MetricCard label={isChinese ? '阻塞项' : 'Blockers'} value={String(summary.blockerCount)} />
                    <MetricCard label={isChinese ? '协作关系' : 'Relationships'} value={String(snapshot.relationshipCount || 0)} />
                    <MetricCard label={isChinese ? '启动触发器' : 'Starter triggers'} value={String(snapshot.triggerCount || 0)} />
                </div>
            </section>

            <section style={sectionStyle}>
                <div style={{ display: 'grid', gap: '16px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px' }}>
                            {isChinese ? '当前公司骨架' : 'Current company scaffold'}
                        </h2>
                        <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {isChinese
                                ? '优先展示 Founder Workspace 持久化快照，再用实时 Agent 状态覆盖运行态。'
                                : 'The dashboard starts from the persisted founder snapshot, then hydrates it with live agent runtime status.'}
                        </div>
                    </div>

                    {snapshot.agents.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                            {snapshot.agents.map((agent) => (
                                <div
                                    key={agent.id || agent.name}
                                    style={{
                                        border: '1px solid var(--border-subtle)',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '16px',
                                        padding: '16px',
                                        display: 'grid',
                                        gap: '8px',
                                    }}
                                >
                                    <strong>{agent.name}</strong>
                                    <span
                                        style={{
                                            color: getStatusColor(agent.status),
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            textTransform: 'capitalize',
                                        }}
                                    >
                                        {isChinese ? '状态' : 'Status'}: {agent.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            style={{
                                padding: '16px',
                                borderRadius: '14px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {isChinese
                                ? '还没有可展示的物化结果。先在 Founder Workspace 完成 ready_for_deploy_prep，再执行 materialize。'
                                : 'No materialized scaffold is available yet. Finish ready_for_deploy_prep in Founder Workspace and then materialize it.'}
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '10px' }}>
                        <div style={{ fontWeight: 600 }}>
                            {isChinese ? '阻塞项' : 'Blockers'}
                        </div>
                        {snapshot.blockers.length > 0 ? snapshot.blockers.map((item) => (
                            <div
                                key={item}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: '12px',
                                    background: 'rgba(214, 48, 49, 0.08)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {item}
                            </div>
                        )) : (
                            <div style={{ color: 'var(--text-secondary)' }}>
                                {isChinese ? '当前没有活跃阻塞项。' : 'There are no active blockers right now.'}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div
            style={{
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'grid',
                gap: '6px',
            }}
        >
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700 }}>{value}</div>
        </div>
    );
}

function getStatusColor(status: string) {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'error') {
        return '#d63031';
    }
    if (normalized === 'stopped' || normalized === 'paused') {
        return '#b08900';
    }
    if (normalized === 'running' || normalized === 'idle' || normalized === 'active') {
        return '#00897b';
    }
    return 'var(--text-secondary)';
}
