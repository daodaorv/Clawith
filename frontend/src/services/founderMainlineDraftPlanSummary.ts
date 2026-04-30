import type {
    FounderMainlineDraftPlan,
    FounderMainlineRolePlan,
    FounderMainlineTeamPlan,
} from './founderMainlineDraftPlan';

export interface FounderMainlineAgentCreateSummary {
    scenarioId: string;
    scenarioNameZh: string;
    scenarioExplanationZh: string;
    scenarioSignals: string[];
    planStatus: FounderMainlineDraftPlan['plan_status'];
    blueprintSummaryZh: string;
    priorityFocus: string[];
    deployPrepBlockerReasonZh: string;
    deployPrepMissingItems: string[];
    previousPlanSummaryZh: string;
    changeSummaryZh: string[];
    changedTemplateKeys: string[];
    changedPackIds: string[];
    founderDisplayNameZh: string;
    founderTemplateKey: string;
    recommendedTemplateKeys: string[];
    recommendedPackIds: string[];
    previewTemplateNamesZh: string[];
    previewPackNamesZh: string[];
    teamNamesZh: string[];
    openQuestions: string[];
    canEnterDeployPrep: boolean;
}

export interface FounderMainlineAgentCreateAutofillSummary {
    founderTemplateKey: string;
    recommendedTemplateKeys: string[];
    recommendedPackIds: string[];
}

export interface FounderMainlineAgentCreateAutofillFormState {
    template_id: string;
    role_description: string;
    personality: string;
    boundaries: string;
    skill_ids: string[];
}

export interface FounderMainlineAgentCreateAutofillTemplate {
    id: string;
    name: string;
    description: string;
    soul_template: string;
}

export interface FounderMainlineAgentCreateAutofillTemplateLibraryItem {
    template_key: string;
    canonical_name: string;
    display_name_zh?: string;
}

export interface FounderMainlineAgentCreateAutofillSkillPack {
    pack_id: string;
    included_skills: string[];
}

export interface FounderMainlineAgentCreateAutofillSkill {
    id: string;
    folder_name: string;
}

export interface FounderMainlineAgentCreateAutofillInput {
    summary: FounderMainlineAgentCreateAutofillSummary | null | undefined;
    templates: FounderMainlineAgentCreateAutofillTemplate[];
    templateLibraryItems: FounderMainlineAgentCreateAutofillTemplateLibraryItem[];
    skillPacks: FounderMainlineAgentCreateAutofillSkillPack[];
    skills: FounderMainlineAgentCreateAutofillSkill[];
    currentForm: FounderMainlineAgentCreateAutofillFormState;
}

export interface FounderMainlineAgentCreateAutofillResult {
    nextForm: FounderMainlineAgentCreateAutofillFormState;
    resolvedTemplateId: string;
    resolvedTemplateKey: string;
    resolvedPackIds: string[];
    resolvedSkillIds: string[];
    unresolvedTemplateKeys: string[];
    unresolvedPackIds: string[];
}

export interface FounderMainlineAgentCreateGuardSummary {
    canEnterDeployPrep: boolean;
    deployPrepBlockerReasonZh: string;
    deployPrepMissingItems: string[];
}

export interface FounderMainlineAgentCreateGuardInput {
    summary: FounderMainlineAgentCreateGuardSummary | null | undefined;
    recommendationApplied: boolean;
    isChineseUi: boolean;
}

export interface FounderMainlineAgentCreateGuardResult {
    isBlocked: boolean;
    message: string;
}

