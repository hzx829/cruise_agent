import { ToolLoopAgent, stepCountIs, type LanguageModel } from 'ai';
import { buildSystemPrompt } from './prompts';
import {
  // 🔒 价格类工具 (DB)
  searchDeals,
  getTopPriceDrops,
  getPriceHistory,
  getRegionalPrices,
  compareCruises,
  getStats,
  getBrandOverview,
  analyzePrices,
  getTrackingOverview,
  listDestinations,
  listCabinTypes,
  // 🌐 知识类工具 (Web)
  webSearch,
  cruiseEncyclopedia,
  // ✍️ 创作类工具
  generateCopywriting,
  generateChart,
} from './tools';

/**
 * 创建游速达智能邮轮顾问 Agent
 *
 * 架构：ToolLoopAgent（AI SDK v6）
 * - 模型自动决定调用哪个工具
 * - 支持多步工具链（先查价格，再搜背景，再综合回答）
 * - 最多 8 步，防止无限循环
 */
export function createCruiseAgent(model: LanguageModel) {
  return new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(),
    tools: {
      // 🔒 价格类 — 数据来自爬虫，准确可靠
      searchDeals,
      getTopPriceDrops,
      getPriceHistory,
      getRegionalPrices,
      compareCruises,
      getStats,
      getBrandOverview,
      analyzePrices,
      getTrackingOverview,
      listDestinations,
      listCabinTypes,
      // 🌐 知识类 — 数据来自互联网
      webSearch,
      cruiseEncyclopedia,
      // ✍️ 创作类
      generateCopywriting,
      generateChart,
    },
    // 允许最多 8 步：典型场景是 DB查询(1-2步) + 搜索(1步) + 综合回答(1步)
    stopWhen: stepCountIs(8),
    onStepFinish: async ({ stepNumber, toolCalls, usage }) => {
      if (process.env.NODE_ENV === 'development' && toolCalls?.length) {
        const toolNames = toolCalls.map((tc) => tc.toolName).join(', ');
        console.log(
          `[Agent Step ${stepNumber}] tools: ${toolNames} | tokens: ${usage?.totalTokens ?? '?'}`
        );
      }
    },
  });
}
