import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { chatCompletion, listModels } from '../../services/llmClient';
import { CONTACT_ICON_OPTIONS } from '../../constants/icons';
import { defaultSystemPrompt, useSettingsStore } from '../../stores/settingsStore';

const AvatarPreview = ({
  name,
  color,
  icon,
  image,
  className = 'h-16 w-16'
}: {
  name: string;
  color: string;
  icon?: string;
  image?: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().slice(0, 1) || '我';
  const backgroundColor = color || '#0ea5e9';

  useEffect(() => {
    setFailed(false);
  }, [image]);

  if (image && !failed) {
    return (
      <div className={`overflow-hidden rounded-2xl border border-white/15 ${className}`}>
        <img
          src={image}
          alt={`${name} avatar`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-white/15 ${className}`}
      style={{ backgroundColor }}
    >
      {icon ? (
        <svg aria-hidden="true" className="h-8 w-8 text-white">
          <use xlinkHref={`#${icon}`} />
        </svg>
      ) : (
        <span className="text-lg font-semibold text-white">{initial}</span>
      )}
    </div>
  );
};

const SettingsApp = () => {
  const settings = useSettingsStore();
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error'; message: string }>();
  const [isTesting, setIsTesting] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isUserIconPickerOpen, setIsUserIconPickerOpen] = useState(false);

  const trimmedUserAvatarUrl = settings.userAvatarUrl.trim();
  const resolvedUserAvatarIcon = trimmedUserAvatarUrl ? '' : settings.userAvatarIcon;
  const userAvatarColor = settings.userAvatarColor || '#0ea5e9';
  const userNamePreview = settings.userName.trim() || '我';

  useEffect(() => {
    if (!settings.isLoaded) {
      settings.load().catch((err) => {
        setTestStatus({
          type: 'error',
          message: err instanceof Error ? err.message : '无法加载本地设置。'
        });
      });
    }
  }, [settings]);

  const loadModels = useCallback(
    async (signal?: AbortSignal) => {
      if (!settings.apiKey) {
        setModelOptions([]);
        setModelError('请先填写 API Key。');
        return;
      }
      setIsModelLoading(true);
      setModelError(null);
      try {
        const models = await listModels({
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          signal
        });
        if (signal?.aborted) {
          return;
        }
        setModelOptions(models);
        if (models.length === 0) {
          setModelError('未从接口获取到可用模型。');
        } else if (!models.includes(settings.model)) {
          void settings.updateSettings({ model: models[0] });
        }
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        setModelOptions([]);
        setModelError(
          error instanceof Error ? error.message : '模型列表获取失败，请检查 API 配置。'
        );
      } finally {
        setIsModelLoading(false);
      }
    },
    [settings.apiKey, settings.baseUrl, settings.model, settings.updateSettings]
  );

  useEffect(() => {
    if (!settings.isLoaded) {
      return;
    }
    if (!settings.apiKey) {
      setModelOptions([]);
      setModelError('请先填写 API Key。');
      return;
    }
    const controller = new AbortController();
    void loadModels(controller.signal);
    return () => controller.abort();
  }, [settings.baseUrl, settings.apiKey, settings.isLoaded, loadModels]);

  const handleResetUserProfile = () => {
    void settings.updateSettings({
      userName: '我',
      userPrompt: '',
      userAvatarColor: '#0ea5e9',
      userAvatarIcon: '',
      userAvatarUrl: ''
    });
    setIsUserIconPickerOpen(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTestStatus(undefined);
    setIsTesting(true);
    try {
      const { content } = await chatCompletion({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: [
          {
            role: 'system',
            content: settings.systemPrompt
          },
          {
            role: 'user',
            content: '请简单回应：“PWA 设置已成功连接”。'
          }
        ],
        temperature: 0.3
      });
      setTestStatus({ type: 'success', message: content });
    } catch (error) {
      setTestStatus({
        type: 'error',
        message: error instanceof Error ? error.message : '测试失败，请检查网络或 API 配置。'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const selectValue =
    isModelLoading || modelOptions.length === 0 ? '' : settings.model;
  const optionStyle: CSSProperties = { color: '#0f172a', backgroundColor: '#f8fafc' };
  const placeholderStyle: CSSProperties = { color: '#1e293b', opacity: 0.7, backgroundColor: '#f8fafc' };

  return (
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-6 backdrop-blur-xl" style={{overflow: 'auto'}}>
      <header className="flex flex-col gap-4 px-2">
        <Link
          to="/"
          aria-label="返回"
          className="inline-flex w-max items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 shadow-glass transition hover:border-white/60 hover:bg-white/20"
          title='返回'
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <use xlinkHref="#icon-left-arrow" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-white">设置</h1>
          <p className="mt-2 text-sm text-white/70">
            配置你的 LLM 接入信息，支持自定义系统提示词，打造更真实的角色体验。
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-glass backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">我的信息（全局）</h2>
              <p className="text-xs text-white/60">
                这里的设置会作为默认的用户身份参与所有对话，可在联系人详情中针对单个聊天单独覆盖。
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetUserProfile}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/75 transition hover:border-white/40 hover:bg-white/20"
            >
              重置个人信息
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <AvatarPreview
                  name={userNamePreview}
                  color={userAvatarColor}
                  icon={resolvedUserAvatarIcon || undefined}
                  image={trimmedUserAvatarUrl || undefined}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUserIconPickerOpen((prev) => !prev)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
                  >
                    选择图标
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserIconPickerOpen(false);
                      void settings.updateSettings({ userAvatarIcon: '', userAvatarUrl: '' });
                    }}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
                  >
                    清除图标
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:gap-4">
                <input
                  type="color"
                  value={userAvatarColor}
                  onChange={(event) =>
                    void settings.updateSettings({ userAvatarColor: event.target.value })
                  }
                  className="h-10 w-32 cursor-pointer rounded-2xl border border-white/15 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => void settings.updateSettings({ userAvatarColor: '#0ea5e9' })}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
                >
                  恢复默认颜色
                </button>
              </div>
            </div>
            {isUserIconPickerOpen && (
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
                  {CONTACT_ICON_OPTIONS.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      onClick={() => {
                        void settings.updateSettings({ userAvatarIcon: icon, userAvatarUrl: '' });
                        setIsUserIconPickerOpen(false);
                      }}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                        resolvedUserAvatarIcon === icon && !trimmedUserAvatarUrl
                          ? 'border-cyan-300 bg-cyan-300/20 text-cyan-200'
                          : 'border-white/15 bg-white/10 text-white/80 hover:border-white/40 hover:bg-white/20'
                      }`}
                    >
                      <svg aria-hidden="true" className="h-7 w-7">
                        <use xlinkHref={`#${icon}`} />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="block text-sm text-white/70">
              姓名
              <input
                value={settings.userName}
                onChange={(event) => void settings.updateSettings({ userName: event.target.value })}
                placeholder="例如：小李"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20"
              />
            </label>
            <label className="block text-sm text-white/70">
              头像图片地址
              <input
                value={settings.userAvatarUrl}
                onChange={(event) =>
                  void settings.updateSettings({ userAvatarUrl: event.target.value })
                }
                placeholder="https://example.com/me.png"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20"
              />
              <span className="mt-1 block text-xs text-white/55">
                如果填写图片地址，将优先显示图片；留空则使用图标与颜色。
              </span>
            </label>
            <label className="block text-sm text-white/70">
              个人设定
              <textarea
                value={settings.userPrompt}
                onChange={(event) =>
                  void settings.updateSettings({ userPrompt: event.target.value })
                }
                rows={4}
                placeholder="描述你的身份、语气或希望 AI 了解的背景。"
                className="mt-1 w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20"
              />
            </label>
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-glass backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">API 配置</h2>
          <p className="mt-1 text-xs text-white/60">
            支持 OpenAI 兼容接口。请确保你的浏览器允许网络访问该地址。
          </p>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-white/70">
              Base URL
              <input
                value={settings.baseUrl}
                onChange={(event) => void settings.updateSettings({ baseUrl: event.target.value })}
                placeholder="https://api.openai.com/v1"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20"
              />
            </label>
            <label className="block text-sm text-white/70">
              API Key
              <input
                value={settings.apiKey}
                onChange={(event) => void settings.updateSettings({ apiKey: event.target.value })}
                type="password"
                placeholder="sk-..."
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20"
              />
            </label>
            <label className="block text-sm text-white/70">
              Model Name
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-2/3">
                  <select
                    value={selectValue}
                    onChange={(event) => void settings.updateSettings({ model: event.target.value })}
                    disabled={isModelLoading || modelOptions.length === 0}
                    className="w-full appearance-none rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white shadow-inner shadow-white/10 outline-none transition focus:border-cyan-200/60 focus:bg-white/20 focus:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isModelLoading ? (
                      <option value="" style={placeholderStyle}>
                        模型列表加载中...
                      </option>
                    ) : modelOptions.length === 0 ? (
                      <option value="" style={placeholderStyle}>
                        暂无可选模型
                      </option>
                    ) : (
                      modelOptions.map((modelId) => (
                        <option key={modelId} value={modelId} style={optionStyle}>
                          {modelId}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/70">
                    ▼
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadModels()}
                  disabled={isModelLoading || !settings.apiKey}
                  className="rounded-2xl border border-white/20 px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isModelLoading ? '刷新中...' : '刷新列表'}
                </button>
              </div>
              {modelError ? <p className="mt-2 text-xs text-red-200">{modelError}</p> : null}
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-glass backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">系统提示词</h2>
              <p className="text-xs text-white/60">
                调整角色扮演的基调，会被附加到每次对话的开头。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void settings.updateSettings({ systemPrompt: defaultSystemPrompt })}
              className="rounded-2xl border border-white/20 px-4 py-2 text-xs font-medium text-white/75 transition hover:bg-white/10"
            >
              恢复默认提示词
            </button>
          </div>
          <textarea
            value={settings.systemPrompt}
            onChange={(event) => void settings.updateSettings({ systemPrompt: event.target.value })}
            rows={8}
            className="mt-4 w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20"
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-glass backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">连接测试</h2>
          <p className="mt-1 text-xs text-white/60">
            提交后会发送一条简短消息，验证接口是否可用。
          </p>

          {testStatus ? (
            <div
              className={`mt-3 rounded-2xl px-4 py-3 text-xs ${
                testStatus.type === 'success'
                  ? 'bg-emerald-400/20 text-emerald-200'
                  : 'bg-red-400/20 text-red-200'
              }`}
            >
              {testStatus.message}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isTesting}
              className="rounded-3xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2 text-sm font-semibold text-slate-900 shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTesting ? '测试中...' : '测试连接'}
            </button>
            <button
              type="button"
              onClick={() => void settings.resetToDefaults()}
              className="rounded-3xl border border-white/20 px-5 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              清除密钥
            </button>
          </div>
        </section>
      </form>
    </div>
  );
};

export default SettingsApp;
