import { NextRequest, NextResponse } from 'next/server';
import {
  getUnreadNotifications,
  getAllNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/db/notification-store';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';

/**
 * GET /api/notifications
 *
 * Query params:
 * - unread=true  只返回未读
 * - limit=50     限制条数
 */
export async function GET(req: NextRequest) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { notifications: [], unreadCount: 0, authRequired: true },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const notifications = unreadOnly
    ? getUnreadNotifications(user.id, limit)
    : getAllNotifications(user.id, limit);

  const unreadCount = getUnreadCount(user.id);

  return NextResponse.json({ notifications, unreadCount });
}

/**
 * PATCH /api/notifications
 *
 * Body: { id: string } — 标记单条已读
 * Body: { all: true }  — 全部标记已读
 */
export async function PATCH(req: Request) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Login required', authRequired: true },
      { status: 401 },
    );
  }

  const body = await req.json();

  if (body.all) {
    markAllNotificationsRead(user.id);
  } else if (body.id) {
    markNotificationRead(body.id, user.id);
  }

  return NextResponse.json({ success: true });
}
