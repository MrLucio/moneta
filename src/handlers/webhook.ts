import { BOT_SECRET } from '../constants';
import { Update } from '../types/telegram/update';
import { SetWebhookParams, TelegramApiResponse } from '../types/telegram/webhook';
import { apiUrl } from '../utils/telegram';

/**
 * Handle requests to WEBHOOK
 * https://core.telegram.org/bots/api#update
 */
export async function handleWebhook(
    request: Request,
    ctx: any,
    onUpdate: (update: Update, env: any) => Promise<void>,
    env: any,
) {
    // Check secret
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
        return new Response('Unauthorized', { status: 403 });
    }

    // Read request body synchronously
    const update: Update = await request.json();
    // Deal with response asynchronously
    ctx.waitUntil(onUpdate(update, env));

    return new Response('Ok');
}

/**
 * Set webhook to this worker's url
 * https://core.telegram.org/bots/api#setwebhook
 */
export async function registerWebhook(requestUrl: URL, suffix: string, secret: string) {
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`;
    const params: SetWebhookParams = { url: webhookUrl, secret_token: secret };
    const response = await fetch(apiUrl('setWebhook', params));
    const r: TelegramApiResponse<boolean> = await response.json();

    return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}

/**
 * Remove webhook
 * https://core.telegram.org/bots/api#setwebhook
 */
export async function unRegisterWebhook(request: Request) {
    const response = await fetch(apiUrl('setWebhook', { url: '' }));
    const r: TelegramApiResponse<boolean> = await response.json();

    return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}
