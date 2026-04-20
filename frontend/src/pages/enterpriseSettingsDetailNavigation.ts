export interface EnterpriseSettingsDetailState<TTemplate, TSkillPack> {
    selectedTemplateDetail: TTemplate | null;
    selectedSkillPackDetail: TSkillPack | null;
}

export function findTemplateByCanonicalName<TTemplate extends { canonical_name: string }>(
    templates: TTemplate[],
    canonicalName: string,
): TTemplate | null {
    return templates.find((template) => template.canonical_name === canonicalName) ?? null;
}

export function openTemplateDetailState<TTemplate, TSkillPack>(
    current: EnterpriseSettingsDetailState<TTemplate, TSkillPack>,
    template: TTemplate,
): EnterpriseSettingsDetailState<TTemplate, TSkillPack> {
    return {
        ...current,
        selectedTemplateDetail: template,
        selectedSkillPackDetail: null,
    };
}

export function openSkillPackDetailState<TTemplate, TSkillPack>(
    current: EnterpriseSettingsDetailState<TTemplate, TSkillPack>,
    skillPack: TSkillPack,
): EnterpriseSettingsDetailState<TTemplate, TSkillPack> {
    return {
        ...current,
        selectedTemplateDetail: null,
        selectedSkillPackDetail: skillPack,
    };
}
