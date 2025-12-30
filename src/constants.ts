import { env } from 'cloudflare:workers';

export const BOT_TOKEN = env.ENV_BOT_TOKEN;
export const BOT_SECRET = env.ENV_BOT_SECRET; // A-Z, a-z, 0-9, _ and -
export const BOT_WEBHOOK_PATH = '/endpoint';
export const SHEETS_URL = env.ENV_SHEETS_URL;
export const AI = env.AI;
