import { create } from 'zustand';

import { getSetting, setSetting, settingsKeys } from '../services/db';

const DEFAULT_SYSTEM_PROMPT = `你是一位真实、有温度的手机助理。
与用户对话时请根据“角色信息”调整语言风格，保持共情和好奇。
当信息不足时先询问澄清；当用户需要帮助时给出清晰的步骤。每轮对话生成1至7句话。`;

interface SettingsState {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userName: string;
  userAvatarColor: string;
  userAvatarIcon: string;
  userAvatarUrl: string;
  userPrompt: string;
  wallpaperUrl: string;
  wallpaperGallery: string[];
  isLoaded: boolean;
  load: () => Promise<void>;
  updateSettings: (changes: Partial<Omit<SettingsState, 'isLoaded' | 'load' | 'updateSettings'>>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const DEFAULT_WALLPAPER =
  'https://cdn.mujian.me/tuchuang/690061e703902.webp';

export const useSettingsStore = create<SettingsState>((set, get) => ({
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  userName: '我',
  userAvatarColor: '#0ea5e9',
  userAvatarIcon: '',
  userAvatarUrl: '',
  userPrompt: '',
  wallpaperUrl: DEFAULT_WALLPAPER,
  wallpaperGallery: [],
  isLoaded: false,
  load: async () => {
    const [
      baseUrl,
      apiKey,
      model,
      systemPrompt,
      userName,
      userAvatarColor,
      userAvatarIcon,
      userAvatarUrl,
      userPrompt,
      wallpaperUrl,
      wallpaperGallery
    ] = await Promise.all([
      getSetting(settingsKeys.baseUrl, ''),
      getSetting(settingsKeys.apiKey, ''),
      getSetting(settingsKeys.model, 'gpt-4o-mini'),
      getSetting(settingsKeys.systemPrompt, DEFAULT_SYSTEM_PROMPT),
      getSetting(settingsKeys.userName, '我'),
      getSetting(settingsKeys.userAvatarColor, '#0ea5e9'),
      getSetting(settingsKeys.userAvatarIcon, ''),
      getSetting(settingsKeys.userAvatarUrl, ''),
      getSetting(settingsKeys.userPrompt, ''),
      getSetting(settingsKeys.wallpaperUrl, DEFAULT_WALLPAPER),
      getSetting(settingsKeys.wallpaperGallery, [])
    ]);
    set({
      baseUrl,
      apiKey,
      model,
      systemPrompt,
      userName,
      userAvatarColor,
      userAvatarIcon,
      userAvatarUrl,
      userPrompt,
      wallpaperUrl,
      wallpaperGallery: Array.isArray(wallpaperGallery) ? wallpaperGallery : [],
      isLoaded: true
    });
  },
  updateSettings: async (changes) => {
    set((state) => ({ ...state, ...changes }));
    await Promise.all(
      Object.entries(changes).map(([key, value]) => {
        if (key in settingsKeys) {
          return setSetting(key as keyof typeof settingsKeys, value);
        }
        return Promise.resolve();
      })
    );
  },
  resetToDefaults: async () => {
    const defaults = {
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      userName: '我',
      userAvatarColor: '#0ea5e9',
      userAvatarIcon: '',
      userAvatarUrl: '',
      userPrompt: '',
      wallpaperUrl: DEFAULT_WALLPAPER,
      wallpaperGallery: []
    };

    await Promise.all(
      Object.entries(defaults).map(([key, value]) =>
        setSetting(key as keyof typeof settingsKeys, value)
      )
    );

    set((state) => ({ ...state, ...defaults }));
  }
}));

export const defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT;
