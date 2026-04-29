import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { activatePrompt } from '@/lib/ai/prompt-store';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const prompt = activatePrompt(id);
    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to activate prompt.' },
      { status: 400 },
    );
  }
}
