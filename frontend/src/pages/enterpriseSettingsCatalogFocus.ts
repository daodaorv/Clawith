export function focusTemplateCatalog<TTemplate extends { canonical_name: string }>(
    templates: TTemplate[],
    focusedCanonicalName: string | null,
): TTemplate[] {
    if (!focusedCanonicalName) {
        return templates;
    }
    return templates.filter((template) => template.canonical_name === focusedCanonicalName);
}

export function focusSkillPackCatalog<TSkillPack extends { pack_id: string }>(
    skillPacks: TSkillPack[],
    focusedPackId: string | null,
): TSkillPack[] {
    if (!focusedPackId) {
        return skillPacks;
    }
    return skillPacks.filter((skillPack) => skillPack.pack_id === focusedPackId);
}
