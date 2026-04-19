export function findTemplateByCanonicalName(templates, canonicalName) {
    return templates.find((template) => template.canonical_name === canonicalName) ?? null;
}
export function openTemplateDetailState(current, template) {
    return {
        ...current,
        selectedTemplateDetail: template,
        selectedSkillPackDetail: null,
    };
}
export function openSkillPackDetailState(current, skillPack) {
    return {
        ...current,
        selectedTemplateDetail: null,
        selectedSkillPackDetail: skillPack,
    };
}
