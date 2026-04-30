import { NextResponse } from 'next/server';
import { getTopPriceDrops } from '@/lib/db/queries';
import {
  createNotification,
  getNotificationConfig,
} from '@/lib/db/notification-store';

/**
 * POST /api/cron/check-prices
 *
 * 外部 cron 触发，检查价格变动并生成通知。
 * 需要 Authorization: Bearer <CRON_SECRET> 验证。
 */
export async function POST(req: Request) {
  // 验证 cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = getNotificationConfig();
  const threshold = parseInt(config.price_drop_threshold || '10', 10);

  // 检查最大降价航线
  const drops = getTopPriceDrops({ limit: 10 });
  const significantDrops = drops.filter(
    (d) => Math.abs(d.drop_pct) >= threshold,
  );

  let notificationCount = 0;

  for (const drop of significantDrops) {
    const shipName = drop.ship_name_display || drop.ship_name || '邮轮';
    const destination = drop.destination_display || drop.destination || '目的地待确认';

    createNotification({
      type: 'price_drop',
      title: `🔥 ${shipName} 降价 ${Math.abs(drop.drop_pct).toFixed(0)}%`,
      body: `${destination} ${drop.duration_days}天 ${drop.price_currency}${drop.price}`,
      data: drop,
    });
    notificationCount++;
  }

  return NextResponse.json({
    checked: drops.length,
    notified: notificationCount,
  });
}
