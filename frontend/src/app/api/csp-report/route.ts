import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    const rawBody = await request.text();

    if (contentType.includes('application/json') || contentType.includes('application/csp-report')) {
      try {
        const parsed = JSON.parse(rawBody);
        console.warn('[CSP REPORT]', parsed);
      } catch {
        console.warn('[CSP REPORT RAW]', rawBody);
      }
    } else {
      console.warn('[CSP REPORT RAW]', rawBody);
    }
  } catch (error) {
    console.error('[CSP REPORT] Failed to process report', error);
  }

  return new NextResponse(null, { status: 204 });
}
