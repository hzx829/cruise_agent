import { getChatList } from '@/lib/db/chat-store';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { chats: [], hasMore: false, authRequired: true },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const endingBefore = searchParams.get('ending_before') || undefined;

  const chats = getChatList({
    ownerUserId: user.id,
    limit,
    endingBefore,
  });
  const hasMore = chats.length === limit;

  return NextResponse.json({ chats, hasMore });
}
