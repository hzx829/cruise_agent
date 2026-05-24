import { getChatList } from '@/lib/db/chat-store';
import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookie, ensureRequestUser } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const auth = ensureRequestUser(req);
  const { searchParams } = req.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const endingBefore = searchParams.get('ending_before') || undefined;

  const chats = getChatList({
    ownerUserId: auth.user.id,
    limit,
    endingBefore,
  });
  const hasMore = chats.length === limit;

  const response = NextResponse.json({ chats, hasMore });
  applySessionCookie(response, auth);
  return response;
}
