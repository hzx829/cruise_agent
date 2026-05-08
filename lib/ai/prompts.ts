import { getActiveBrandsStats } from '@/lib/db/queries';
import type { ActiveBrandInfo } from '@/lib/db/types';
import { getActivePromptTemplate } from './prompt-store';

const TIER_LABELS: Record<string, string> = {
  budget: '大众',
  standard: '标准',
  premium: '高端',
  luxury: '奢华',
};

const ALL_TIERS = ['budget', 'standard', 'premium', 'luxury'] as const;

interface PromptRuntimeContext {
  currentDate: string;
  brandCoverageContext: string;
}

function buildBrandSection(activeBrands: ActiveBrandInfo[]): string {
  const activeTiers = new Set(activeBrands.map((b) => b.tier));
  const missingTiers = ALL_TIERS.filter((t) => !activeTiers.has(t));

  const rows = activeBrands
    .map((b) => {
      const label = b.name_cn ? `${b.name_cn}/${b.name}` : b.name;
      const cabins = b.cabin_types
        ? b.cabin_types
            .split(',')
            .filter(Boolean)
            .join(', ')
        : '-';
      return `| ${label} | ${b.id} | ${b.currency} | ${TIER_LABELS[b.tier] || b.tier} | ${b.deal_count} | ${cabins} |`;
    })
    .join('\n');

  let section = `### 品牌 ID 映射（实时数据）

| 品牌名 | brand_id | 货币 | 层级 | Deal 数量 | 舱位类型 |
|--------|----------|------|------|-----------|----------|
${rows || '| 暂无 | - | - | - | 0 | - |'}`;

  if (missingTiers.length > 0) {
    const labels = missingTiers.map((t) => `${TIER_LABELS[t]}(${t})`).join('、');
    section += `\n\n当前 ${labels} 层级暂无直连价格数据。`;
    section += '\n用户查询这些层级时，仍然调用工具但不要限制 tier 参数，用全量数据中的结果回答，并附带说明当前数据覆盖范围。';

    const hasHaven = activeBrands.some(
      (b) => b.cabin_types && /haven|suite/i.test(b.cabin_types),
    );
    if (hasHaven && missingTiers.includes('luxury')) {
      section +=
        '\n同时可推荐高端房型（如 Haven 套房、Suite）的降价作为替代。';
    }
  }

  return section;
}

function buildTierSection(activeBrands: ActiveBrandInfo[]): string {
  const tierGroups = new Map<string, ActiveBrandInfo[]>();
  for (const b of activeBrands) {
    const list = tierGroups.get(b.tier) || [];
    list.push(b);
    tierGroups.set(b.tier, list);
  }

  const rows = ALL_TIERS
    .map((tier) => {
      const brands = tierGroups.get(tier);
      const brandNames = brands
        ? brands.map((b) => b.name_cn || b.name).join(', ')
        : '暂无数据';
      const hasData = brands && brands.length > 0 ? '是' : '否';
      return `| ${TIER_LABELS[tier]} | ${tier} | ${brandNames} | ${hasData} |`;
    })
    .join('\n');

  return `### 品牌层级体系

| 层级 | 英文 | 代表品牌 | 有数据 |
|------|------|----------|--------|
${rows}`;
}

function buildBrandCoverageContext(activeBrands: ActiveBrandInfo[]): string {
  return `${buildTierSection(activeBrands)}

${buildBrandSection(activeBrands)}`;
}

function buildCurrentDate(): string {
  return new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function renderPromptTemplate(
  template: string,
  context: PromptRuntimeContext,
): string {
  return template
    .replaceAll(/\{\{\s*currentDate\s*\}\}/g, context.currentDate)
    .replaceAll(
      /\{\{\s*brandCoverageContext\s*\}\}/g,
      context.brandCoverageContext,
    )
    .trim();
}

export function buildSystemPrompt(promptTemplateOverride?: string): string {
  const activeBrands = getActiveBrandsStats();
  const promptTemplate =
    promptTemplateOverride ?? getActivePromptTemplate().content;

  return renderPromptTemplate(promptTemplate, {
    currentDate: buildCurrentDate(),
    brandCoverageContext: buildBrandCoverageContext(activeBrands),
  });
}
