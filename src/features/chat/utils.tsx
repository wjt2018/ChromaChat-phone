import { AUTO_REPLY_DELAY_OPTIONS, DEFAULT_TOKEN_LIMIT, MAX_TOKEN_LIMIT, MIN_TOKEN_LIMIT, TOKEN_LIMIT_STEP } from '../../services/chatService';

export const formatTokensShort = (value: number) => {
  if (value <= 0) {
    return '0k';
  }
  const thousands = value / 1000;
  const precision = thousands >= 10 || Number.isInteger(thousands) ? 0 : 1;
  const formatted = thousands.toFixed(precision).replace(/\.0$/, '');
  return `${formatted}k`;
};

export const snapToTokenStep = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_TOKEN_LIMIT;
  }
  const clamped = Math.min(MAX_TOKEN_LIMIT, Math.max(MIN_TOKEN_LIMIT, value));
  const steps = Math.round(clamped / TOKEN_LIMIT_STEP);
  return Math.max(MIN_TOKEN_LIMIT, Math.min(MAX_TOKEN_LIMIT, steps * TOKEN_LIMIT_STEP));
};

export type AutoReplyDelayOption = (typeof AUTO_REPLY_DELAY_OPTIONS)[number];

const DEFAULT_AUTO_REPLY_DELAY = AUTO_REPLY_DELAY_OPTIONS[1];

export const normalizeAutoReplyDelayOption = (value?: number): AutoReplyDelayOption => {
  if (typeof value === 'number' && AUTO_REPLY_DELAY_OPTIONS.includes(value as AutoReplyDelayOption)) {
    return value as AutoReplyDelayOption;
  }
  return DEFAULT_AUTO_REPLY_DELAY;
};
