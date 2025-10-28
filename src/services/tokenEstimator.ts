const AVERAGE_ASCII_CHARS_PER_TOKEN = 4;
const NON_ASCII_TOKEN_WEIGHT = 1;
const WHITESPACE_TOKEN_WEIGHT = 0.3;
const PUNCTUATION_TOKEN_WEIGHT = 0.2;

const countMatches = (input: string, pattern: RegExp) => {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
};

export const estimateTextTokens = (text: string): number => {
  if (!text) {
    return 0;
  }

  const normalized = text.replace(/\r\n|\r/g, '\n').trim();
  if (!normalized) {
    return 0;
  }

  const asciiOnly = normalized.replace(/[^\x00-\x7F]/g, '');
  const asciiChars = asciiOnly.length;
  const nonAsciiChars = normalized.length - asciiChars;

  const asciiTokenEstimate = asciiChars / AVERAGE_ASCII_CHARS_PER_TOKEN;
  const nonAsciiTokenEstimate = nonAsciiChars * NON_ASCII_TOKEN_WEIGHT;
  const whitespaceCount = countMatches(normalized, /\s+/g);
  const punctuationCount = countMatches(
    normalized,
    /[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F,、。．，？！｡｡!?.;:()/[\]{}"'“”‘’]/g
  );

  const combinedEstimate =
    asciiTokenEstimate +
    nonAsciiTokenEstimate +
    whitespaceCount * WHITESPACE_TOKEN_WEIGHT +
    punctuationCount * PUNCTUATION_TOKEN_WEIGHT;

  return Math.max(1, Math.ceil(combinedEstimate));
};

export const estimateMessagesTokens = ({
  systemContent,
  messages,
  messageOverhead = 4,
  systemOverhead = 12
}: {
  systemContent: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  messageOverhead?: number;
  systemOverhead?: number;
}) => {
  const normalizedMessages = messages ?? [];
  const systemTokens = estimateTextTokens(systemContent) + systemOverhead;
  let totalTokens = systemTokens;

  const messageBreakdown = normalizedMessages.map((message) => {
    const tokens = estimateTextTokens(message.content ?? '') + messageOverhead;
    totalTokens += tokens;
    return {
      role: message.role,
      tokens
    };
  });

  return {
    totalTokens,
    systemTokens,
    messageBreakdown
  };
};
