import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { chatCompletion, listModels } from '../../services/llmClient';
import { defaultSystemPrompt, useSettingsStore } from '../../stores/settingsStore';

const SettingsApp = () => {
  const settings = useSettingsStore();
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error'; message: string }>();
  const [isTesting, setIsTesting] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

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
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-6 backdrop-blur-xl">
      <header className="flex flex-col gap-4 px-2">
        <Link
          to="/"
          className="inline-flex w-max items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 shadow-glass transition hover:border-white/60 hover:bg-white/20"
        >
          ← 返回主屏
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
