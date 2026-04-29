import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { buildSystemPrompt } from '@/lib/ai/prompts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const prompt = buildSystemPrompt(String(body.content ?? ''));
    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview prompt.' },
      { status: 400 },
    );
  }
}