export function parseSoulTemplate(
    soulTemplate: string,
    sectionNames: string[] = [],
): Record<string, string> {
    if (!soulTemplate) {
        const empty: Record<string, string> = {};
        sectionNames.forEach((name) => {
            empty[name.toLowerCase()] = '';
        });
        return empty;
    }

    const result: Record<string, string> = {};
    sectionNames.forEach((name) => {
        result[name.toLowerCase()] = '';
    });

    const sections = soulTemplate.split(/^##\s+/m);
    for (const section of sections) {
        const trimmedSection = section.trim();
        if (!trimmedSection) {
            continue;
        }
        const firstLineEnd = trimmedSection.indexOf('\n');
        const headerName = firstLineEnd > 0
            ? trimmedSection.slice(0, firstLineEnd).trim()
            : trimmedSection.trim();
        const content = firstLineEnd > 0
            ? trimmedSection.slice(firstLineEnd + 1).trim()
            : '';
        const matchedSection = sectionNames.find(
            (name) => name.toLowerCase() === headerName.toLowerCase(),
        );
        if (matchedSection) {
            result[matchedSection.toLowerCase()] = content;
        }
    }

    return result;
}

function collectRoleTemplateKeys(teams: FounderMainlineTeamPlan[]): string[] {
    const values = teams.flatMap((team) => team.roles.map((role: FounderMainlineRolePlan) => role.template_key));
    return [...new Set(values)];
}

function collectRolePackIds(teams: FounderMainlineTeamPlan[]): string[] {
    const values = teams.flatMap((team) =>
        team.roles.flatMap((role: FounderMainlineRolePlan) => role.recommended_skill_packs),
    );
    return [...new Set(values)];
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((value) => (value || '').trim()).filter(Boolean))];
}

function buildScenarioExplanationZh(
    scenarioSignals: string[],
    priorityFocus: string[],
): string {
    const signalText = scenarioSignals.length > 0
        ? `系统根据 ${scenarioSignals.join('、')} 命中了当前创业场景`
        : '系统根据业务描述和访谈答案命中了当前创业场景';
    const focusText = priorityFocus.length > 0
        ? `优先生成 ${priorityFocus.join('、')} 相关的多 Agent 协作骨架`
        : '优先生成第一版多 Agent 协作骨架';

    return `${signalText}，${focusText}。`;
}

export function buildFounderMainlineAgentCreateSummary(
    plan: FounderMainlineDraftPlan,
): FounderMainlineAgentCreateSummary {
    const recommendedTemplateKeys = [
        plan.founder_copilot.template_key,
        ...plan.template_recommendations.map((item) => item.template_key),
        ...collectRoleTemplateKeys(plan.teams),
    ];
    const recommendedPackIds = [
        ...plan.skill_pack_recommendations.map((item) => item.pack_id),
        ...plan.founder_copilot.recommended_skill_packs,
        ...collectRolePackIds(plan.teams),
    ];
    const scenarioSignals = uniqueNonEmpty(
        plan.traceability
            .filter((item) => item.mapped_entity_type === 'scenario' || item.mapped_entity_type === 'team')
            .map((item) => item.extracted_signal),
    );
    const priorityFocus = uniqueNonEmpty(plan.company_blueprint.priority_focus);
    const previewTemplateNamesZh = uniqueNonEmpty([
        plan.founder_copilot.display_name_zh,
        ...plan.template_recommendations.map((item) => item.display_name_zh),
        ...plan.teams.flatMap((team) => team.roles.map((role) => role.display_name_zh)),
    ]);
    const previewPackNamesZh = uniqueNonEmpty([
        ...plan.skill_pack_recommendations.map((item) => item.display_name_zh),
    ]);

    return {
        scenarioId: plan.scenario_id,
        scenarioNameZh: plan.scenario_name_zh,
        scenarioExplanationZh: buildScenarioExplanationZh(scenarioSignals, priorityFocus),
        scenarioSignals,
        planStatus: plan.plan_status,
        blueprintSummaryZh: plan.company_blueprint.summary_zh,
        priorityFocus,
        deployPrepBlockerReasonZh: plan.deployment_readiness.blocker_reason_zh,
        deployPrepMissingItems: plan.deployment_readiness.missing_items,
        previousPlanSummaryZh: plan.previous_plan_summary_zh,
        changeSummaryZh: plan.change_summary_zh,
        changedTemplateKeys: plan.changed_template_keys,
        changedPackIds: plan.changed_pack_ids,
        founderDisplayNameZh: plan.founder_copilot.display_name_zh,
        founderTemplateKey: plan.founder_copilot.template_key,
        recommendedTemplateKeys: [...new Set(recommendedTemplateKeys)],
        recommendedPackIds: [...new Set(recommendedPackIds)],
        previewTemplateNamesZh,
        previewPackNamesZh,
        teamNamesZh: plan.teams.map((team) => team.team_name_zh),
        openQuestions: plan.open_questions,
        canEnterDeployPrep: plan.deployment_readiness.can_enter_deploy_prep,
    };
}

