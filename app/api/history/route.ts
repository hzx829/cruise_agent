import { getChatList } from '@/lib/db/chat-store';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const endingBefore = searchParams.get('ending_before') || undefined;

  const chats = getChatList({ limit, endingBefore });
  const hasMore = chats.length === limit;

  return NextResponse.json({ chats, hasMore });
}
