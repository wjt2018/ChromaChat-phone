export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  content: string;
}

const defaultBaseUrl = 'https://api.openai.com/v1';

const normalizeBaseUrl = (url?: string) => (url || defaultBaseUrl).replace(/\/$/, '');

export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.7,
  signal
}: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      presence_penalty: 0.2
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'LLM 调用失败');
    throw new Error(errorText || `LLM request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM 响应为空。');
  }

  return { content };
}

export async function listModels({
  baseUrl,
  apiKey,
  signal
}: {
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  if (!apiKey) {
    throw new Error('请先填写 API Key。');
  }

  const endpoint = `${normalizeBaseUrl(baseUrl)}/models`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    signal
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '读取模型列表失败');
    throw new Error(errorText || `获取模型列表失败，状态码：${response.status}`);
  }

  const payload = await response.json();
  const models: string[] =
    Array.isArray(payload?.data) && payload.data.length > 0
      ? payload.data
          .map((item: { id?: string }) => item?.id)
          .filter((id: string | undefined): id is string => Boolean(id))
      : [];

  return models.sort((a, b) => a.localeCompare(b));
}
