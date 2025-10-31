import { db, Message, MessageRole, Thread, Contact } from './db';
import { chatCompletion, ChatMessage } from './llmClient';
import { defaultSystemPrompt, useSettingsStore } from '../stores/settingsStore';
import { ContactIconName, getRandomContactIcon } from '../constants/icons';
import { estimateTextTokens } from './tokenEstimator';

const generateId = () => crypto.randomUUID();
type SettingsSnapshot = ReturnType<typeof useSettingsStore.getState>;
type PromptSettingsSnapshot = Pick<SettingsSnapshot, 'systemPrompt' | 'userName' | 'userPrompt' | 'model'>;

export const DEFAULT_TOKEN_LIMIT = 16000;
export const MAX_TOKEN_LIMIT = 128000;
export const TOKEN_LIMIT_STEP = 500;
export const MIN_TOKEN_LIMIT = 500;
const MESSAGE_TOKEN_OVERHEAD = 4;
const SYSTEM_TOKEN_OVERHEAD = 12;
export const AUTO_REPLY_DELAY_OPTIONS = [10, 30, 60, 120, 300, 720, 1440] as const;
type AutoReplyDelay = (typeof AUTO_REPLY_DELAY_OPTIONS)[number];

const sanitizeText = (value: string | undefined | null) => value?.trim() ?? '';

const resolveTokenLimit = (tokenLimit?: number) => {
  if (typeof tokenLimit !== 'number' || Number.isNaN(tokenLimit)) {
    return DEFAULT_TOKEN_LIMIT;
  }
  if (!Number.isFinite(tokenLimit)) {
    return DEFAULT_TOKEN_LIMIT;
  }
  const clamped = Math.min(MAX_TOKEN_LIMIT, Math.max(MIN_TOKEN_LIMIT, Math.floor(tokenLimit)));
  return clamped;
};

const buildSystemPromptContent = (contact: Contact, settings: PromptSettingsSnapshot) => {
  const baseSystemPrompt = sanitizeText(settings.systemPrompt) || defaultSystemPrompt;
  const rolePrompt = sanitizeText(contact.prompt) || '未提供';
  const worldBook = sanitizeText(contact.worldBook) || '未提供';
  const longMemory = sanitizeText(contact.longMemory);
  const effectiveUserName =
    sanitizeText(contact.selfName) ||
    sanitizeText(settings.userName) ||
    '用户';
  const effectiveUserPrompt =
    sanitizeText(contact.selfPrompt) ||
    sanitizeText(settings.userPrompt) ||
    '未提供';

  const sections = [
    baseSystemPrompt,
    '---',
    '角色信息：',
    `名称：${contact.name}`,
    `设定：${rolePrompt}`,
    `世界观：${worldBook}`
  ];

  if (longMemory) {
    sections.push('', '长期记忆（结合下方信息时优先参考）：', longMemory);
  }

  sections.push(
    '',
    '用户信息：',
    `名称：${effectiveUserName}`,
    `设定：${effectiveUserPrompt}`
  );

  return sections.join('\n');
};

export type ChatPayload = {
  payloadMessages: ChatMessage[];
  tokenCount: number;
  tokenLimit: number;
};

