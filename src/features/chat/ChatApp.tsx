import { FormEvent, SVGProps, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { db, Contact, Message } from '../../services/db';
import {
  createContact,
  deleteContact,
  persistMessage,
  sendMessageToLLM,
  updateContact
} from '../../services/chatService';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  CONTACT_ICON_OPTIONS,
  ContactIconName,
  getRandomContactIcon
} from '../../constants/icons';

const randomColor = () => {
  const palette = ['#38bdf8', '#f472b6', '#34d399', '#f59e0b', '#a855f7', '#ef4444', '#fb7185'];
  return palette[Math.floor(Math.random() * palette.length)];
};

const ContactAvatar = ({
  contact,
  size = 'h-10 w-10',
  rounded = 'rounded-2xl',
  iconScale = 'h-2/3 w-2/3',
  className = ''
}: {
  contact: Contact;
  size?: string;
  rounded?: string;
  iconScale?: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const initial = contact.name.slice(0, 1);
  const backgroundColor = contact.avatarColor || '#1f2937';

  if (contact.avatarUrl && !failed) {
    return (
      <div className={`overflow-hidden ${rounded} ${size} ${className}`}>
        <img
          src={contact.avatarUrl}
          alt={`${contact.name} avatar`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center ${rounded} ${size} ${className}`}
      style={{ backgroundColor }}
    >
      {contact.avatarIcon && !failed ? (
        <svg aria-hidden="true" className={iconScale}>
          <use xlinkHref={`#${contact.avatarIcon}`} />
        </svg>
      ) : (
        <span className="text-base font-semibold uppercase text-white sm:text-lg">{initial}</span>
      )}
    </div>
  );
};

const UserAvatar = ({
  profile,
  size = 'h-10 w-10',
  className = ''
}: {
  profile: UserProfile;
  size?: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const avatarUrl = profile.avatarUrl?.trim();
  const avatarIcon = avatarUrl ? undefined : profile.avatarIcon;
  const initial = profile.name.trim().slice(0, 1) || '我';
  const backgroundColor = profile.avatarColor || '#0ea5e9';

  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !failed) {
    return (
      <div className={`min-w-[36px] overflow-hidden rounded-2xl ${size} ${className}`}>
        <img
          src={avatarUrl}
          alt={`${profile.name} avatar`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-[36px] items-center justify-center rounded-2xl text-sm font-semibold text-white shadow-inner shadow-black/20 ${size} ${className}`}
      style={{ backgroundColor }}
    >
      {avatarIcon ? (
        <svg aria-hidden="true" className="h-5 w-5">
          <use xlinkHref={`#${avatarIcon}`} />
        </svg>
      ) : (
        initial
      )}
    </div>
  );
};

const AssistantAvatar = ({
  contact,
  size = 'h-10 w-10',
  className = ''
}: {
  contact?: Contact;
  size?: string;
  className?: string;
}) => {
  if (contact) {
    return (
      <ContactAvatar
        contact={contact}
        size={size}
        className={`min-w-[36px] ${className}`.trim()}
      />
    );
  }

  return (
    <div
      className={`flex min-w-[36px] items-center justify-center rounded-2xl bg-white/20 text-sm font-semibold uppercase text-white/80 shadow-inner shadow-white/10 ${size} ${className}`}
    >
      AI
    </div>
  );
};

const splitAssistantResponse = (content: string): string[] => {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const sentenceRegex = /[^。！？!?；;]+[。！？!?；;]?/g;
  const sentences: string[] = [];
  const paragraphs = normalized.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);

  paragraphs.forEach((paragraph) => {
    const matches = paragraph.match(sentenceRegex);
    if (matches) {
      matches.forEach((match) => {
        const trimmed = match.trim();
        if (trimmed.length > 0) {
          sentences.push(trimmed);
        }
      });
    } else if (paragraph.length > 0) {
      sentences.push(paragraph);
    }
  });

  return sentences;
};

