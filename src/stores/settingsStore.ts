import { create } from 'zustand';

import { getSetting, setSetting, settingsKeys } from '../services/db';

const DEFAULT_SYSTEM_PROMPT = `你是一位真实、有温度的手机助理。
与用户对话时请根据“角色信息”调整语言风格，保持共情和好奇。
当信息不足时先询问澄清；当用户需要帮助时给出清晰的步骤。`;

interface SettingsState {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  isLoaded: boolean;
  load: () => Promise<void>;
  updateSettings: (changes: Partial<Omit<SettingsState, 'isLoaded' | 'load' | 'updateSettings'>>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  isLoaded: false,
  load: async () => {
    const [baseUrl, apiKey, model, systemPrompt] = await Promise.all([
      getSetting(settingsKeys.baseUrl, ''),
      getSetting(settingsKeys.apiKey, ''),
      getSetting(settingsKeys.model, 'gpt-4o-mini'),
      getSetting(settingsKeys.systemPrompt, DEFAULT_SYSTEM_PROMPT)
    ]);
    set({
      baseUrl,
      apiKey,
      model,
      systemPrompt,
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
      systemPrompt: DEFAULT_SYSTEM_PROMPT
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
