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
    const raw = JSON.parse(content.slice(MOCK_VOICE_PREFIX.length)) as Partial<MockVoicePayload>;
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
