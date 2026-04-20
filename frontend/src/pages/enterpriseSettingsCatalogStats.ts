interface TemplateStatsInput {
    recommended_skill_packs: string[];
    default_autonomy_level: string;
    validation_status: string;
}

interface SkillPackStatsInput {
    recommended_roles: string[];
    required_tools: string[];
    required_integrations: string[];
    risk_level: string;
}

function normalizeCatalogStatValue(value: string): string {
    return value.trim().toLowerCase();
}

export function buildTemplateCatalogStats<TTemplate extends TemplateStatsInput>(templates: TTemplate[]) {
    return {
        all: templates.length,
        validated: templates.filter((template) => normalizeCatalogStatValue(template.validation_status) === 'validated').length,
        highAutonomy: templates.filter((template) => normalizeCatalogStatValue(template.default_autonomy_level) === 'high').length,
        packLinked: templates.filter((template) => template.recommended_skill_packs.length > 0).length,
    };
}

export function buildSkillPackCatalogStats<TSkillPack extends SkillPackStatsInput>(skillPacks: TSkillPack[]) {
    return {
        all: skillPacks.length,
        highRisk: skillPacks.filter((skillPack) => normalizeCatalogStatValue(skillPack.risk_level) === 'high').length,
        roleLinked: skillPacks.filter((skillPack) => skillPack.recommended_roles.length > 0).length,
        toolRequired: skillPacks.filter((skillPack) => skillPack.required_tools.length > 0 || skillPack.required_integrations.length > 0).length,
    };
}
