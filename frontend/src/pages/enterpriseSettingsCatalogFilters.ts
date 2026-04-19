interface TemplateFilterable {
    template_key: string;
    canonical_name: string;
    display_name_zh: string;
    role_level: string;
    role_type: string;
    primary_goal: string;
    default_autonomy_level: string;
    default_boundaries: string[];
    recommended_skill_packs: string[];
    validation_status: string;
}

interface SkillPackFilterable {
    pack_id: string;
    display_name_zh: string;
    display_name_en: string;
    business_goal: string;
    recommended_roles: string[];
    included_skills: string[];
    required_tools: string[];
    required_integrations: string[];
    risk_level: string;
    status: string;
}

interface TemplateCatalogFilterOptions {
    query: string;
    filter: 'all' | 'pack-linked' | 'high-autonomy' | 'validated';
    packLabelById: Record<string, string>;
}

interface SkillPackCatalogFilterOptions {
    query: string;
    filter: 'all' | 'tool-required' | 'role-linked' | 'high-risk';
    templateLabelByCanonical: Record<string, string>;
    skillLabelByFolder: Record<string, string>;
}

function normalizeCatalogText(value: string): string {
    return value.trim().toLowerCase();
}

function matchesCatalogQuery(parts: Array<string | undefined>, query: string): boolean {
    if (!query) {
        return true;
    }
    const haystack = parts.filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
}

export function filterTemplateCatalog<TTemplate extends TemplateFilterable>(
    templates: TTemplate[],
    options: TemplateCatalogFilterOptions,
): TTemplate[] {
    const query = normalizeCatalogText(options.query);
    return templates.filter((template) => {
        const matchesFilter = options.filter === 'all'
            || (options.filter === 'pack-linked' && template.recommended_skill_packs.length > 0)
            || (options.filter === 'high-autonomy' && normalizeCatalogText(template.default_autonomy_level) === 'high')
            || (options.filter === 'validated' && normalizeCatalogText(template.validation_status) === 'validated');

        if (!matchesFilter) {
            return false;
        }

        return matchesCatalogQuery([
            template.template_key,
            template.canonical_name,
            template.display_name_zh,
            template.role_level,
            template.role_type,
            template.primary_goal,
            template.default_autonomy_level,
            ...template.default_boundaries,
            ...template.recommended_skill_packs.map((packId) => options.packLabelById[packId] || packId),
        ], query);
    });
}

export function filterSkillPackCatalog<TSkillPack extends SkillPackFilterable>(
    skillPacks: TSkillPack[],
    options: SkillPackCatalogFilterOptions,
): TSkillPack[] {
    const query = normalizeCatalogText(options.query);
    return skillPacks.filter((skillPack) => {
        const matchesFilter = options.filter === 'all'
            || (options.filter === 'tool-required' && (skillPack.required_tools.length > 0 || skillPack.required_integrations.length > 0))
            || (options.filter === 'role-linked' && skillPack.recommended_roles.length > 0)
            || (options.filter === 'high-risk' && normalizeCatalogText(skillPack.risk_level) === 'high');

        if (!matchesFilter) {
            return false;
        }

        return matchesCatalogQuery([
            skillPack.pack_id,
            skillPack.display_name_zh,
            skillPack.display_name_en,
            skillPack.business_goal,
            skillPack.risk_level,
            skillPack.status,
            ...skillPack.recommended_roles.map((role) => options.templateLabelByCanonical[role] || role),
            ...skillPack.included_skills.map((skill) => options.skillLabelByFolder[skill] || skill),
            ...skillPack.required_tools,
            ...skillPack.required_integrations,
        ], query);
    });
}
