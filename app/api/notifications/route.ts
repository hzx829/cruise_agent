import { NextRequest, NextResponse } from 'next/server';
import {
  getUnreadNotifications,
  getAllNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/db/notification-store';
import { applySessionCookie, ensureRequestUser } from '@/lib/auth/session';

/**
 * GET /api/notifications
 *
 * Query params:
 * - unread=true  只返回未读
 * - limit=50     限制条数
 */
export async function GET(req: NextRequest) {
  const auth = ensureRequestUser(req);
  const { searchParams } = req.nextUrl;
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const notifications = unreadOnly
    ? getUnreadNotifications(auth.user.id, limit)
    : getAllNotifications(auth.user.id, limit);

  const unreadCount = getUnreadCount(auth.user.id);

  const response = NextResponse.json({ notifications, unreadCount });
  applySessionCookie(response, auth);
  return response;
}

/**
 * PATCH /api/notifications
 *
 * Body: { id: string } — 标记单条已读
 * Body: { all: true }  — 全部标记已读
 */
export async function PATCH(req: Request) {
  const auth = ensureRequestUser(req);
  const body = await req.json();

  if (body.all) {
    markAllNotificationsRead(auth.user.id);
  } else if (body.id) {
    markNotificationRead(body.id, auth.user.id);
  }

  const response = NextResponse.json({ success: true });
  applySessionCookie(response, auth);
  return response;
}
