import { NextRequest, NextResponse } from 'next/server';
import {
  getUnreadNotifications,
  getAllNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/db/notification-store';

/**
 * GET /api/notifications
 *
 * Query params:
 * - unread=true  只返回未读
 * - limit=50     限制条数
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const notifications = unreadOnly
    ? getUnreadNotifications(limit)
    : getAllNotifications(limit);

  const unreadCount = getUnreadCount();

  return NextResponse.json({ notifications, unreadCount });
}

/**
 * PATCH /api/notifications
 *
 * Body: { id: string } — 标记单条已读
 * Body: { all: true }  — 全部标记已读
 */
export async function PATCH(req: Request) {
  const body = await req.json();

  if (body.all) {
    markAllNotificationsRead();
  } else if (body.id) {
    markNotificationRead(body.id);
  }

  return NextResponse.json({ success: true });
}
