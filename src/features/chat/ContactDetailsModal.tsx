import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  CSSProperties
} from 'react';

import {
  DEFAULT_TOKEN_LIMIT,
  MAX_TOKEN_LIMIT,
  MIN_TOKEN_LIMIT,
  TOKEN_LIMIT_STEP,
  AUTO_REPLY_DELAY_OPTIONS
} from '../../services/chatService';
import { Contact } from '../../services/db';
import { useSettingsStore } from '../../stores/settingsStore';
import { CONTACT_ICON_OPTIONS, ContactIconName } from '../../constants/icons';
import { ContactAvatar, UserAvatar, UserProfile } from './AvatarComponents';
import {
  AutoReplyDelayOption,
  formatTokensShort,
  normalizeAutoReplyDelayOption,
  snapToTokenStep
} from './utils';

type ContactDetailsModalProps = {
  contact: Contact;
  tokenStats?: {
    currentTokens: number;
    tokenLimit: number;
  };
  onClose: () => void;
  onSave: (updates: {
    name: string;
    prompt: string;
    avatarColor: string;
    avatarIcon?: string;
    avatarUrl: string;
    worldBook: string;
    selfName?: string;
    selfAvatarColor?: string;
    selfAvatarIcon?: string;
    selfAvatarUrl?: string;
    selfPrompt?: string;
    tokenLimit: number;
    autoReplyEnabled: boolean;
    autoReplyDelayMinutes?: number;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
};

const autoReplyOptionStyle: CSSProperties = { color: '#0f172a', backgroundColor: '#f8fafc' };

const ContactDetailsModal = ({ contact, tokenStats, onClose, onSave, onDelete }: ContactDetailsModalProps) => {
  const globalUserSettings = useSettingsStore((state) => ({
    userName: state.userName,
    userPrompt: state.userPrompt,
    userAvatarColor: state.userAvatarColor,
    userAvatarIcon: state.userAvatarIcon,
    userAvatarUrl: state.userAvatarUrl
  }));
  const [name, setName] = useState(contact.name);
  const [prompt, setPrompt] = useState(contact.prompt);
  const [avatarColor, setAvatarColor] = useState(contact.avatarColor);
  const [worldBook, setWorldBook] = useState(contact.worldBook ?? '');
  const [avatarUrl, setAvatarUrl] = useState(contact.avatarUrl ?? '');
  const [avatarIcon, setAvatarIcon] = useState<ContactIconName | ''>(
    contact.avatarIcon ? (contact.avatarIcon as ContactIconName) : ''
  );
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [selfName, setSelfName] = useState(contact.selfName ?? '');
  const [selfPrompt, setSelfPrompt] = useState(contact.selfPrompt ?? '');
  const [selfAvatarUrl, setSelfAvatarUrl] = useState(contact.selfAvatarUrl ?? '');
  const [selfAvatarIcon, setSelfAvatarIcon] = useState<ContactIconName | ''>(
    contact.selfAvatarIcon ? (contact.selfAvatarIcon as ContactIconName) : ''
  );
  const [selfAvatarColor, setSelfAvatarColor] = useState(
    (contact.selfAvatarColor ?? globalUserSettings.userAvatarColor) || '#0ea5e9'
  );
  const [isSelfAvatarColorCustom, setIsSelfAvatarColorCustom] = useState(Boolean(contact.selfAvatarColor));
  const [isSelfIconPickerOpen, setIsSelfIconPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenLimitInput, setTokenLimitInput] = useState(() =>
    snapToTokenStep(contact.tokenLimit ?? DEFAULT_TOKEN_LIMIT)
  );
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(contact.autoReplyEnabled ?? false);
  const [autoReplyDelay, setAutoReplyDelay] = useState<AutoReplyDelayOption>(() =>
    normalizeAutoReplyDelayOption(contact.autoReplyDelayMinutes)
  );

  const trimmedAvatarUrl = avatarUrl.trim();
  const resolvedAvatarIcon = trimmedAvatarUrl ? '' : (avatarIcon || contact.avatarIcon || '');
  const trimmedSelfAvatarUrl = selfAvatarUrl.trim();
  const resolvedSelfAvatarIcon = trimmedSelfAvatarUrl ? '' : (selfAvatarIcon || '');
  const globalUserAvatarUrl = globalUserSettings.userAvatarUrl?.trim() ?? '';
  const effectiveSelfAvatarColor = isSelfAvatarColorCustom
    ? selfAvatarColor
    : globalUserSettings.userAvatarColor || '#0ea5e9';
  const previewSelfProfile = useMemo<UserProfile>(() => {
    const localName = selfName.trim();
    const globalName = globalUserSettings.userName?.trim();
    const displayName = localName.length > 0 ? localName : globalName?.length ? globalName : '我';

    const previewAvatarUrl = trimmedSelfAvatarUrl || globalUserAvatarUrl || undefined;
    const localIcon = selfAvatarIcon ? (selfAvatarIcon as ContactIconName) : undefined;
    const globalIcon = globalUserSettings.userAvatarIcon || undefined;
    let previewIcon: string | undefined;

    if (trimmedSelfAvatarUrl) {
      previewIcon = undefined;
    } else if (localIcon) {
      previewIcon = localIcon;
    } else if (globalUserAvatarUrl) {
      previewIcon = undefined;
    } else if (globalIcon) {
      previewIcon = globalIcon;
    }

    return {
      name: displayName,
      avatarColor: effectiveSelfAvatarColor,
      avatarUrl: previewAvatarUrl,
      avatarIcon: previewIcon
    };
  }, [
    selfName,
    trimmedSelfAvatarUrl,
    globalUserSettings.userName,
    globalUserSettings.userAvatarIcon,
    globalUserAvatarUrl,
    selfAvatarIcon,
    effectiveSelfAvatarColor
  ]);

  const handleResetSelfSettings = useCallback(() => {
    const confirmed = window.confirm('确认使用全局设置覆盖当前对话的个人信息吗？');
    if (!confirmed) {
      return;
    }
    setSelfName('');
    setSelfPrompt('');
    setSelfAvatarUrl('');
    setSelfAvatarIcon('');
    setSelfAvatarColor(globalUserSettings.userAvatarColor || '#0ea5e9');
    setIsSelfAvatarColorCustom(false);
    setIsSelfIconPickerOpen(false);
  }, [globalUserSettings.userAvatarColor]);

  const handleClearSelfAvatar = useCallback(() => {
    const confirmed = window.confirm('确认清除自定义头像并恢复为全局设置吗？');
    if (!confirmed) {
      return;
    }
    setSelfAvatarIcon('');
    setSelfAvatarUrl('');
    setIsSelfIconPickerOpen(false);
  }, []);

  useEffect(() => {
    setTokenLimitInput(snapToTokenStep(contact.tokenLimit ?? DEFAULT_TOKEN_LIMIT));
  }, [contact.id, contact.tokenLimit]);

  useEffect(() => {
    setAutoReplyEnabled(contact.autoReplyEnabled ?? false);
    setAutoReplyDelay(normalizeAutoReplyDelayOption(contact.autoReplyDelayMinutes));
  }, [contact.autoReplyDelayMinutes, contact.autoReplyEnabled, contact.id]);

  const resolvedTokenLimit = useMemo(
    () => snapToTokenStep(tokenLimitInput),
    [tokenLimitInput]
  );
  const currentTokenUsage = tokenStats?.currentTokens ?? 0;
  const currentContextLimit = snapToTokenStep(
    tokenStats?.tokenLimit ?? contact.tokenLimit ?? DEFAULT_TOKEN_LIMIT
  );
  const isOverContextLimit = currentTokenUsage > currentContextLimit;
  const limitWillChange = resolvedTokenLimit !== currentContextLimit;
  const previewContact = {
    ...contact,
    name: name.trim() || contact.name,
    avatarColor,
    avatarIcon: resolvedAvatarIcon || undefined,
    avatarUrl: trimmedAvatarUrl || undefined,
    prompt,
    worldBook,
    autoReplyEnabled,
    autoReplyDelayMinutes: autoReplyEnabled ? autoReplyDelay : undefined
  } as Contact;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const trimmedUrl = avatarUrl.trim();
      const nextIcon = (avatarIcon || contact.avatarIcon) ?? undefined;
      const trimmedSelfUrl = selfAvatarUrl.trim();
      await onSave({
        name: name.trim() || contact.name,
        prompt: prompt.trim(),
        avatarColor,
        avatarIcon: nextIcon,
        avatarUrl: trimmedUrl,
        worldBook: worldBook.trim(),
        selfName: selfName.trim(),
        selfPrompt: selfPrompt.trim(),
        selfAvatarUrl: trimmedSelfUrl,
        selfAvatarIcon: selfAvatarIcon || undefined,
        selfAvatarColor: isSelfAvatarColorCustom ? selfAvatarColor : undefined,
        tokenLimit: resolvedTokenLimit,
        autoReplyEnabled,
        autoReplyDelayMinutes: autoReplyEnabled ? autoReplyDelay : undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后再试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`确定要删除联系人“${contact.name}”吗？此操作不可恢复`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败，请稍后再试。');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-glass backdrop-blur-2xl"
        style={{ height: '100vh', overflow: 'auto' }}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">联系人详情</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
            title="关闭"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <use xlinkHref="#icon-close" />
            </svg>
          </button>
        </header>

        <label className="block text-sm text-white/70">
          角色名称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder="角色名称"
          />
        </label>

        <label className="block text-sm text-white/70">
          角色设定
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder="描述角色的性格和背景"
          />
        </label>

        <label className="block text-sm text-white/70">
          角色头像
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsIconPickerOpen((prev) => !prev)}
              className="rounded-3xl border border-white/15 bg-white/10 p-2 transition hover:border-white/40 hover:bg-white/20"
            >
              <ContactAvatar contact={previewContact} size="h-14 w-14" iconScale="h-3/4 w-3/4" />
            </button>
            <div className="text-xs text-white/55">
              选择图标或填写图片链接，图片优先显示。
            </div>
          </div>
          {isIconPickerOpen && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
                {CONTACT_ICON_OPTIONS.map((icon) => (
                  <button
                    type="button"
                    key={icon}
                    onClick={() => {
                      setAvatarIcon(icon);
                      setAvatarUrl('');
                      setIsIconPickerOpen(false);
                    }}
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                      resolvedAvatarIcon === icon && !trimmedAvatarUrl
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
        </label>

        <label className="block text-sm text-white/70">
          角色头像图片
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/avatar.png"
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
          />
          <span className="mt-1 block text-xs text-white/50">
            如果填写图片地址，会优先使用图片作为头像。
          </span>
        </label>

        <label className="block text-sm text-white/70">
          角色头像颜色
          <input
            type="color"
            value={avatarColor}
            onChange={(event) => setAvatarColor(event.target.value)}
            className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-white/10 bg-transparent"
          />
        </label>

        <label className="block text-sm text-white/70">
          角色设定文档
          <textarea
            value={worldBook}
            onChange={(event) => setWorldBook(event.target.value)}
            rows={6}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder="记录角色的常用信息、事件和背景。"
          />
        </label>

        <label className="block text-sm text-white/70">
          对话上下文 Token 上限
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={MIN_TOKEN_LIMIT}
              max={MAX_TOKEN_LIMIT}
              step={TOKEN_LIMIT_STEP}
              value={tokenLimitInput}
              onChange={(event) => setTokenLimitInput(snapToTokenStep(Number(event.target.value)))}
              className="flex-1 accent-cyan-400"
              aria-valuemin={MIN_TOKEN_LIMIT}
              aria-valuemax={MAX_TOKEN_LIMIT}
              aria-valuenow={tokenLimitInput}
              aria-valuetext={formatTokensShort(tokenLimitInput)}
            />
            <span
              className="w-16 text-right text-sm font-semibold text-white/80"
              title={`${tokenLimitInput.toLocaleString()} tokens`}
            >
              {formatTokensShort(tokenLimitInput)}
            </span>
          </div>
          <p
            className={`mt-2 text-xs ${isOverContextLimit ? 'text-rose-200' : 'text-white/55'}`}
            title={`当前上下文 token：${currentTokenUsage.toLocaleString()} / ${currentContextLimit.toLocaleString()}`}
          >
            当前上下文 token：{formatTokensShort(currentTokenUsage)} / {formatTokensShort(currentContextLimit)}
          </p>
          {limitWillChange ? (
            <p
              className="mt-1 text-xs text-white/40"
              title={`保存后新的上限：${resolvedTokenLimit.toLocaleString()} tokens`}
            >
              保存后新的上限：{formatTokensShort(resolvedTokenLimit)}
            </p>
          ) : null}
        </label>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">我的信息（仅当前对话）</h3>
            <button
              type="button"
              onClick={handleResetSelfSettings}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
            >
              使用全局
            </button>
          </div>
          <p className="text-xs text-white/55">留空将使用“设置”页面中的全局个人信息。</p>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <UserAvatar profile={previewSelfProfile} size="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{previewSelfProfile.name}</p>
              <p className="mt-0.5 text-xs text-white/60">你的消息在对话中会以此头像展示。</p>
            </div>
          </div>

          <label className="block text-xs text-white/70 sm:text-sm">
            我的姓名
            <input
              value={selfName}
              onChange={(event) => setSelfName(event.target.value)}
              placeholder={globalUserSettings.userName ? `全局：${globalUserSettings.userName}` : '例如：小李'}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            />
          </label>

          <label className="block text-xs text-white/70 sm:text-sm">
            我的设定
            <textarea
              value={selfPrompt}
              onChange={(event) => setSelfPrompt(event.target.value)}
              rows={3}
              placeholder={
                globalUserSettings.userPrompt ? `全局：${globalUserSettings.userPrompt.slice(0, 40)}...` : '可描述你的说话风格或身份'
              }
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-white/70 sm:text-sm">自定义头像</span>
              <button
                type="button"
                onClick={() => {
                  setIsSelfIconPickerOpen((prev) => !prev);
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
              >
                选择图标
              </button>
              <button
                type="button"
                onClick={handleClearSelfAvatar}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
              >
                清除图标
              </button>
            </div>
            {isSelfIconPickerOpen && (
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
                  {CONTACT_ICON_OPTIONS.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      onClick={() => {
                        setSelfAvatarIcon(icon);
                        setSelfAvatarUrl('');
                        setIsSelfIconPickerOpen(false);
                      }}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                        resolvedSelfAvatarIcon === icon && !trimmedSelfAvatarUrl
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
            <input
              value={selfAvatarUrl}
              onChange={(event) => {
                setSelfAvatarUrl(event.target.value);
              }}
              placeholder={globalUserAvatarUrl ? `全局图片：${globalUserAvatarUrl}` : '留空以使用全局头像'}
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="color"
                value={effectiveSelfAvatarColor}
                onChange={(event) => {
                  setSelfAvatarColor(event.target.value);
                  setIsSelfAvatarColorCustom(true);
                }}
                className="h-10 w-full cursor-pointer rounded-2xl border border-white/10 bg-transparent sm:w-40"
              />
              <button
                type="button"
                onClick={() => {
                  setSelfAvatarColor(globalUserSettings.userAvatarColor || '#0ea5e9');
                  setIsSelfAvatarColorCustom(false);
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
              >
                使用全局颜色
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">自动回复</p>
              <p className="text-xs text-white/60">开启后，将在设定的时间后自动回复此联系人。</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoReplyEnabled}
              onClick={() => setAutoReplyEnabled((prev) => !prev)}
              className={`flex h-6 w-11 items-center rounded-full px-[2px] transition ${
                autoReplyEnabled ? 'bg-cyan-400/90 justify-end' : 'bg-white/30 justify-start'
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white" />
            </button>
          </div>
          {autoReplyEnabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-white/60">延迟</span>
              <div className="relative w-36">
                <select
                  value={autoReplyDelay}
                  onChange={(event) =>
                    setAutoReplyDelay(normalizeAutoReplyDelayOption(Number(event.target.value)))
                  }
                  className="w-full appearance-none rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-inner shadow-white/10 outline-none transition focus:border-cyan-200/60 focus:bg-white/20 focus:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {AUTO_REPLY_DELAY_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes} style={autoReplyOptionStyle}>
                      {minutes === 1440
                        ? '24 小时'
                        : minutes >= 60 && minutes % 60 === 0
                        ? `${minutes / 60} 小时`
                        : `${minutes} 分钟`}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/70">
                  ▼
                </div>
              </div>
              <span className="text-xs text-white/60">后触发自动回复</span>
            </div>
          ) : (
            <p className="text-xs text-white/60">关闭后，该联系人不会自动回复。</p>
          )}
        </section>

        {error ? <p className="rounded-2xl bg-red-500/20 px-4 py-2 text-xs text-red-200">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isSaving || isDeleting}
            className="flex-1 rounded-3xl bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/50"
          >
            {isSaving ? '保存中...' : '保存修改'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isSaving}
            className="flex-1 rounded-3xl border border-red-300/60 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? '删除中...' : '删除角色'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContactDetailsModal;
