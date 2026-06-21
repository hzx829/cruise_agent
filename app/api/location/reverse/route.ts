import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';

const REVERSE_GEOCODE_TIMEOUT_MS = 2_000;

function readCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function reverseGeocode(latitude: number, longitude: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);

  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('localityLanguage', 'zh');

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;
    return {
      city: readString(data, 'city') || readString(data, 'locality'),
      region: readString(data, 'principalSubdivision'),
      country: readString(data, 'countryName'),
      countryCode: readString(data, 'countryCode'),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      {
        error: 'Login required',
        authRequired: true,
        loginUrl: '/login?next=/chat',
      },
      { status: 401 },
    );
  }

  const body = await req.json();
  const latitude = readCoordinate(body.latitude);
  const longitude = readCoordinate(body.longitude);

  if (
    latitude == null ||
    longitude == null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  return NextResponse.json({
    location: await reverseGeocode(latitude, longitude),
  });
}
