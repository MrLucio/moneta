import { env } from 'cloudflare:workers';
import { SheetsResponse } from '../types/sheets';
import { SHEETS_URL } from '../constants';

export async function isValidCache() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000; // 1 day in ms
    const updatedAt = await env.SHEETS_CACHE.get('updatedAt');

    return !!updatedAt && new Date(updatedAt).getTime() > oneDayAgo;
}

export async function fetchSheetsData() {
    const validCache = await isValidCache();

    if (validCache) {
        const cached = await env.SHEETS_CACHE.get(['categories', 'paymentMethods']);
        return Object.fromEntries(cached) as unknown as SheetsResponse;
    }

    const sheetRes = await fetch(SHEETS_URL);
    if (!sheetRes.ok) {
        const cached = await env.SHEETS_CACHE.get(['categories', 'paymentMethods']);
        return Object.fromEntries(cached) as unknown as SheetsResponse;
    }

    const sheetsResponse: SheetsResponse = await sheetRes.json();

    const { categories, paymentMethods } = sheetsResponse;

    await env.SHEETS_CACHE.put('categories', JSON.stringify(categories));
    await env.SHEETS_CACHE.put('paymentMethods', JSON.stringify(paymentMethods));
    await env.SHEETS_CACHE.put('updatedAt', new Date().toISOString());

    return { categories, paymentMethods };
}
