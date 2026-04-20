export function focusTemplateCatalog(templates, focusedCanonicalName) {
    if (!focusedCanonicalName) {
        return templates;
    }
    return templates.filter((template) => template.canonical_name === focusedCanonicalName);
}
export function focusSkillPackCatalog(skillPacks, focusedPackId) {
    if (!focusedPackId) {
        return skillPacks;
    }
    return skillPacks.filter((skillPack) => skillPack.pack_id === focusedPackId);
}
