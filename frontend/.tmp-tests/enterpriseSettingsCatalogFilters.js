function normalizeCatalogText(value) {
    return value.trim().toLowerCase();
}
function matchesCatalogQuery(parts, query) {
    if (!query) {
        return true;
    }
    const haystack = parts.filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
}
export function filterTemplateCatalog(templates, options) {
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
export function filterSkillPackCatalog(skillPacks, options) {
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
