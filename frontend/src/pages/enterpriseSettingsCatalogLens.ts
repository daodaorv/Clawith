export type TemplateCatalogFilter = 'all' | 'pack-linked' | 'high-autonomy' | 'validated';
export type SkillPackCatalogFilter = 'all' | 'tool-required' | 'role-linked' | 'high-risk';

export interface CatalogManagementLensSegment {
    label: string;
    tone: 'neutral' | 'active' | 'focus';
    clearable: boolean;
}

export interface CatalogManagementLens {
    summary: string;
    explanation: string;
    segments: CatalogManagementLensSegment[];
    hasCustomizations: boolean;
    hasSpotlight: boolean;
}

interface BuildCatalogManagementLensOptions {
    isChineseUi: boolean;
    query: string;
    templateFilter: TemplateCatalogFilter;
    skillPackFilter: SkillPackCatalogFilter;
    templateSpotlightLabel: string;
    skillPackSpotlightLabel: string;
}

function getTemplateFilterLabel(filter: TemplateCatalogFilter, isChineseUi: boolean): string {
    if (isChineseUi) {
        switch (filter) {
            case 'pack-linked':
                return '已关联能力包';
            case 'high-autonomy':
                return '高自治';
            case 'validated':
                return '已验证';
            default:
                return '全部模板';
        }
    }

    switch (filter) {
        case 'pack-linked':
            return 'Pack-linked';
        case 'high-autonomy':
            return 'High autonomy';
        case 'validated':
            return 'Validated';
        default:
            return 'All templates';
    }
}

function getSkillPackFilterLabel(filter: SkillPackCatalogFilter, isChineseUi: boolean): string {
    if (isChineseUi) {
        switch (filter) {
            case 'tool-required':
                return '工具依赖';
            case 'role-linked':
                return '已挂接角色';
            case 'high-risk':
                return '高风险';
            default:
                return '全部能力包';
        }
    }

    switch (filter) {
        case 'tool-required':
            return 'Tool-required';
        case 'role-linked':
            return 'Role-linked';
        case 'high-risk':
            return 'High risk';
        default:
            return 'All packs';
    }
}

export function buildCatalogManagementLens(
    options: BuildCatalogManagementLensOptions,
): CatalogManagementLens {
    const query = options.query.trim();
    const hasSpotlight = Boolean(options.templateSpotlightLabel || options.skillPackSpotlightLabel);
    const hasCustomizations = Boolean(
        query
        || options.templateFilter !== 'all'
        || options.skillPackFilter !== 'all'
        || hasSpotlight,
    );

    const segments: CatalogManagementLensSegment[] = [
        {
            label: options.isChineseUi
                ? `模板：${getTemplateFilterLabel(options.templateFilter, true)}`
                : `Templates: ${getTemplateFilterLabel(options.templateFilter, false)}`,
            tone: options.templateFilter === 'all' ? 'neutral' : 'active',
            clearable: false,
        },
        {
            label: options.isChineseUi
                ? `能力包：${getSkillPackFilterLabel(options.skillPackFilter, true)}`
                : `Packs: ${getSkillPackFilterLabel(options.skillPackFilter, false)}`,
            tone: options.skillPackFilter === 'all' ? 'neutral' : 'active',
            clearable: false,
        },
    ];

    if (query) {
        segments.push({
            label: options.isChineseUi ? `关键词：${query}` : `Keyword: ${query}`,
            tone: 'active',
            clearable: false,
        });
    }

    if (options.templateSpotlightLabel) {
        segments.push({
            label: options.isChineseUi
                ? `模板聚焦：${options.templateSpotlightLabel}`
                : `Template focus: ${options.templateSpotlightLabel}`,
            tone: 'focus',
            clearable: true,
        });
    }

    if (options.skillPackSpotlightLabel) {
        segments.push({
            label: options.isChineseUi
                ? `能力包聚焦：${options.skillPackSpotlightLabel}`
                : `Pack focus: ${options.skillPackSpotlightLabel}`,
            tone: 'focus',
            clearable: true,
        });
    }

    let explanation = '';
    if (hasSpotlight) {
        explanation = options.isChineseUi
            ? '关系聚焦会优先锁定单个模板或能力包；清除聚焦后，会回到当前关键词和筛选视角。'
            : 'Relation focus currently locks the catalog to a specific template or pack. Clear the focus to return to the current keyword and filter lens.';
    } else if (hasCustomizations) {
        explanation = options.isChineseUi
            ? '当前目录正在按管理视角与关键词缩小范围，便于快速审查模板和能力包。'
            : 'The catalog is currently narrowed by the active management lens and keyword so you can review templates and packs faster.';
    } else {
        explanation = options.isChineseUi
            ? '当前展示完整目录，可从管理视角快速切换到已验证、高风险或关系联动视角。'
            : 'The full catalog is currently visible. Use the management lens below to jump into validated, high-risk, or linked views.';
    }

    return {
        summary: segments.map((segment) => segment.label).join(' · '),
        explanation,
        segments,
        hasCustomizations,
        hasSpotlight,
    };
}
