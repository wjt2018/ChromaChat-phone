export const MOCK_IMAGE_PREFIX = '__mock_image__::';

export type MockImagePayload = { description: string };

export const buildMockImageContent = (description: string) =>
  `${MOCK_IMAGE_PREFIX}${JSON.stringify({ description })}`;

export const parseMockImageContent = (content: string): string | null => {
  if (!content.startsWith(MOCK_IMAGE_PREFIX)) {
    return null;
  }
  try {
    const payload = JSON.parse(content.slice(MOCK_IMAGE_PREFIX.length)) as Partial<MockImagePayload>;
    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    return description.length > 0 ? description : null;
  } catch {
    return null;
  }
};

export const MOCK_IMAGE_PROMPT_INSTRUCTION = `如果你认为用“模拟图片”能更好地表达，就只发送一行：${MOCK_IMAGE_PREFIX}{"description":"在这里用用户的语言简洁描述图片"}。不要添加额外文本或 Markdown，也不要把图片描述和普通对话混在一起。`;
