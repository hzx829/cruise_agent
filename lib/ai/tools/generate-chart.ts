import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const generateChart = tool({
  description:
    '生成图表数据，前端会自动渲染为可视化图表。支持品牌对比、价格分布、目的地概览、天数-价格散点图。',
  inputSchema: z.object({
    chartType: z
      .enum([
        'brand_comparison',
        'price_distribution',
        'destination_overview',
        'duration_price',
      ])
      .describe('图表类型'),
    brand: z.string().optional().describe('按品牌筛选'),
    destination: z.string().optional().describe('按目的地筛选'),
  }),
  execute: async (params) => {
    switch (params.chartType) {
      case 'brand_comparison':
        return {
          chartType: 'bar' as const,
          title: '各品牌价格对比',
          data: queries.getBrandPriceComparison(),
        };
      case 'price_distribution':
        return {
          chartType: 'bar' as const,
          title: '价格分布',
          data: queries.getPriceDistribution({
            brand: params.brand,
            destination: params.destination,
          }),
        };
      case 'destination_overview':
        return {
          chartType: 'bar' as const,
          title: '热门目的地',
          data: queries.getDestinations().slice(0, 15),
        };
      case 'duration_price':
        return {
          chartType: 'scatter' as const,
          title: '航行天数 vs 价格',
          data: queries.getDurationPriceData({
            brand: params.brand,
            destination: params.destination,
          }),
        };
    }
  },
});