const SettingsIcon = ({ className = 'h-5 w-5', ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.89 3.31.876 2.42 2.42a1.724 1.724 0 0 0 1.065 2.572c1.757.426 1.757 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.89 1.543-.876 3.31-2.42 2.42a1.724 1.724 0 0 0-2.572 1.065c-.426 1.757-2.924 1.757-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.89-3.31-.876-2.42-2.42a1.724 1.724 0 0 0-1.065-2.572c-1.757-.426-1.757-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.89-1.543.876-3.31 2.42-2.42a1.724 1.724 0 0 0 2.572-1.065z" />
    <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
  </svg>
);

type ContactSidebarProps = {
  contacts: Contact[];
  activeContactId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

type UserProfile = {
  name: string;
  avatarColor: string;
  avatarIcon?: string;
  avatarUrl?: string;
};

const ContactSidebar = ({ contacts, activeContactId, onSelect, onCreate }: ContactSidebarProps) => (
  <aside className="hidden h-full w-80 flex-none flex-col gap-4 border-r border-white/10 bg-white/5 p-6 shadow-inner shadow-black/10 backdrop-blur-xl sm:flex lg:w-96">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-white/80">联系人</h2>
      <button
        onClick={onCreate}
        className="rounded-full border border-dashed border-white/30 px-3 py-1 text-xs text-white/70 transition hover:border-white/60 hover:bg-white/20"
      >
        + 新建
      </button>
    </div>
    <div className="flex-1 space-y-3 overflow-y-auto pb-4">
      {contacts.map((contact) => {
        const isActive = contact.id === activeContactId;
        return (
          <button
            key={contact.id}
            onClick={() => onSelect(contact.id)}
            className={`group flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left shadow-lg transition ${
              isActive ? 'bg-white/30 text-slate-900' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            <ContactAvatar contact={contact} />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{contact.name}</span>
              <span className="text-xs text-white/60 line-clamp-1">
                {contact.prompt || '未设置人设'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  </aside>
);

type ContactListScreenProps = {
  contacts: Contact[];
  onSelect: (id: string) => void;
  onCreate: () => void;
};

const ContactListScreen = ({ contacts, onSelect, onCreate }: ContactListScreenProps) => (
  <div className="flex min-h-screen flex-col bg-gradient-to-br from-white/10 via-white/5 to-white/10">
    <header className="flex items-center justify-between border-b border-white/10 bg-white/10 px-5 py-4">
      <Link
        to="/"
        aria-label="返回主屏"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
      >
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <use xlinkHref="#icon-left-arrow" />
        </svg>
        <span className="sr-only">返回主屏</span>
      </Link>
      <button
        onClick={onCreate}
        className="rounded-full border border-dashed border-white/30 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/60 hover:bg-white/20"
      >
        + 新建角色
      </button>
    </header>

    <section className="flex-1 space-y-3 overflow-y-auto px-4 py-6 sm:px-6">
      {contacts.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center text-sm text-white/70 shadow-glass backdrop-blur-xl">
          还没有联系人，点击右上角的「+ 新建角色」创建一个吧。
        </div>
      ) : (
        contacts.map((contact) => (
          <button
            key={contact.id}
            onClick={() => onSelect(contact.id)}
            className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/10 px-4 py-4 text-left shadow-glass backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20"
            style={{width: '100%'}}          
          >
            <ContactAvatar contact={contact} size="h-12 w-12" iconScale="h-3/4 w-3/4" />
            <div className="flex flex-1 flex-col">
              <span className="text-base font-semibold text-white">{contact.name}</span>
              <p className="mt-1 text-xs text-white/60 line-clamp-2">
                {contact.prompt || '未设置人设'}
              </p>
            </div>
          </button>
        ))
      )}
    </section>
  </div>
);

type ContactDetailsModalProps = {
  contact: Contact;
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
  }) => Promise<void>;
  onDelete: () => Promise<void>;
};

const ContactDetailsModal = ({ contact, onClose, onSave, onDelete }: ContactDetailsModalProps) => {
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
  const [avatarIcon, setAvatarIcon] = useState<ContactIconName | ''>(contact.avatarIcon ?? '');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [selfName, setSelfName] = useState(contact.selfName ?? '');
  const [selfPrompt, setSelfPrompt] = useState(contact.selfPrompt ?? '');
  const [selfAvatarUrl, setSelfAvatarUrl] = useState(contact.selfAvatarUrl ?? '');
  const [selfAvatarIcon, setSelfAvatarIcon] = useState<ContactIconName | ''>(contact.selfAvatarIcon ?? '');
  const [selfAvatarColor, setSelfAvatarColor] = useState(
    (contact.selfAvatarColor ?? globalUserSettings.userAvatarColor) || '#0ea5e9'
  );
  const [isSelfAvatarColorCustom, setIsSelfAvatarColorCustom] = useState(Boolean(contact.selfAvatarColor));
  const [isSelfIconPickerOpen, setIsSelfIconPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedAvatarUrl = avatarUrl.trim();
  const resolvedAvatarIcon = trimmedAvatarUrl ? '' : (avatarIcon || contact.avatarIcon || '');
  const trimmedSelfAvatarUrl = selfAvatarUrl.trim();
  const resolvedSelfAvatarIcon = trimmedSelfAvatarUrl ? '' : (selfAvatarIcon || '');
  const globalUserAvatarUrl = globalUserSettings.userAvatarUrl?.trim() ?? '';
  const effectiveSelfAvatarColor = isSelfAvatarColorCustom
    ? selfAvatarColor
    : globalUserSettings.userAvatarColor || '#0ea5e9';
  const handleResetSelfSettings = () => {
    setSelfName('');
    setSelfPrompt('');
    setSelfAvatarUrl('');
    setSelfAvatarIcon('');
    setSelfAvatarColor(globalUserSettings.userAvatarColor || '#0ea5e9');
    setIsSelfAvatarColorCustom(false);
  };
  const previewContact = {
    ...contact,
    name: name.trim() || contact.name,
    avatarColor,
    avatarIcon: resolvedAvatarIcon || undefined,
    avatarUrl: trimmedAvatarUrl || undefined,
    prompt,
    worldBook
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
        selfAvatarColor: isSelfAvatarColorCustom ? selfAvatarColor : undefined
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
        style={{height: '100vh', overflow: 'auto'}}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">联系人详情</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
          >
            关闭
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

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
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
              placeholder={globalUserSettings.userPrompt ? `全局：${globalUserSettings.userPrompt.slice(0, 40)}...` : '可描述你的说话风格或身份'}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-white/70 sm:text-sm">自定义头像</span>
              <button
                type="button"
                onClick={() => setIsSelfIconPickerOpen((prev) => !prev)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/20"
              >
                选择图标
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelfAvatarIcon('');
                  setSelfAvatarUrl('');
                }}
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
              onChange={(event) => setSelfAvatarUrl(event.target.value)}
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

const NewContactForm = ({
  onSubmit,
  onClose
}: {
  onSubmit: (values: {
    name: string;
    prompt: string;
    avatarColor: string;
    avatarIcon: ContactIconName;
    avatarUrl?: string;
  }) => Promise<void>;
  onClose: () => void;
}) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avatarColor, setAvatarColor] = useState(randomColor());
  const [avatarIcon, setAvatarIcon] = useState<ContactIconName>(getRandomContactIcon());
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedAvatarUrl = avatarUrl.trim();
  const previewContact = {
    id: 'preview',
    name: name || '新角色',
    avatarColor,
    avatarIcon,
    avatarUrl: trimmedAvatarUrl || undefined,
    prompt: '',
    worldBook: '',
    createdAt: Date.now()
  } as Contact;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('请填写角色姓名');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        prompt: prompt.trim(),
        avatarColor,
        avatarIcon,
        avatarUrl: avatarUrl.trim() || undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建联系人失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-glass backdrop-blur-2xl"
      >
        <h2 className="text-lg font-semibold text-white">创建新的 AI 角色</h2>
        <label className="block text-sm text-white/70">
          角色姓名
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder="例如：阿黎"
          />
        </label>
        <label className="block text-sm text-white/70">
          人设描述
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder="介绍角色的性格、说话方式、背景故事等"
          />
        </label>
        <label className="block text-sm text-white/70">
          当前头像
          <div className="mt-2 flex items-center gap-3">
            <ContactAvatar contact={previewContact} size="h-12 w-12" iconScale="h-3/4 w-3/4" />
            <button
              type="button"
              onClick={() => {
                setAvatarIcon(getRandomContactIcon());
                setAvatarUrl('');
              }}
              className="rounded-2xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:border-white/40 hover:bg-white/15"
            >
              换一个图标
            </button>
          </div>
          <p className="mt-1 text-xs text-white/55">
            若填写下方的图片链接，将使用该图片覆盖默认图标。
          </p>
        </label>
        <label className="block text-sm text-white/70">
          头像颜色
          <input
            type="color"
            value={avatarColor}
            onChange={(event) => setAvatarColor(event.target.value)}
            className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-white/10 bg-transparent"
          />
        </label>
        <label className="block text-sm text-white/70">
          头像图片链接（可选）
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/avatar.png"
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-2xl bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/50"
          >
            {isSubmitting ? '创建中...' : '创建角色'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
};

const MessageBubble = ({
  message,
  contact,
  userProfile
}: {
  message: Message;
  contact?: Contact;
  userProfile: UserProfile;
}) => {
  const isSelf = message.role === 'user';

  const bubble = (
    <div
      className={`max-w-xs rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-lg sm:max-w-sm ${
        isSelf
          ? 'bg-cyan-400/85 text-slate-900 shadow-cyan-500/40 backdrop-blur-md'
          : 'bg-white/15 text-white shadow-white/10 backdrop-blur-md'
      }`}
    >
      {message.content}
    </div>
  );

  const avatar = isSelf ? (
    <UserAvatar profile={userProfile} size="h-9 w-9 sm:h-10 sm:w-10" />
  ) : (
    <AssistantAvatar contact={contact} size="h-9 w-9 sm:h-10 sm:w-10" />
  );

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className="flex items-end gap-2 sm:gap-3">
        {isSelf ? (
          <>
            {bubble}
            {avatar}
          </>
        ) : (
          <>
            {avatar}
            {bubble}
          </>
        )}
      </div>
    </div>
  );
};

const ChatApp = () => {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const settings = useSettingsStore();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settings.isLoaded) {
      settings.load().catch(() => {
        setError('加载设置失败，请检查浏览器权限。');
      });
    }
  }, [settings]);

  const contacts = useLiveQuery(() => db.contacts.orderBy('createdAt').toArray(), []);
  const threads = useLiveQuery(() => db.threads.orderBy('updatedAt').reverse().toArray(), []);

  useEffect(() => {
    if (!contactId || !contacts) {
      return;
    }
    const exists = contacts.some((contact) => contact.id === contactId);
    if (!exists) {
      navigate('/apps/chat', { replace: true });
    }
  }, [contactId, contacts, navigate]);

  const activeThread = useMemo(() => {
    if (!threads || !contactId) {
      return undefined;
    }
    return threads.find((thread) => thread.contactId === contactId);
  }, [threads, contactId]);

  const messages = useLiveQuery(
    () =>
      contactId && activeThread
        ? db.messages.where({ threadId: activeThread.id }).sortBy('createdAt')
        : Promise.resolve([]),
    [activeThread?.id, contactId]
  );

  const activeContact = contacts?.find((contact) => contact.id === contactId);

  useEffect(() => {
    if (!messages || messages.length === 0) {
      return;
    }
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }, [activeThread?.id, messages?.length]);

  const pendingUserMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      return [];
    }

    const stack: string[] = [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant') {
        break;
      }
      if (message.role === 'user') {
        stack.unshift(message.content);
      }
    }

    return stack;
  }, [messages]);

  const userProfile = useMemo<UserProfile>(() => {
    const globalName = settings.userName.trim().length > 0 ? settings.userName.trim() : '我';
    const globalAvatarUrl = settings.userAvatarUrl.trim();
    const globalAvatarIcon = globalAvatarUrl ? '' : settings.userAvatarIcon || '';
    const globalAvatarColor = settings.userAvatarColor || '#0ea5e9';

    if (!activeContact) {
      return {
        name: globalName,
        avatarColor: globalAvatarColor,
        avatarIcon: globalAvatarIcon || undefined,
        avatarUrl: globalAvatarUrl || undefined
      };
    }

    const localName = activeContact.selfName?.trim();
    const localAvatarUrl = activeContact.selfAvatarUrl?.trim() ?? '';
    const localAvatarIcon = localAvatarUrl ? '' : activeContact.selfAvatarIcon || '';
    const localAvatarColor = activeContact.selfAvatarColor;

    const effectiveName = localName && localName.length > 0 ? localName : globalName;
    const effectiveAvatarUrl = localAvatarUrl || globalAvatarUrl;
    let effectiveAvatarIcon: string | undefined;

    if (localAvatarUrl) {
      effectiveAvatarIcon = undefined;
    } else if (localAvatarIcon) {
      effectiveAvatarIcon = localAvatarIcon;
    } else if (globalAvatarUrl) {
      effectiveAvatarIcon = undefined;
    } else if (globalAvatarIcon) {
      effectiveAvatarIcon = globalAvatarIcon;
    }

    return {
      name: effectiveName,
      avatarColor: localAvatarColor ?? globalAvatarColor,
      avatarIcon: effectiveAvatarIcon || undefined,
      avatarUrl: effectiveAvatarUrl || undefined
    };
  }, [
    activeContact,
    settings.userAvatarColor,
    settings.userAvatarIcon,
    settings.userAvatarUrl,
    settings.userName
  ]);
  const hasPendingUserMessages = pendingUserMessages.length > 0;
  const trimmedInputValue = inputValue.trim();

  const handleSelectContact = (id: string) => {
    navigate(`/apps/chat/${id}`);
  };

  const handleBackToContacts = () => {
    navigate('/apps/chat');
  };

  
const requestAssistantReply = async () => {
    if (!activeThread || !contactId) {
      return;
    }

    const threadMessages = await db.messages.where({ threadId: activeThread.id }).sortBy('createdAt');
    let hasPendingUserMessage = false;
    for (let index = threadMessages.length - 1; index >= 0; index -= 1) {
      const message = threadMessages[index];
      if (message.role === 'assistant') {
        break;
      }
      if (message.role === 'user') {
        hasPendingUserMessage = true;
        break;
      }
    }

    if (!hasPendingUserMessage) {
      setError('暂无新的用户消息待 AI 回复。');
      return;
    }

    if (!settings.apiKey) {
      setError('请先在“设置”页面填写 API Key。');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await sendMessageToLLM({ threadId: activeThread.id });
      const segments = splitAssistantResponse(response);
      const parts = segments.length > 0 ? segments : [response.trim()];

      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length === 0) {
          continue;
        }
        await persistMessage({
          threadId: activeThread.id,
          role: 'assistant',
          content: trimmed
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '请求失败，请稍后再试或检查设置。';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async ({ requestReply }: { requestReply: boolean }) => {
    if (!activeThread || !contactId) {
      return;
    }

    const trimmedInput = inputValue.trim();

    if (!requestReply && trimmedInput.length === 0) {
      return;
    }

    setError(null);

    try {
      if (trimmedInput.length > 0) {
        await persistMessage({
          threadId: activeThread.id,
          role: 'user',
          content: trimmedInput
        });
        setInputValue('');
      }

      if (requestReply) {
        await requestAssistantReply();
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '发送失败，请稍后再试或检查设置。';
      setError(message);
    }
  };

  const handleCreateContact = async (payload: {
    name: string;
    prompt: string;
    avatarColor: string;
    avatarUrl?: string;
  }) => {
    const { contact } = await createContact(payload);
    navigate(`/apps/chat/${contact.id}`);
  };

  const handleSaveContactDetails = async (updates: {
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
  }) => {
    if (!contactId) {
      return;
    }
    await updateContact(contactId, updates);
  };

  const handleDeleteContact = async (id: string) => {
    await deleteContact(id);
    navigate('/apps/chat');
  };

  if (!contactId) {
    return (
      <>
        <ContactListScreen
          contacts={contacts ?? []}
          onSelect={handleSelectContact}
          onCreate={() => setShowDialog(true)}
        />
        {showDialog ? (
          <NewContactForm
            onSubmit={handleCreateContact}
            onClose={() => setShowDialog(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-white/10 via-white/5 to-white/10" style={{height: '100vh'}}>
      <div className="flex flex-1 flex-col sm:flex-row" style={{height: '100vh'}}>
        <ContactSidebar
          contacts={contacts ?? []}
          activeContactId={contactId}
          onSelect={handleSelectContact}
          onCreate={() => setShowDialog(true)}
        />

        <section className="flex min-h-0 flex-1 flex-col bg-white/10 shadow-2xl shadow-black/20 backdrop-blur-2xl">
          <header className="flex flex-none items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-1 items-center gap-3" style={{justifyContent: 'space-between'}}>
              <button
                onClick={handleBackToContacts}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20 sm:hidden"
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <use xlinkHref="#icon-left-arrow" />
                </svg>
                <span>返回联系人</span>
              </button>
              {activeContact ? (
                <h1 className="text-base font-semibold text-white">
                  {activeContact ? activeContact.name : 'AI 角色对话'}
                </h1>
              ) : (
                <div className="h-8 w-8 rounded-2xl bg-white/20 text-center text-sm font-semibold uppercase leading-8 text-white sm:h-10 sm:w-10 sm:text-base">
                  AI
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsDetailsOpen(true)}
                  disabled={!activeContact}
                  aria-label="角色详情"
                  className="rounded-full border border-white/20 bg-white/10 p-2 text-white/80 transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15.4 1.65 1.65 0 0 0 1.5 14H1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 2.6 8 1.65 1.65 0 0 0 2.27 6.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 7 3.6 1.65 1.65 0 0 0 8.5 2H9a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 2.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21 8.6a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <use xlinkHref="#icon-left-arrow" />
                </svg>
                <span>返回</span>
              </Link>
              <div className="rounded-full bg-white/20 px-4 py-1 text-xs text-white/80 shadow-inner">
                {settings.model || '未选择模型'}
              </div>
            </div>
          </header>

          <div
            ref={messagesContainerRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-6 sm:px-8"
          >
            {messages && messages.length > 0 ? (
              messages.map((message) => (
                <MessageBubble
                  key={message.id ?? message.createdAt}
                  message={message}
                  contact={activeContact}
                  userProfile={userProfile}
                />
              ))
            ) : (
              <div className="mt-24 text-center text-white/60">
                发送第一条消息，开始和角色的故事吧。
              </div>
            )}
          </div>

          <footer className="flex flex-none flex-col gap-3 border-t border-white/10 bg-white/10 px-4 py-4 sm:px-8">
            {error ? (
              <div className="mb-2 rounded-2xl bg-red-500/20 px-4 py-2 text-xs text-red-200">
                {error}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                rows={1}
                placeholder={activeContact ? '输入消息，可多条发送后一起请求回复…' : '请先在左侧选择一个角色'}
                className="h-20 flex-1 resize-none rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20 disabled:opacity-60 sm:h-12"
                disabled={!activeThread || isSending}
              />
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => handleSendMessage({ requestReply: false })}
                  disabled={isSending || trimmedInputValue.length === 0 || !activeThread}
                  className="rounded-3xl border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  仅发送
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage({ requestReply: true })}
                  disabled={isSending || !activeThread || (trimmedInputValue.length === 0 && !hasPendingUserMessages)}
                  className="flex items-center gap-2 rounded-3xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? (
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        d="M4 12a8 8 0 0 1 8-8"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <use xlinkHref="#icon-send-fill" />
                    </svg>
                  )}
                  <span>{isSending ? '等待AI…' : '向AI请求回复'}</span>
                </button>
              </div>
            </div>
          </footer>
        </section>
      </div>

      {showDialog ? (
        <NewContactForm
          onSubmit={handleCreateContact}
          onClose={() => setShowDialog(false)}
        />
      ) : null}

      {isDetailsOpen && activeContact ? (
        <ContactDetailsModal
          contact={activeContact}
          onClose={() => setIsDetailsOpen(false)}
          onSave={handleSaveContactDetails}
          onDelete={async () => handleDeleteContact(activeContact.id)}
        />
      ) : null}
    </div>
  );
};

export default ChatApp;
