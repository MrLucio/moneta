import { Update } from './types/telegram/update';
import { Message } from './types/telegram/message';
import { handleWebhook, registerWebhook, unRegisterWebhook } from './handlers/webhook';
import { AI, BOT_SECRET, BOT_WEBHOOK_PATH } from './constants';
import { Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Result } from './types/ai';
import { fetchSheetsData } from './utils/sheets';
import {
    downloadAndTranscribe,
    editMessageText,
    sendPlainText,
    formatTransactionMessage,
    getTransactionActionButtons,
} from './utils/telegram';

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === BOT_WEBHOOK_PATH) {
            return handleWebhook(request, ctx, onUpdate, env);
        } else if (url.pathname === '/registerWebhook') {
            return registerWebhook(url, BOT_WEBHOOK_PATH, BOT_SECRET);
        } else if (url.pathname === '/unRegisterWebhook') {
            return unRegisterWebhook(request);
        } else {
            return new Response('No handler for this request');
        }
    },
} satisfies ExportedHandler<Env>;

/**
 * Handle incoming Update
 * https://core.telegram.org/bots/api#update
 */
async function onUpdate(update: Update, env: any) {
    if ('message' in update) {
        await onMessage(update.message, env);
    } else if ('callback_query' in update) {
        await onCallbackQuery(update.callback_query, env);
    }
}

/**
 * Handle callback query from inline buttons
 */
async function onCallbackQuery(callbackQuery: any, env: any) {
    const callbackId = callbackQuery.id;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const messageText = callbackQuery.message.text;

    if (callbackQuery.data === 'approve_transaction') {
        // Retrieve transaction data from KV
        const txnKey = `txn:${chatId}:${messageId}`;
        const txnData = await env.SHEETS_CACHE.get(txnKey);

        if (txnData) {
            try {
                const transaction = JSON.parse(txnData);
                // POST to SHEETS_URL
                await fetch(env.ENV_SHEETS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(transaction),
                });
                // Send debug message with the JSON sent to server
                await sendPlainText(
                    chatId,
                    `*Debug: Transaction sent to server*\n\`\`\`\n${JSON.stringify(
                        transaction,
                        null,
                        2,
                    )}\n\`\`\``,
                );
            } catch (err: any) {
                console.error('Error posting transaction to sheets:', err);
            }
            // Clean up KV
            await env.SHEETS_CACHE.delete(txnKey);
        }

        const approvedText = `✅ *Transaction Approved*\n\n${messageText}`;
        await editMessageText(chatId, messageId, approvedText);
    } else if (callbackQuery.data === 'refuse_transaction') {
        // Clean up KV when refusing
        const txnKey = `txn:${chatId}:${messageId}`;
        await env.SHEETS_CACHE.delete(txnKey);

        const refusedText = `❌ *Transaction Refused*\n\n${messageText}`;
        await editMessageText(chatId, messageId, refusedText);
    }
}

/**
 * Process transaction text through AI and update message
 */
async function processTransaction(
    chatId: number,
    messageId: number,
    text: string,
    categories: string[],
    paymentMethods: string[],
    env: any,
) {
    const today = new Date().toISOString().split('T')[0];

    const prompt = `
        Sei un contabile esperto. Il tuo compito è analizzare il testo di una transazione finanziaria e convertirlo in JSON rigoroso.

        DATI UTENTE:
        - Testo: "${text}"
        - Categorie disponibili: ${JSON.stringify(categories)}
        - Metodi disponibili: ${JSON.stringify(paymentMethods)}
        - Data di oggi: ${today}

        REGOLE FONDAMENTALI (Seguile in ordine):
        1. IMPORTO: Estrai il numero. Usa il punto per i decimali. 
        2. TIPO: 
            - Se il testo contiene "+", "ricevuto", "stipendio", "rimborso", "bonifico da" -> "Entrata".
            - In TUTTI gli altri casi (acquisti, regali fatti, spese, pagamenti) -> "Uscita".
            - Esempio: "regalo per mamma" è "Uscita". "Regalo ricevuto" è "Entrata".
        3. METODO:
            - Se il testo menziona un metodo specifico presente nella lista, usa quello.
            - Se il testo menziona siti online (Amazon, eBay, Vinted, PayPal) -> usa "Carta" (o il metodo più simile a pagamento elettronico nella lista).
            - Se non specificato -> il valore di default è "Carta".
        4. CATEGORIA: Scegli la più adatta dalla lista. Se dubbio, "Generale".
        5. DESCRIZIONE: Rimuovi l'importo e la categoria dal testo originale. Tieni il resto e riassumilo in poche parole.

        OUTPUT RICHIESTO:
        Rispondi ESCLUSIVAMENTE con un oggetto JSON valido. Nessun testo prima o dopo.
        Formato: {"amount": numero, "category": "stringa", "paymentMethod": "stringa", "type": "Entrata" o "Uscita", "description": "stringa"}
    `;

    try {
        const aiResponse = await AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: text },
            ],
        });

        const jsonResponse = (aiResponse as Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Result)
            .response;
        let responseText = '';
        let parsedTransaction: any = null;

        try {
            const parsed =
                typeof jsonResponse === 'string' ? JSON.parse(jsonResponse) : jsonResponse;
            parsedTransaction = parsed;
            responseText = formatTransactionMessage(parsed);
        } catch (err) {
            responseText = JSON.stringify(jsonResponse, null, 4);
        }

        // Store transaction data in KV for later retrieval on approval
        if (parsedTransaction) {
            const txnKey = `txn:${chatId}:${messageId}`;
            await env.SHEETS_CACHE.put(txnKey, JSON.stringify(parsedTransaction), {
                expirationTtl: 3600, // 1 hour expiration
            });
        }

        return await editMessageText(
            chatId,
            messageId,
            responseText,
            getTransactionActionButtons(),
        );
    } catch (err: any) {
        console.error('Error processing transaction:', err);
        return sendPlainText(
            chatId,
            'Error processing transaction: ' + (err?.message ?? String(err)),
        );
    }
}

/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
async function onMessage(message: Message, env: any) {
    if ('text' in message) {
        // Send "processing..." message first
        const processingMsg = await sendPlainText(message.chat.id, 'Processing...');
        const processingMsgId = (processingMsg as any)?.result?.message_id;

        if (!processingMsgId) {
            return sendPlainText(message.chat.id, 'Error: Could not send processing message');
        }

        const { categories, paymentMethods } = await fetchSheetsData();

        return processTransaction(
            message.chat.id,
            processingMsgId,
            message.text,
            categories,
            paymentMethods,
            env,
        );
    } else if ('audio' in message || 'voice' in message) {
        const fileId = 'audio' in message ? message.audio.file_id : message.voice.file_id;

        // Send "processing..." message first
        const processingMsg = await sendPlainText(message.chat.id, 'Processing...');
        const processingMsgId = (processingMsg as any)?.result?.message_id;

        if (!processingMsgId) {
            return sendPlainText(message.chat.id, 'Error: Could not send processing message');
        }

        try {
            const transcription = await downloadAndTranscribe(fileId);
            const { categories, paymentMethods } = await fetchSheetsData();

            return processTransaction(
                message.chat.id,
                processingMsgId,
                transcription,
                categories,
                paymentMethods,
                env,
            );
        } catch (err: any) {
            return sendPlainText(
                message.chat.id,
                'Failed to transcribe audio: ' + (err?.message ?? String(err)),
            );
        }
    } else return sendPlainText(message.chat.id, 'Message not supported');
}
