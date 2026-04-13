import { NextRequest, NextResponse } from 'next/server';
import { parseDocument, ParseError, isSupportedFile } from '@/lib/parse-document';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { ok } = await rateLimit(ip);
  if (!ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'no_file', message: 'No file uploaded.' },
        { status: 400 }
      );
    }

    if (!isSupportedFile(file.type, file.name)) {
      return NextResponse.json(
        {
          error: 'unsupported_format',
          message: `Unsupported file type. We support PDF and TXT files.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const text = await parseDocument(buffer, file.name, file.type);

    // Generate a cache key from content hash
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text.slice(0, 10000))
    );
    const contentId = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);

    return NextResponse.json({
      transcript: text,
      contentId: `doc-${contentId}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      sourceType: 'document',
    });
  } catch (err) {
    if (err instanceof ParseError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 422 }
      );
    }
    console.error('[upload]', err);
    return NextResponse.json(
      { error: 'unknown', message: 'Failed to process file.' },
      { status: 500 }
    );
  }
}
