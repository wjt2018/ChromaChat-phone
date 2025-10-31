import Dexie, { Table } from 'dexie';

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Contact {
  id: string;
  name: string;
  avatarColor: string;
  avatarIcon?: string;
  avatarUrl?: string;
  prompt: string;
  worldBook?: string;
  longMemory?: string;
  selfName?: string;
  selfAvatarColor?: string;
  selfAvatarIcon?: string;
  selfAvatarUrl?: string;
  selfPrompt?: string;
  tokenLimit?: number;
  autoReplyEnabled?: boolean;
  autoReplyDelayMinutes?: number;
  createdAt: number;
}

export interface Thread {
  id: string;
  contactId: string;
  title: string;
  updatedAt: number;
}

export interface Message {
  id?: number;
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: string;
}

class ChromaDatabase extends Dexie {
  contacts!: Table<Contact, string>;
  threads!: Table<Thread, string>;
  messages!: Table<Message, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('ChromaChatPhoneDB');
    this.version(1).stores({
      contacts: '&id, name, createdAt',
      threads: '&id, contactId, updatedAt',
      messages: '++id, threadId, createdAt',
      settings: '&key'
    });
  }
}

export const db = new ChromaDatabase();

export const settingsKeys = {
  baseUrl: 'baseUrl',
  apiKey: 'apiKey',
  model: 'model',
  systemPrompt: 'systemPrompt',
  userName: 'userName',
  userAvatarColor: 'userAvatarColor',
  userAvatarIcon: 'userAvatarIcon',
  userAvatarUrl: 'userAvatarUrl',
  userPrompt: 'userPrompt',
  wallpaperUrl: 'wallpaperUrl',
  wallpaperGallery: 'wallpaperGallery'
} as const;

export type SettingsKeys = keyof typeof settingsKeys;

export const getSetting = async <T = string>(key: SettingsKeys, fallback: T): Promise<T> => {
  const record = await db.settings.get(key);
  if (!record) {
    return fallback;
  }
  try {
    return JSON.parse(record.value) as T;
  } catch {
    return (record.value as unknown as T) ?? fallback;
  }
};

export const setSetting = async <T>(key: SettingsKeys, value: T) => {
  await db.settings.put({
    key,
    value: JSON.stringify(value)
  });
};