export const buildChatPayload = ({
  contact,
  settings,
  history,
  tokenLimit
}: {
  contact: Contact;
  settings: PromptSettingsSnapshot;
  history: Message[];
  tokenLimit?: number;
}): ChatPayload => {
  const limit = resolveTokenLimit(tokenLimit ?? contact.tokenLimit);
  const systemContent = buildSystemPromptContent(contact, settings);
  const orderedHistory = [...history];

  const systemTokens = estimateTextTokens(systemContent) + SYSTEM_TOKEN_OVERHEAD;
  let totalTokens = systemTokens;
  const selectedMessages: Message[] = [];

  for (let index = orderedHistory.length - 1; index >= 0; index -= 1) {
    const message = orderedHistory[index];
    const contentTokens = estimateTextTokens(message.content) + MESSAGE_TOKEN_OVERHEAD;
    const nextTotal = totalTokens + contentTokens;

    if (nextTotal > limit) {
      if (selectedMessages.length === 0) {
        selectedMessages.push(message);
        totalTokens = nextTotal;
      }
      break;
    }

    selectedMessages.push(message);
    totalTokens = nextTotal;
  }

  selectedMessages.reverse();

  const payloadMessages: ChatMessage[] = [
    {
      role: 'system',
      content: systemContent
    },
    ...selectedMessages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  return {
    payloadMessages,
    tokenCount: totalTokens,
    tokenLimit: limit
  };
};

export const createContact = async ({
  name,
  avatarColor,
  avatarIcon,
  avatarUrl,
  prompt,
  worldBook
}: {
  name: string;
  avatarColor: string;
  avatarIcon?: ContactIconName;
  avatarUrl?: string;
  prompt: string;
  worldBook?: string;
}) => {
  const iconName = avatarUrl ? undefined : avatarIcon ?? getRandomContactIcon();

  const contact: Contact = {
    id: generateId(),
    name,
    avatarColor,
    avatarIcon: iconName,
    avatarUrl,
    prompt,
    worldBook: worldBook ?? '',
    tokenLimit: DEFAULT_TOKEN_LIMIT,
    createdAt: Date.now()
  };

  await db.contacts.add(contact);

  const thread: Thread = {
    id: generateId(),
    contactId: contact.id,
    title: `${contact.name} 的对话`,
    updatedAt: Date.now()
  };

  await db.threads.add(thread);

  return { contact, thread };
};

export const updateContact = async (
  contactId: string,
  updates: Partial<
    Pick<
      Contact,
      | 'name'
      | 'avatarColor'
      | 'avatarIcon'
      | 'avatarUrl'
      | 'prompt'
      | 'worldBook'
      | 'selfName'
      | 'selfAvatarColor'
      | 'selfAvatarIcon'
      | 'selfAvatarUrl'
      | 'selfPrompt'
      | 'longMemory'
      | 'tokenLimit'
      | 'autoReplyEnabled'
      | 'autoReplyDelayMinutes'
    >
  >
) => {
  const nextUpdates = { ...updates };

  if (typeof nextUpdates.avatarUrl === 'string') {
    const trimmed = nextUpdates.avatarUrl.trim();
    nextUpdates.avatarUrl = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof nextUpdates.avatarIcon === 'string' && nextUpdates.avatarIcon.length === 0) {
    nextUpdates.avatarIcon = undefined;
  }

  if (typeof nextUpdates.selfAvatarUrl === 'string') {
    const trimmed = nextUpdates.selfAvatarUrl.trim();
    nextUpdates.selfAvatarUrl = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof nextUpdates.selfAvatarIcon === 'string' && nextUpdates.selfAvatarIcon.length === 0) {
    nextUpdates.selfAvatarIcon = undefined;
  }

  if (typeof nextUpdates.selfName === 'string') {
    const trimmed = nextUpdates.selfName.trim();
    nextUpdates.selfName = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof nextUpdates.selfPrompt === 'string') {
    const trimmed = nextUpdates.selfPrompt.trim();
    nextUpdates.selfPrompt = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof nextUpdates.longMemory === 'string') {
    const trimmed = nextUpdates.longMemory.trim();
    nextUpdates.longMemory = trimmed.length > 0 ? trimmed : undefined;
  }

  if ('autoReplyEnabled' in nextUpdates) {
    nextUpdates.autoReplyEnabled = Boolean(nextUpdates.autoReplyEnabled);
  }

  if ('autoReplyDelayMinutes' in nextUpdates) {
    const rawValue = Number(nextUpdates.autoReplyDelayMinutes);
    const allowed = AUTO_REPLY_DELAY_OPTIONS.includes(rawValue as AutoReplyDelay);
    nextUpdates.autoReplyDelayMinutes = allowed ? rawValue : AUTO_REPLY_DELAY_OPTIONS[1];
  }

  if (nextUpdates.autoReplyEnabled === false) {
    nextUpdates.autoReplyDelayMinutes = undefined;
  }

  if ('tokenLimit' in nextUpdates) {
    nextUpdates.tokenLimit = resolveTokenLimit(nextUpdates.tokenLimit);
  }

  await db.contacts.update(contactId, nextUpdates);

  if (updates.name) {
    await db.threads.where({ contactId }).modify((thread) => {
      thread.title = `${updates.name} 的对话`;
    });
  }
};

export const deleteContact = async (contactId: string) => {
  const threads = await db.threads.where({ contactId }).toArray();
  const threadIds = threads.map((thread) => thread.id);
  await db.transaction('rw', db.messages, db.threads, db.contacts, async () => {
    await db.messages.where('threadId').anyOf(threadIds).delete();
    await db.threads.where({ contactId }).delete();
    await db.contacts.delete(contactId);
  });
};

export const saveMessage = async (message: Message) => {
  await db.messages.add(message);
  await db.threads.update(message.threadId, { updatedAt: message.createdAt });
};

export const sendMessageToLLM = async ({ threadId }: { threadId: string }) => {
  const thread = await db.threads.get(threadId);
  if (!thread) {
    throw new Error('未找到会话。');
  }

  const contact = await db.contacts.get(thread.contactId);
  if (!contact) {
    throw new Error('未找到联系人。');
  }

  const settings = useSettingsStore.getState();
  const history = await db.messages.where({ threadId }).sortBy('createdAt');
  const payload = buildChatPayload({
    contact,
    settings: {
      systemPrompt: settings.systemPrompt,
      userName: settings.userName,
      userPrompt: settings.userPrompt,
      model: settings.model
    },
    history,
    tokenLimit: contact.tokenLimit
  });

  const { content } = await chatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    messages: payload.payloadMessages
  });

  return content;
};

