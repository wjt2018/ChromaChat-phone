import { db, Message, MessageRole, Thread, Contact } from './db';
import { chatCompletion, ChatMessage } from './llmClient';
import { defaultSystemPrompt, useSettingsStore } from '../stores/settingsStore';
import { ContactIconName, getRandomContactIcon } from '../constants/icons';
import { estimateTextTokens } from './tokenEstimator';

const generateId = () => crypto.randomUUID();
type SettingsSnapshot = ReturnType<typeof useSettingsStore.getState>;
type PromptSettingsSnapshot = Pick<SettingsSnapshot, 'systemPrompt' | 'userName' | 'userPrompt' | 'model'>;

export const DEFAULT_TOKEN_LIMIT = 4000;
const MIN_TOKEN_LIMIT = 500;
const MESSAGE_TOKEN_OVERHEAD = 4;
const SYSTEM_TOKEN_OVERHEAD = 12;

const sanitizeText = (value: string | undefined | null) => value?.trim() ?? '';

const resolveTokenLimit = (tokenLimit?: number) => {
  if (typeof tokenLimit !== 'number' || Number.isNaN(tokenLimit)) {
    return DEFAULT_TOKEN_LIMIT;
  }
  return Math.max(MIN_TOKEN_LIMIT, Math.floor(tokenLimit));
};

const buildSystemPromptContent = (contact: Contact, settings: PromptSettingsSnapshot) => {
  const baseSystemPrompt = sanitizeText(settings.systemPrompt) || defaultSystemPrompt;
  const rolePrompt = sanitizeText(contact.prompt) || '未提供';
  const worldBook = sanitizeText(contact.worldBook) || '未提供';
  const effectiveUserName =
    sanitizeText(contact.selfName) ||
    sanitizeText(settings.userName) ||
    '用户';
  const effectiveUserPrompt =
    sanitizeText(contact.selfPrompt) ||
    sanitizeText(settings.userPrompt) ||
    '未提供';

  return `${baseSystemPrompt}
---
角色信息：
名称：${contact.name}
设定：${rolePrompt}
世界观：${worldBook}

用户信息：
名称：${effectiveUserName}
设定：${effectiveUserPrompt}`;
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
      | 'tokenLimit'
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
