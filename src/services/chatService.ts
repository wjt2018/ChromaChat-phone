import { db, Message, MessageRole, Thread, Contact } from './db';
import { chatCompletion, ChatMessage } from './llmClient';
import { defaultSystemPrompt, useSettingsStore } from '../stores/settingsStore';

const generateId = () => crypto.randomUUID();

export const createContact = async ({
  name,
  avatarColor,
  avatarUrl,
  prompt,
  worldBook
}: {
  name: string;
  avatarColor: string;
  avatarUrl?: string;
  prompt: string;
  worldBook?: string;
}) => {
  const contact: Contact = {
    id: generateId(),
    name,
    avatarColor,
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
  updates: Partial<Pick<Contact, 'name' | 'avatarColor' | 'avatarUrl' | 'prompt' | 'worldBook'>>
) => {
  await db.contacts.update(contactId, updates);

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

export const sendMessageToLLM = async ({
  threadId,
  userMessage
}: {
  threadId: string;
  userMessage: string;
}) => {
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

  const history = await db.messages.where({ threadId }).sortBy('createdAt');
  const recentMessages = history.slice(-20);

  const payloadMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${systemPrompt}
---
角色信息：
姓名：${contact.name}
人设：${contact.prompt || '（未提供）'}
世界书：${contact.worldBook && contact.worldBook.trim().length > 0 ? contact.worldBook : '（未提供）'}`
    },
    ...recentMessages.map((message) => ({
      role: message.role,
      content: message.content
    })),
    { role: 'user', content: userMessage }
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