export function resolveFounderMainlineAgentCreateAutofill({
    summary,
    templates,
    templateLibraryItems,
    skillPacks,
    skills,
    currentForm,
}: FounderMainlineAgentCreateAutofillInput): FounderMainlineAgentCreateAutofillResult {
    const templateKeyCandidates = summary
        ? [...new Set([summary.founderTemplateKey, ...summary.recommendedTemplateKeys].filter(Boolean))]
        : [];
    const templateLibraryByKey = new Map(
        templateLibraryItems.map((item) => [item.template_key, item] as const),
    );
    const templateByCanonicalName = new Map(
        templates.map((template) => [template.name, template] as const),
    );
    const unresolvedTemplateKeys: string[] = [];
    let resolvedTemplateKey = '';
    let resolvedTemplateId = '';
    let resolvedTemplate = null as FounderMainlineAgentCreateAutofillTemplate | null;

    for (const templateKey of templateKeyCandidates) {
        const libraryItem = templateLibraryByKey.get(templateKey);
        const matchedTemplate = libraryItem
            ? templateByCanonicalName.get(libraryItem.canonical_name) || null
            : null;
        if (libraryItem && matchedTemplate) {
            resolvedTemplateKey = templateKey;
            resolvedTemplateId = matchedTemplate.id;
            resolvedTemplate = matchedTemplate;
            break;
        }
        unresolvedTemplateKeys.push(templateKey);
    }

    const skillIdByFolderName = new Map(
        skills.map((skill) => [skill.folder_name, skill.id] as const),
    );
    const packById = new Map(
        skillPacks.map((pack) => [pack.pack_id, pack] as const),
    );
    const resolvedPackIds: string[] = [];
    const unresolvedPackIds: string[] = [];
    const resolvedSkillIds: string[] = [];

    for (const packId of summary?.recommendedPackIds || []) {
        const pack = packById.get(packId);
        if (!pack) {
            unresolvedPackIds.push(packId);
            continue;
        }
        resolvedPackIds.push(packId);
        for (const folderName of pack.included_skills || []) {
            const skillId = skillIdByFolderName.get(folderName);
            if (skillId) {
                resolvedSkillIds.push(skillId);
            }
        }
    }

    const sections = resolvedTemplate
        ? parseSoulTemplate(resolvedTemplate.soul_template, ['Personality', 'Boundaries'])
        : { personality: '', boundaries: '' };

    return {
        nextForm: {
            ...currentForm,
            template_id: resolvedTemplateId || currentForm.template_id,
            // Keep the founder's brief if it already exists so the planning context does not get overwritten.
            role_description: currentForm.role_description.trim()
                ? currentForm.role_description
                : (resolvedTemplate?.description || currentForm.role_description),
            personality: sections.personality || currentForm.personality,
            boundaries: sections.boundaries || currentForm.boundaries,
            skill_ids: [...new Set([...currentForm.skill_ids, ...resolvedSkillIds])],
        },
        resolvedTemplateId,
        resolvedTemplateKey,
        resolvedPackIds: [...new Set(resolvedPackIds)],
        resolvedSkillIds: [...new Set(resolvedSkillIds)],
        unresolvedTemplateKeys,
        unresolvedPackIds: [...new Set(unresolvedPackIds)],
    };
}

export function resolveFounderMainlineAgentCreateGuard({
    summary,
    recommendationApplied,
    isChineseUi,
}: FounderMainlineAgentCreateGuardInput): FounderMainlineAgentCreateGuardResult {
    if (!recommendationApplied || !summary || summary.canEnterDeployPrep) {
        return {
            isBlocked: false,
            message: '',
        };
    }

    const parts: string[] = [];
    if (summary.deployPrepBlockerReasonZh.trim()) {
        parts.push(summary.deployPrepBlockerReasonZh.trim());
    }
    if (summary.deployPrepMissingItems.length > 0) {
        parts.push(
            isChineseUi
                ? `仍缺：${summary.deployPrepMissingItems.join('、')}`
                : `Still missing: ${summary.deployPrepMissingItems.join(', ')}`,
        );
    }

    return {
        isBlocked: true,
        message: isChineseUi
            ? `当前 founder 推荐还不能直接创建：${parts.join('；')}`
            : `The current founder recommendation is not ready for direct creation yet: ${parts.join('; ')}`,
    };
}
