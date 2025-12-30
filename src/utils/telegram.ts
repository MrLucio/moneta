import { AI, BOT_TOKEN } from '../constants';

/**
 * Return url to telegram api, optionally with parameters added
 */
export function apiUrl(methodName: string, params: Record<string, any>) {
    let query = '';
    if (params) {
        query = '?' + new URLSearchParams(params).toString();
    }
    return `https://api.telegram.org/bot${BOT_TOKEN}/${methodName}${query}`;
}

/**
 * Make a request to Telegram API
 */
async function telegramApiRequest(method: string, body: Record<string, any>) {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const result: any = await response.json();
    if (!result.ok) {
        console.error(`Telegram API error (${method}):`, result);
    }
    return result;
}

/**
 * Send plain text message
 * https://core.telegram.org/bots/api#sendmessage
 */
export async function sendPlainText(chatId: number, text: string) {
    return telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
    });
}

/**
 * Edit a message text
 * https://core.telegram.org/bots/api#editmessagetext
 */
export async function editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: any,
) {
    const body: any = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
    };
    if (replyMarkup) {
        body.reply_markup = replyMarkup;
    } else {
        // Remove buttons when no replyMarkup provided
        body.reply_markup = { inline_keyboard: [] };
    }
    return telegramApiRequest('editMessageText', body);
}

/**
 * Download a file from Telegram and return its ArrayBuffer
 */
export async function fetchTelegramFileBuffer(fileId: string) {
    const fileInfoResp = await fetch(apiUrl('getFile', { file_id: fileId }));
    const fileInfo: any = await fileInfoResp.json();
    const filePath = fileInfo?.result?.file_path;
    if (!filePath) throw new Error('Telegram file_path not found');

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) throw new Error('Failed to download file from Telegram');
    return await fileResp.arrayBuffer();
}

/**
 * Create inline keyboard for transaction approval
 */
export function getTransactionActionButtons() {
    return {
        inline_keyboard: [
            [
                { text: '✅ Approve', callback_data: 'approve_transaction' },
                { text: '❌ Refuse', callback_data: 'refuse_transaction' },
            ],
        ],
    };
}

/**
 * Format a transaction response for display
 */
export function formatTransactionMessage(responseJson: any): string {
    const { amount, category, paymentMethod, type, description } = responseJson;
    const icon = type === 'Entrata' ? '📥' : '📤';
    return (
        `${icon} *${amount}€*\n` +
        `🏷️ ${category}\n` +
        `💳 ${paymentMethod}\n` +
        `💭 ${description}`
    );
}

/**
 * Download audio by Telegram file_id and run Whisper via env.AI
 */
export async function downloadAndTranscribe(fileId: string) {
    const buf = await fetchTelegramFileBuffer(fileId);

    // Convert ArrayBuffer to base64 for the Whisper large model
    function arrayBufferToBase64(buffer: ArrayBuffer) {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    const base64 = arrayBufferToBase64(buf);

    const input = {
        audio: base64,
    };

    // Use the large Whisper turbo model as requested
    const response = await AI.run('@cf/openai/whisper-large-v3-turbo', input);

    // Try to extract a readable transcription from the AI response
    let text = '';
    if (response && typeof response === 'object') {
        const r = (response as any).response ?? response;
        if (typeof r === 'string') text = r;
        else if (r && typeof r === 'object') text = r.text ?? r.transcript ?? JSON.stringify(r);
        else text = String(r);
    } else {
        text = String(response);
    }

    return text;
}
