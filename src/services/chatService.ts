import { db, Message, MessageRole, Thread, Contact } from './db';
import { chatCompletion, ChatMessage } from './llmClient';
import { defaultSystemPrompt, useSettingsStore } from '../stores/settingsStore';
import { ContactIconName, getRandomContactIcon } from '../constants/icons';

const generateId = () => crypto.randomUUID();

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
  const systemPrompt = settings.systemPrompt || defaultSystemPrompt;
  const effectiveUserName =
    contact.selfName && contact.selfName.trim().length > 0
      ? contact.selfName.trim()
      : settings.userName && settings.userName.trim().length > 0
        ? settings.userName.trim()
        : '�û�';
  const effectiveUserPrompt =
    contact.selfPrompt && contact.selfPrompt.trim().length > 0
      ? contact.selfPrompt.trim()
      : settings.userPrompt && settings.userPrompt.trim().length > 0
        ? settings.userPrompt.trim()
        : '��δ�ṩ��';

  const history = await db.messages.where({ threadId }).sortBy('createdAt');
  const recentMessages = history.slice(-20);

  const payloadMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${systemPrompt}
---
��ɫ��Ϣ��
������${contact.name}
���裺${contact.prompt || '��δ�ṩ��'}
�����飺${contact.worldBook && contact.worldBook.trim().length > 0 ? contact.worldBook : '��δ�ṩ��'}

�û���Ϣ��
������${effectiveUserName}
�����飺${effectiveUserPrompt}`
    },
    ...recentMessages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  const { content } = await chatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    messages: payloadMessages
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
