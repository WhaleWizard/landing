import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';

interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  budget?: string;
  message?: string;
  contactMethod?: 'telegram' | 'whatsapp';
  telegramUsername?: string;
}

const DEFAULT_LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxE5dVWccxQ0Ga3MSUYeEZ8B6c-KEkbBNl3QPa-zbkyjBvFl5QnxZA2g5BIGmwe-7jNfA/exec';

function sanitizeText(value: string, max: number): string {
  return String(value || '').trim().slice(0, max);
}

function normalizeLeadPayload(payload: LeadPayload): LeadPayload {
  return {
    name: sanitizeText(payload.name || '', 100),
    email: sanitizeText(payload.email || '', 120),
    phone: sanitizeText(payload.phone || '', 60),
    budget: sanitizeText(payload.budget || '', 40),
    message: sanitizeText(payload.message || '', 4_000),
    contactMethod: payload.contactMethod === 'whatsapp' ? 'whatsapp' : 'telegram',
    telegramUsername: sanitizeText(payload.telegramUsername || '', 120),
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  const payload = (await request.json().catch(() => ({}))) as LeadPayload;
  const normalized = normalizeLeadPayload(payload);

  if (!normalized.name || !normalized.email) {
    return json(
      { success: false, error: 'name and email are required' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  try {
    const response = await fetch(DEFAULT_LEAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(normalized),
      cf: {
        cacheEverything: false,
        cacheTtl: 0,
      },
    });

    if (!response.ok) {
      return json(
        { success: false, error: `Lead endpoint failed with HTTP ${response.status}` },
        { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
      );
    }

    return json(
      { success: true },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  } catch {
    return json(
      { success: false, error: 'Lead submission failed' },
      { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};
