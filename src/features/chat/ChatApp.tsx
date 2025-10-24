import { FormEvent, useEffect, useMemo, useState } from 'react';
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

const randomColor = () => {
  const palette = ['#38bdf8', '#f472b6', '#34d399', '#f59e0b', '#a855f7', '#ef4444', '#fb7185'];
  return palette[Math.floor(Math.random() * palette.length)];
};

const ContactAvatar = ({
  contact,
  size = 'h-10 w-10',
  rounded = 'rounded-2xl',
  textSize = 'text-base',
  className = ''
}: {
  contact: Contact;
  size?: string;
  rounded?: string;
  textSize?: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const initial = contact.name.slice(0, 1);

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
      className={`flex items-center justify-center ${rounded} ${size} ${textSize} font-semibold uppercase text-white ${className}`}
      style={{ backgroundColor: contact.avatarColor }}
    >
      {initial}
    </div>
  );
};

type ContactSidebarProps = {
  contacts: Contact[];
  activeContactId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
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
        ←
      </Link>
      <button
        onClick={onCreate}
        className="rounded-full border border-dashed border-white/30 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/60 hover:bg-white/20"
      >
        + 新建角色
      </button>
    </header>

    <section className="flex-1 space-y-3 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sm text-white/70 shadow-glass backdrop-blur-xl">
        选择联系人开始聊天，或新建角色打造专属 AI 形象。
      </div>
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
          >
            <ContactAvatar contact={contact} size="h-12 w-12" textSize="text-lg" />
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
    avatarUrl: string;
    worldBook: string;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
};

const ContactDetailsModal = ({ contact, onClose, onSave, onDelete }: ContactDetailsModalProps) => {
  const [name, setName] = useState(contact.name);
  const [prompt, setPrompt] = useState(contact.prompt);
  const [avatarColor, setAvatarColor] = useState(contact.avatarColor);
  const [worldBook, setWorldBook] = useState(contact.worldBook ?? '');
  const [avatarUrl, setAvatarUrl] = useState(contact.avatarUrl ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim() || contact.name,
        prompt: prompt.trim(),
        avatarColor,
        avatarUrl: avatarUrl.trim(),
        worldBook: worldBook.trim()
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后再试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`确定要删除联系人「${contact.name}」吗？此操作不可撤销。`);
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
          角色姓名
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
            placeholder="描述角色的性格、语气与背景。"
          />
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
          头像图片链接
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/avatar.png"
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
          />
          <span className="mt-1 block text-xs text-white/50">
            支持使用网络图片作为头像，留空将使用颜色背景与姓名首字母。
          </span>
        </label>

        <label className="block text-sm text-white/70">
          角色世界书
          <textarea
            value={worldBook}
            onChange={(event) => setWorldBook(event.target.value)}
            rows={6}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder="补充角色所在世界观、事件、关键设定等信息。"
          />
        </label>

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
  onSubmit: (values: { name: string; prompt: string; avatarColor: string; avatarUrl?: string }) => Promise<void>;
  onClose: () => void;
}) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avatarColor, setAvatarColor] = useState(randomColor());
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('请填写角色姓名');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), prompt: prompt.trim(), avatarColor, avatarUrl: avatarUrl.trim() || undefined });
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

const MessageBubble = ({ message }: { message: Message }) => {
  const isSelf = message.role === 'user';
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-lg sm:max-w-sm ${
          isSelf
            ? 'bg-cyan-400/85 text-slate-900 shadow-cyan-500/40 backdrop-blur-md'
            : 'bg-white/15 text-white shadow-white/10 backdrop-blur-md'
        }`}
      >
        {message.content}
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

  const handleSelectContact = (id: string) => {
    navigate(`/apps/chat/${id}`);
  };

  const handleBackToContacts = () => {
    navigate('/apps/chat');
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !activeThread || !contactId) {
      return;
    }
    if (!settings.apiKey) {
      setError('请先在「设置」中填写 API Key。');
      return;
    }
    setIsSending(true);
    const userMessage = inputValue.trim();
    setInputValue('');
    setError(null);
    try {
      await persistMessage({
        threadId: activeThread.id,
        role: 'user',
        content: userMessage
      });

      const response = await sendMessageToLLM({ threadId: activeThread.id, userMessage });
      await persistMessage({
        threadId: activeThread.id,
        role: 'assistant',
        content: response
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '发送失败，请稍后重试或检查网络连接。';
      setError(message);
    } finally {
      setIsSending(false);
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
    avatarUrl: string;
    worldBook: string;
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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-white/10 via-white/5 to-white/10">
      <div className="flex flex-1 flex-col sm:flex-row">
        <ContactSidebar
          contacts={contacts ?? []}
          activeContactId={contactId}
          onSelect={handleSelectContact}
          onCreate={() => setShowDialog(true)}
        />

        <section className="flex flex-1 flex-col bg-white/10 shadow-2xl shadow-black/20 backdrop-blur-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-1 items-center gap-3">
              <div className="flex items-center gap-2 sm:hidden">
                <button
                  onClick={handleBackToContacts}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
                >
                  ← 联系人
                </button>
                <button
                  onClick={() => setIsDetailsOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
                  disabled={!activeContact}
                >
                  角色详情
                </button>
              </div>
              <div className="flex items-center gap-2">
                {activeContact ? (
                  <ContactAvatar contact={activeContact} className="hidden sm:flex" />
                ) : (
                  <div className="hidden h-10 w-10 items-center justify-center rounded-2xl text-base font-semibold uppercase text-white sm:flex">
                    AI
                  </div>
                )}
                <div>
                  <h1 className="text-base font-semibold text-white">
                    {activeContact ? activeContact.name : 'AI 角色对话'}
                  </h1>
                  <p className="text-xs text-white/60 line-clamp-1">
                    {activeContact?.prompt || '设置角色以获得更真实的扮演体验。'}
                  </p>
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={() => setIsDetailsOpen(true)}
                disabled={!activeContact}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                角色详情
              </button>
              <Link
                to="/"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
              >
                主屏
              </Link>
              <div className="rounded-full bg-white/20 px-4 py-1 text-xs text-white/80 shadow-inner">
                {settings.model || '未选择模型'}
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-6 sm:px-8">
            {messages && messages.length > 0 ? (
              messages.map((message) => (
                <MessageBubble key={message.id ?? message.createdAt} message={message} />
              ))
            ) : (
              <div className="mt-24 text-center text-white/60">
                发送第一条消息，开始和角色的故事吧。
              </div>
            )}
          </div>

          <footer className="border-t border-white/10 bg-white/10 px-4 py-4 sm:px-8">
            {error ? (
              <div className="mb-2 rounded-2xl bg-red-500/20 px-4 py-2 text-xs text-red-200">
                {error}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                rows={2}
                placeholder={activeContact ? '输入消息...' : '请先创建或选择一个角色'}
                className="min-h-[72px] flex-1 rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20 disabled:opacity-60"
                disabled={!activeThread}
              />
              <button
                onClick={handleSend}
                disabled={isSending || !inputValue.trim() || !activeThread}
                className="rounded-3xl bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? '发送中...' : '发送'}
              </button>
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