export const summarizeThreadLongMemory = async ({ threadId }: { threadId: string }) => {
  const thread = await db.threads.get(threadId);
  if (!thread) {
    throw new Error('未找到会话。');
  }

  const contact = await db.contacts.get(thread.contactId);
  if (!contact) {
    throw new Error('未找到联系人。');
  }

  const settings = useSettingsStore.getState();
  if (!settings.apiKey) {
    throw new Error('请先在“设置”中填写 API Key。');
  }

  const history = await db.messages.where({ threadId }).sortBy('createdAt');
  if (history.length === 0) {
    throw new Error('暂无可总结的历史消息。');
  }

  const participantName = sanitizeText(contact.name) || '角色';
  const rolePrompt = sanitizeText(contact.prompt) || '未提供';
  const worldBook = sanitizeText(contact.worldBook) || '未提供';
  const previousSummary = sanitizeText(contact.longMemory);

  const transcript = history
    .map((message) => {
      const speaker =
        message.role === 'assistant'
          ? participantName
          : message.role === 'user'
          ? '用户'
          : '系统';
      return `${speaker}：${message.content}`;
    })
    .join('\n');

  const summaryPrompt = [
    `角色名称：${participantName}`,
    `角色设定：${rolePrompt}`,
    `世界观补充：${worldBook}`,
    previousSummary ? `已有长期记忆：${previousSummary}` : null,
    '---',
    '以下是按时间顺序排列的最近对话内容，请提取对后续角色扮演最重要的事实、关系、计划或约定。',
    '需要做到：',
    '1. 只保留重要信息，删除寒暄、重复或无关内容；',
    '2. 保持第一人称表达，突出用户与角色的共同记忆；',
    '3. 若没有关键信息，可返回“暂无新的长期记忆”。',
    '4. 每条记忆独立成段，便于阅读。',
    '对话记录：',
    transcript,
    '',
    '请在输出中直接写总结内容，禁止加入额外解释。'
  ]
    .filter(Boolean)
    .join('\n');

  const { content } = await chatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    messages: [
      {
        role: 'system',
        content:
          '你是一个对话摘要助手，负责为虚拟角色扮演整理“长期记忆”，请输出可直接保存的中文总结。'
      },
      {
        role: 'user',
        content: summaryPrompt
      }
    ],
    temperature: 0.2
  });

  const summary = content.trim();

  await db.contacts.update(contact.id, {
    longMemory: summary.length > 0 ? summary : undefined
  });

  return summary;
};

export const persistMessage = async ({
  threadId,
  role,
  content
}: {
  threadId: string;
  role: MessageRole;
  content: string;
}) => {
  await saveMessage({
    threadId,
    role,
    content,
    createdAt: Date.now()
  });
};

export const deleteMessageById = async (messageId: number) => {
  const message = await db.messages.get(messageId);
  if (!message) {
    return;
  }
  await db.transaction('rw', db.messages, db.threads, async () => {
    await db.messages.delete(messageId);
    await db.threads.update(message.threadId, { updatedAt: Date.now() });
  });
};

export const updateMessageContent = async ({
  messageId,
  content
}: {
  messageId: number;
  content: string;
}) => {
  const message = await db.messages.get(messageId);
  if (!message) {
    return;
  }
  await db.transaction('rw', db.messages, db.threads, async () => {
    await db.messages.update(messageId, { content });
    await db.threads.update(message.threadId, { updatedAt: Date.now() });
  });
};
