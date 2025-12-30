# 💰 Moneta - Telegram Transaction Bot

A Cloudflare Worker-based Telegram bot that processes financial transactions using AI. Users can send transaction descriptions (text or audio), and the bot extracts structured data, formats it with markdown, and allows approval/refusal before posting to a Google Sheets endpoint.

## Features

-   📝 Text message processing with AI analysis
-   🎙️ Audio/voice message processing with AI analysis
-   💰 Automatic transaction parsing (amount, category, payment method, type, description)
-   ✅ Approve/ ❌ Refuse inline buttons
-   📤 Post approved transactions to your server
-   🔄 KV storage for transaction data with 1-hour expiration

## Prerequisites

-   📦 Node.js (v18 or higher)
-   📚 npm or yarn
-   🔧 Wrangler CLI (`npm install -g wrangler`)
-   ☁️ Cloudflare account with a Workers subscription
-   🤖 Telegram Bot Token (from [@BotFather](https://t.me/botfather))
-   📊 Google Apps Script endpoint URL for receiving transactions

## 🚀 Setup Instructions

### 1. 📥 Clone the Repository

```bash
git clone https://github.com/MrLucio/moneta.git
cd moneta
```

or (using **SSH**)

```bash
git clone git@github.com:MrLucio/moneta.git
cd moneta
```

### 2. 📦 Install Dependencies

```bash
npm install
```

or (using **yarn**)

```bash
yarn install
```

### 3. 🔐 Configure Environment Variables

You need to set the following environment variables in Cloudflare's **Variables and Secrets** section:

**Generating your bot secret**

The `ENV_BOT_SECRET` should be a random string containing only A-Z, a-z, 0-9, underscore (\_), and hyphen (-). Generate one:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9_-' </dev/urandom | head -c 32
```

**Obtaining your bot token**

Get your Telegram bot token from [@BotFather](https://t.me/botfather) on Telegram.

**Getting your sheets URL**

The `ENV_SHEETS_URL` should be the URL of your deployed Google Apps Script application. This is the endpoint where approved transactions will be posted.

**Setting variables in Cloudflare**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → Select your worker
3. Click **Settings** → **Variables & Secrets**
4. Click **Add Variable** for each of the following:

| Variable Name    | Value                                     | Type   |
| ---------------- | ----------------------------------------- | ------ |
| `ENV_BOT_TOKEN`  | Your Telegram bot token (from @BotFather) | Secret |
| `ENV_BOT_SECRET` | Your generated bot secret                 | Secret |
| `ENV_SHEETS_URL` | Your Google Apps Script deployment URL    | Text   |

These variables will be available to your worker at runtime via the `env` object.

### 4. ⚙️ Configure Cloudflare Bindings

#### Create KV Namespace

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Storage & databases** → **Workers KV** → **Create instance**
3. Create a namespace with name `sheets_cache`
4. Copy the **Namespace ID** that appears

#### Configure via wrangler.jsonc

Edit `wrangler.jsonc` and configure your KV namespace binding and variables. Update the following sections:

**KV Namespace Binding:**

```jsonc
"kv_namespaces": [
    {
        "binding": "SHEETS_CACHE",
        "id": "your_kv_namespace_id"
    }
],
```

Replace `your_kv_namespace_id` with the Namespace ID you copied above.

**Environment Variables:**

```jsonc
"vars": {
    "ENV_SHEETS_URL": "https://your-google-apps-script-deployment-url.com"
}
```

Replace the URL with your deployed Google Apps Script endpoint.

## Deployment

### First-time Deployment

1. Login to Cloudflare:

    ```bash
    npx wrangler login
    ```

2. Deploy the worker:

    ```bash
    npx wrangler deploy
    ```

3. Register the webhook with Telegram:

    Navigate to your Cloudflare Worker URL with the `/registerWebhook` path:

    ```
    https://your-worker-url.workers.dev/registerWebhook
    ```

    Replace `your-worker-url` with your actual Cloudflare Worker domain (you can find this in your Cloudflare dashboard under **Workers & Pages** → **Overview**).

    This will register the webhook with Telegram and start receiving updates.

### Subsequent Deployments

```bash
npx wrangler deploy
```

## API Endpoints

### POST `/endpoint`

The main webhook endpoint for Telegram updates. This is where Telegram sends message and callback query updates.

**Headers:**

-   `X-Telegram-Bot-Api-Secret-Token`: Your bot secret

### GET `/registerWebhook`

Registers the webhook with Telegram (for development).

### GET `/unRegisterWebhook`

Removes the webhook registration with Telegram.

## Transaction Flow

1. **User sends message** (text or audio)
    - Bot sends "Processing..." message immediately
2. **Processing**
    - Audio is transcribed using Whisper Large V3 Turbo
    - Text is sent to Llama 3.3 70B for analysis
3. **Display Results**

    - Formatted transaction with emoji indicators:
        - 📥 Income / 📤 Expense
        - 🏷️ Category
        - 💳 Payment Method
        - 💭 Description
    - Two buttons: ✅ Approve / ❌ Refuse

4. **Approval/Refusal**
    - **Approve**: Posts transaction JSON to `ENV_SHEETS_URL`
    - **Refuse**: Discards the transaction
    - Both remove the buttons from the message

## Transaction JSON Format

When a transaction is approved, the following JSON is posted to your server:

```json
{
    "amount": 50.99,
    "category": "Groceries",
    "paymentMethod": "Credit Card",
    "type": "Uscita",
    "description": "Weekly shopping"
}
```

-   `type`: Either "Entrata" (income) or "Uscita" (expense)

## Project Structure

```
src/
├── index.ts              # Main worker entry point
├── constants.ts          # Environment variables
├── handlers/
│   └── webhook.ts        # Webhook handling
├── utils/
│   ├── sheets.ts         # Google Sheets data fetching
│   └── telegram.ts       # Telegram API helpers
└── types/
    ├── ai.ts             # AI response types
    ├── sheets.ts         # Sheets response types
    └── telegram/         # Telegram API types
```

## Models

-   **AI Analysis**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
-   **Audio Transcription**: `@cf/openai/whisper-large-v3-turbo`

Both are available through Cloudflare Workers AI.

## License

MIT
