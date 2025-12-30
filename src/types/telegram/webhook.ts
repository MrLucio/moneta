export interface TelegramApiResponse<T = boolean> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: any;
}

export interface SetWebhookParams {
  url: string;
  secret_token?: string;
}