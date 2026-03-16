import { deleteChat } from '@/lib/db/chat-store';
import { NextResponse } from 'next/server';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  deleteChat(id);
  return NextResponse.json({ success: true });
}
