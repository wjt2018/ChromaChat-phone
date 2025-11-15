export const MOCK_VOICE_PREFIX = '__mock_voice__::';

export type MockVoicePayload = {
  transcript: string;
  durationSeconds: number;
};

const clampDuration = (value: number) => Math.max(1, Math.min(120, Math.round(value)));

export const estimateVoiceDurationSeconds = (transcript: string) => {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 1;
  }
  const charCount = cleaned.replace(/\s/g, '').length;
  const wordCount = cleaned.split(/\s+/).length;
  const estimated = charCount / 6 + wordCount * 0.4;
  return clampDuration(estimated);
};

export const buildMockVoiceContent = (transcript: string) => {
  const normalized = transcript.trim();
  return `${MOCK_VOICE_PREFIX}${JSON.stringify({
    transcript: normalized,
    durationSeconds: estimateVoiceDurationSeconds(normalized)
  })}`;
};

export const parseMockVoiceContent = (content: string): MockVoicePayload | null => {
  if (!content.startsWith(MOCK_VOICE_PREFIX)) {
    return null;
  }
  try {
    const payloadRaw = content.slice(MOCK_VOICE_PREFIX.length).trim();
    const tryParse = (value: string): Partial<MockVoicePayload> | null => {
      try {
        return JSON.parse(value) as Partial<MockVoicePayload>;
      } catch {
        return null;
      }
    };
    let raw = tryParse(payloadRaw);
    if (!raw && payloadRaw.includes('\\')) {
      const cleaned = payloadRaw.replace(/\\(?=[{}\[\]":,])/g, '');
      raw = tryParse(cleaned);
    }
    if (!raw) {
      return null;
    }
    const transcript =
      typeof raw.transcript === 'string' ? raw.transcript.trim() : '';
    if (!transcript) {
      return null;
    }
    const rawDuration = typeof raw.durationSeconds === 'number' ? raw.durationSeconds : undefined;
    const durationSeconds =
      rawDuration && Number.isFinite(rawDuration)
        ? clampDuration(rawDuration)
        : estimateVoiceDurationSeconds(transcript);
    return {
      transcript,
      durationSeconds
    };
  } catch {
    return null;
  }
};

export const MOCK_VOICE_PROMPT_INSTRUCTION = `当用户要求语音或者你认为语音能更好传达情绪时，请把回复改为“语音消息”：只发送一行 ${MOCK_VOICE_PREFIX}{"transcript":"在这里写语音文本","durationSeconds":语音时长（秒，可选）}。语音文本就是用户会看到的字幕，禁止夹带其他说明或 Markdown，语音消息与普通文本消息不能混在一起。`;
