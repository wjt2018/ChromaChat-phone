import {
  ChangeEvent,
  FormEvent,
  SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { db, Contact, Message } from '../../services/db';
import {
  buildChatPayload,
  createContact,
  deleteContact,
  persistMessage,
  sendMessageToLLM,
  summarizeThreadLongMemory,
  deleteMessageById,
  updateMessageContent,
  updateContact
} from '../../services/chatService';
import { useSettingsStore } from '../../stores/settingsStore';
import { CONTACT_ICON_OPTIONS, ContactIconName, getRandomContactIcon } from '../../constants/icons';
import ContactDetailsModal from './ContactDetailsModal';
import { ContactAvatar, AssistantAvatar, UserAvatar, UserProfile } from './AvatarComponents';
import {
  AutoReplyDelayOption,
  formatTokensShort,
  normalizeAutoReplyDelayOption,
  snapToTokenStep
} from './utils';

const randomColor = () => {
  const palette = ['#38bdf8', '#f472b6', '#34d399', '#f59e0b', '#a855f7', '#ef4444', '#fb7185'];
  return palette[Math.floor(Math.random() * palette.length)];
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

type MessageActionTarget = {
  message: Message;
  canRegenerate: boolean;
  anchor?: {
    x: number;
    y: number;
    width: number;
    height: number;
    isSelf: boolean;
    viewportWidth: number;
  };
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
  userProfile,
  shouldAnimate = false,
  onRequestActions,
  selectionMode = false,
  selected = false
}: {
  message: Message;
  contact?: Contact;
  userProfile: UserProfile;
  shouldAnimate?: boolean;
  onRequestActions?: (
    message: Message,
    anchor?: {
      x: number;
      y: number;
      width: number;
      height: number;
      isSelf: boolean;
      viewportWidth: number;
    }
  ) => void;
  selectionMode?: boolean;
  selected?: boolean;
}) => {
  const isSelf = message.role === 'user';
  const longPressRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const triggerActions = useCallback(() => {
    if (onRequestActions) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        onRequestActions(message, {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          isSelf,
          viewportWidth: window.innerWidth
        });
      } else {
        onRequestActions(message);
      }
    }
  }, [isSelf, message, onRequestActions]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    if (!onRequestActions) {
      return;
    }
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      triggerActions();
      clearLongPress();
    }, 600);
  }, [clearLongPress, onRequestActions, triggerActions]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const bubble = (
    <div
      className={`max-w-xs rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-lg transition sm:max-w-sm ${
        isSelf
          ? 'bg-cyan-400/85 text-slate-900 shadow-cyan-500/40 backdrop-blur-md'
          : 'bg-white/15 text-white shadow-white/10 backdrop-blur-md'
      } ${selectionMode && selected ? 'ring-2 ring-cyan-300/70 ring-offset-2 ring-offset-slate-950/40' : ''}`}
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
    <div className={`flex w-full ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative flex items-end gap-2 sm:gap-3 ${
          shouldAnimate ? 'message-appear' : ''
        }`}
        ref={containerRef}
        onContextMenu={(event) => {
          if (onRequestActions) {
            event.preventDefault();
            triggerActions();
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
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
        {!selectionMode ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              triggerActions();
            }}
            className={`absolute hidden h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/40 sm:flex ${
              isSelf ? '-left-3 -bottom-3' : '-right-3 -bottom-3'
            }`}
            aria-label="消息操作"
          >
            ...
          </button>
        ) : null}
      </div>
    </div>
  );
};

const getMessageKey = (message: Message) =>
  message.id !== undefined
    ? `id-${message.id}`
    : `temp-${message.threadId}-${message.createdAt}-${message.role}`;

const ChatApp = () => {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const settings = useSettingsStore();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [visibleMessageKeys, setVisibleMessageKeys] = useState<string[]>([]);
  const [animatingKeys, setAnimatingKeys] = useState<string[]>([]);
  const revealTimeoutRef = useRef<number | null>(null);
  const animationTimeoutsRef = useRef<Record<string, number>>({});
  const autoReplyTimerRef = useRef<number | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<MessageActionTarget | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<string[]>([]);
  const selectedMessageKeySet = useMemo(() => new Set(selectedMessageKeys), [selectedMessageKeys]);

  const closeMessageActions = useCallback(() => {
    setMessageActionTarget(null);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessageKeys([]);
  }, []);

  const toggleMessageSelection = useCallback((message: Message) => {
    const key = getMessageKey(message);
    setSelectedMessageKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  }, []);

  const handleStartMultiSelect = useCallback(
    (message: Message) => {
      const key = getMessageKey(message);
      setIsSelectionMode(true);
      setSelectedMessageKeys((prev) => {
        if (prev.includes(key)) {
          return prev;
        }
        return [...prev, key];
      });
      setShowMoreOptions(false);
      closeMessageActions();
    },
    [closeMessageActions]
  );

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const clearAutoReplyTimer = useCallback(() => {
    if (autoReplyTimerRef.current !== null) {
      window.clearTimeout(autoReplyTimerRef.current);
      autoReplyTimerRef.current = null;
    }
  }, []);

  const triggerBubbleAnimation = useCallback((key: string) => {
    setAnimatingKeys((prev) => {
      if (prev.includes(key)) {
        return prev;
      }
      return [...prev, key];
    });

    if (animationTimeoutsRef.current[key]) {
      window.clearTimeout(animationTimeoutsRef.current[key]);
    }

    animationTimeoutsRef.current[key] = window.setTimeout(() => {
      setAnimatingKeys((prev) => prev.filter((item) => item !== key));
      delete animationTimeoutsRef.current[key];
    }, 480);
  }, []);

  useEffect(() => {
    return () => {
      clearRevealTimeout();
      clearAutoReplyTimer();
      Object.values(animationTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      animationTimeoutsRef.current = {};
    };
  }, [clearRevealTimeout, clearAutoReplyTimer]);

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

  useEffect(() => {
    setShowMoreOptions(false);
    exitSelectionMode();
  }, [contactId, exitSelectionMode]);

  const activeThread = useMemo(() => {
    if (!threads || !contactId) {
      return undefined;
    }
    return threads.find((thread) => thread.contactId === contactId);
  }, [threads, contactId]);
  const activeThreadId = activeThread?.id;

  const messages = useLiveQuery<Message[]>(
    () =>
      contactId && activeThread
        ? db.messages.where({ threadId: activeThread.id }).sortBy('createdAt')
        : Promise.resolve<Message[]>([]),
    [activeThread?.id, contactId]
  );

  useEffect(() => {
    if (!messages) {
      return;
    }
    setSelectedMessageKeys((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const allowed = new Set(messages.map(getMessageKey));
      const filtered = prev.filter((key) => allowed.has(key));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [messages]);

  useEffect(() => {
    if (isSelectionMode && selectedMessageKeys.length === 0) {
      exitSelectionMode();
    }
  }, [exitSelectionMode, isSelectionMode, selectedMessageKeys.length]);

  const latestAssistantData = useMemo(() => {
    if (!messages || messages.length === 0) {
      return {
        keys: new Set<string>(),
        range: null as { start: number; end: number } | null
      };
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') {
      return {
        keys: new Set<string>(),
        range: null
      };
    }

    let lastIndex = messages.length - 1;
    let firstAssistantIndex = lastIndex;
    for (let index = lastIndex; index >= 0; index -= 1) {
      const item = messages[index];
      if (item.role === 'user') {
        break;
      }
      if (item.role === 'assistant') {
        firstAssistantIndex = index;
      }
    }

    const keys = new Set<string>();
    for (let index = firstAssistantIndex; index <= lastIndex; index += 1) {
      keys.add(getMessageKey(messages[index]));
    }

    return {
      keys,
      range: { start: firstAssistantIndex, end: lastIndex }
    };
  }, [messages]);

  const openMessageActions = useCallback(
    (
      message: Message,
      anchor?: {
        x: number;
        y: number;
        width: number;
        height: number;
        isSelf: boolean;
        viewportWidth: number;
      }
    ) => {
      const key = getMessageKey(message);
      const canRegenerate =
        message.role === 'assistant' && latestAssistantData.keys.has(key);
      setMessageActionTarget({ message, canRegenerate, anchor });
    },
    [latestAssistantData]
  );


  const activeContact = contacts?.find((contact) => contact.id === contactId);

  useEffect(() => {
    clearRevealTimeout();
    Object.values(animationTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    animationTimeoutsRef.current = {};
    setVisibleMessageKeys([]);
    setAnimatingKeys([]);
  }, [activeThread?.id, clearRevealTimeout]);

  useEffect(() => {
    if (!messages) {
      return;
    }

    const orderedKeys = messages.map(getMessageKey);

    if (orderedKeys.length === 0) {
      if (visibleMessageKeys.length > 0) {
        setVisibleMessageKeys([]);
      }
      return;
    }

    const alignedKeys = orderedKeys.filter((key) => visibleMessageKeys.includes(key));
    if (alignedKeys.length !== visibleMessageKeys.length) {
      setVisibleMessageKeys(alignedKeys);
      return;
    }

    if (visibleMessageKeys.length === 0) {
      setVisibleMessageKeys(orderedKeys);
      return;
    }

    const existingKeys = new Set(visibleMessageKeys);
    const queue = orderedKeys.filter((key) => !existingKeys.has(key));

    if (queue.length === 0) {
      return;
    }

    clearRevealTimeout();

    let index = 0;
    const revealNext = () => {
      const key = queue[index];
      setVisibleMessageKeys((prev) => {
        const baseSet = new Set(prev);
        baseSet.add(key);
        return orderedKeys.filter((item) => baseSet.has(item));
      });
      triggerBubbleAnimation(key);
      index += 1;
      if (index < queue.length) {
        // 调整消息弹出时间间隔
        revealTimeoutRef.current = window.setTimeout(revealNext, 1000);
      } else {
        revealTimeoutRef.current = null;
      }
    };
    // 调整消息弹出时间间隔
    revealTimeoutRef.current = window.setTimeout(revealNext, 1000);

    return () => {
      clearRevealTimeout();
    };
  }, [messages, visibleMessageKeys, clearRevealTimeout, triggerBubbleAnimation]);

  const visibleMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      return [];
    }
    if (visibleMessageKeys.length === 0) {
      return messages;
    }
    const keySet = new Set(visibleMessageKeys);
    return messages.filter((message) => keySet.has(getMessageKey(message)));
  }, [messages, visibleMessageKeys]);

  const animatingKeySet = useMemo(() => new Set(animatingKeys), [animatingKeys]);

  useEffect(() => {
    if (visibleMessages.length === 0) {
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
  }, [activeThread?.id, visibleMessages.length]);

  const latestPendingUserKey = useMemo(() => {
    if (!messages || messages.length === 0) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant') {
        return null;
      }
      if (message.role === 'user') {
        return getMessageKey(message);
      }
    }

    return null;
  }, [messages]);

  const tokenStats = useMemo(() => {
    if (!activeContact) {
      return null;
    }

    const contextSettings = {
      systemPrompt: settings.systemPrompt,
      userName: settings.userName,
      userPrompt: settings.userPrompt,
      model: settings.model
    };
    const history = messages ?? [];

    const { tokenCount, tokenLimit } = buildChatPayload({
      contact: activeContact,
      settings: contextSettings,
      history
    });

    return {
      currentTokens: tokenCount,
      tokenLimit
    };
  }, [
    activeContact,
    messages,
    settings.model,
    settings.systemPrompt,
    settings.userName,
    settings.userPrompt
  ]);

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
  const hasPendingUserMessages = Boolean(latestPendingUserKey);
  const trimmedInputValue = inputValue.trim();
  const hasApiKey = settings.apiKey.trim().length > 0;
  const canSummarizeLongMemory =
    Boolean(activeThread && messages && messages.length > 0 && hasApiKey);

  const syncTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    const minHeight = 38;
    const nextHeight = Math.max(textarea.scrollHeight, minHeight);
    textarea.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    syncTextareaHeight(textareaRef.current);
  }, [inputValue]);

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    syncTextareaHeight(event.currentTarget);
    setInputValue(event.currentTarget.value);
  };

  const handleSelectContact = (id: string) => {
    navigate(`/apps/chat/${id}`);
  };

  const handleBackToContacts = () => {
    navigate('/apps/chat');
  };

  const handleSummarizeLongMemory = async () => {
    if (!activeThread || isSummarizing) {
      return;
    }

    try {
      setIsSummarizing(true);
      await summarizeThreadLongMemory({ threadId: activeThread.id });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '生成总结失败，请稍后重试。';
      setError(message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const requestAssistantReply = useCallback(async () => {
    clearAutoReplyTimer();

    if (!activeThreadId || !contactId) {
      return;
    }

    const threadMessages = await db.messages.where({ threadId: activeThreadId }).sortBy('createdAt');
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
      const response = await sendMessageToLLM({ threadId: activeThreadId });
      const segments = splitAssistantResponse(response);
      const parts = segments.length > 0 ? segments : [response.trim()];

      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length === 0) {
          continue;
        }
        await persistMessage({
          threadId: activeThreadId,
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
  }, [activeThreadId, contactId, settings.apiKey, clearAutoReplyTimer]);

  useEffect(() => {
    clearAutoReplyTimer();

    if (!activeContact || !activeContact.autoReplyEnabled) {
      return;
    }

    if (!activeThreadId || !latestPendingUserKey) {
      return;
    }

    if (!hasApiKey || isSending) {
      return;
    }

    const delayMinutes = normalizeAutoReplyDelayOption(activeContact.autoReplyDelayMinutes);
    autoReplyTimerRef.current = window.setTimeout(() => {
      autoReplyTimerRef.current = null;
      void requestAssistantReply();
    }, delayMinutes * 60 * 1000);

    return () => {
      clearAutoReplyTimer();
    };
  }, [
    activeContact?.id,
    activeContact?.autoReplyEnabled,
    activeContact?.autoReplyDelayMinutes,
    activeThreadId,
    latestPendingUserKey,
    hasApiKey,
    isSending,
    clearAutoReplyTimer,
    requestAssistantReply
  ]);

  const handleDeleteMessage = useCallback(
    async (message: Message) => {
      if (!message.id) {
        closeMessageActions();
        setError('无法删除暂存消息。');
        return;
      }
      try {
        await deleteMessageById(message.id);
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : '删除消息失败，请稍后重试。';
        setError(messageText);
      } finally {
        closeMessageActions();
      }
    },
    [closeMessageActions]
  );

  const handleBulkDeleteSelectedMessages = useCallback(async () => {
    if (!messages || selectedMessageKeys.length === 0) {
      exitSelectionMode();
      return;
    }

    const keySet = new Set(selectedMessageKeys);
    const targets = messages.filter(
      (item): item is Message & { id: number } =>
        keySet.has(getMessageKey(item)) && typeof item.id === 'number'
    );

    if (targets.length === 0) {
      setError('选择的消息无法删除。');
      exitSelectionMode();
      return;
    }

    try {
      await Promise.all(targets.map((item) => deleteMessageById(item.id)));
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '批量删除失败，请稍后重试。';
      setError(messageText);
    } finally {
      exitSelectionMode();
    }
  }, [exitSelectionMode, messages, selectedMessageKeys]);


  const handleEditMessage = useCallback(
    async (message: Message) => {
      if (!message.id) {
        closeMessageActions();
        setError('无法编辑暂存消息。');
        return;
      }
      const nextContent = window.prompt('修改消息内容', message.content);
      if (nextContent === null) {
        return;
      }
      const trimmed = nextContent.trim();
      if (trimmed.length === 0) {
        setError('编辑后的内容不能为空。');
        return;
      }
      try {
        await updateMessageContent({ messageId: message.id, content: trimmed });
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : '修改消息失败，请稍后重试。';
        setError(messageText);
      } finally {
        closeMessageActions();
      }
    },
    [closeMessageActions]
  );

  const handleRegenerateMessage = useCallback(
    async (message: Message) => {
      if (!activeThread || message.role !== 'assistant') {
        closeMessageActions();
        setError('仅支持对 AI 回复重新生成。');
        return;
      }
      if (!messages) {
        closeMessageActions();
        return;
      }
      const messageKey = getMessageKey(message);
      const canRegenerate = latestAssistantData.keys.has(messageKey);
      if (!canRegenerate) {
        closeMessageActions();
        setError('仅可重新生成最近一次 AI 回复。');
        return;
      }

      const range = latestAssistantData.range;
      if (!range) {
        closeMessageActions();
        setError('未找到对应的用户消息，无法重新生成。');
        return;
      }

      const targetIndex = messages.findIndex((item) => item.id === message.id);
      if (targetIndex === -1) {
        closeMessageActions();
        return;
      }
      try {
        const toDeleteIds: number[] = [];
        for (let index = range.start; index < messages.length; index += 1) {
          const item = messages[index];
          if (typeof item.id === 'number') {
            toDeleteIds.push(item.id);
          }
        }

        await Promise.all(toDeleteIds.map((id) => deleteMessageById(id)));
        await requestAssistantReply();
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : '重新生成失败，请稍后再试。';
        setError(messageText);
      } finally {
        closeMessageActions();
      }
    },
    [activeThread, closeMessageActions, latestAssistantData, messages, requestAssistantReply]
  );

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
    tokenLimit: number;
    autoReplyEnabled: boolean;
    autoReplyDelayMinutes?: number;
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
                title='返回联系人'
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <use xlinkHref="#icon-left-arrow" />
                </svg>
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
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <use xlinkHref="#icon-settings" />
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
            {visibleMessages.length > 0 ? (
              visibleMessages.map((message) => {
                const messageKey = getMessageKey(message);
                const isSelected = selectedMessageKeySet.has(messageKey);
                return (
                  <div
                    key={messageKey}
                    className={`flex w-full items-stretch ${isSelectionMode ? 'gap-3 py-1 sm:gap-4' : ''}`}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleMessageSelection(message);
                      }
                    }}
                  >
                    {isSelectionMode ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleMessageSelection(message);
                        }}
                        className="flex w-10 shrink-0 items-start justify-center pt-2 sm:w-12"
                        role="checkbox"
                        aria-checked={isSelected}
                        style={{alignItems: 'center'}}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border-[3px] transition ${
                            isSelected ? 'border-cyan-300 bg-cyan-300' : 'border-white/50 bg-transparent'
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full bg-slate-900 transition ${
                              isSelected ? 'opacity-100 scale-100' : 'scale-50 opacity-0'
                            }`}
                          />
                        </span>
                      </button>
                    ) : null}
                    <div className="flex flex-1">
                      <MessageBubble
                        message={message}
                        contact={activeContact}
                        userProfile={userProfile}
                        shouldAnimate={animatingKeySet.has(messageKey)}
                        onRequestActions={isSelectionMode ? undefined : openMessageActions}
                        selectionMode={isSelectionMode}
                        selected={isSelected}
                      />
                    </div>
                  </div>
                );
              })
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
            {isSelectionMode ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/80">
                  已选择 <span className="font-semibold text-white">{selectedMessageKeys.length}</span> 条消息
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleBulkDeleteSelectedMessages}
                    disabled={selectedMessageKeys.length === 0}
                    className="w-full rounded-2xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-500/40"
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="w-full rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={() => setShowMoreOptions((prev) => !prev)}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                aria-label={showMoreOptions ? '收起更多功能' : '展开更多功能'}
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                rows={1}
                className="min-h-[38px] min-w-0 flex-1 resize-none rounded-3xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/20 disabled:opacity-60 sm:min-w-[240px]"
                disabled={!activeThread || isSending}
              />
              <div className="flex shrink-0 items-center gap-2">
                <button
                  title="发送消息但不请求回复"
                  type="button"
                  onClick={() => handleSendMessage({ requestReply: false })}
                  disabled={isSending || trimmedInputValue.length === 0 || !activeThread}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg aria-hidden="true" className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <use xlinkHref="#icon-up-arrow" />
                    </svg>
                  <span className="sr-only">仅发送</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage({ requestReply: true })}
                  disabled={isSending || !activeThread || (trimmedInputValue.length === 0 && !hasPendingUserMessages)}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  title="请求回复"
                >
                  {isSending ? (
                    <svg
                      className="h-4 w-4 animate-spin text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-90"
                        d="M4 12a8 8 0 0 1 8-8"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <use xlinkHref="#icon-send-fill" />
                    </svg>
                  )}
                  <span className="sr-only">发送并请求回复</span>
                </button>
              </div>
            </div>
            {showMoreOptions ? (
              <div className="flex flex-wrap gap-3 rounded-3xl border border-white/15 bg-white/5 px-4 py-3 text-white/80">
                <button
                  type="button"
                  onClick={handleSummarizeLongMemory}
                  disabled={!canSummarizeLongMemory || isSummarizing}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-xs transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                  title="总结前文，生成长期记忆"
                >
                  {isSummarizing ? (
                    <svg
                      className="h-4 w-4 animate-spin text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-90"
                        d="M4 12a8 8 0 0 1 8-8"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <span className="font-medium text-white">总结</span>
                  )}
                  <span className="sr-only">总结前文</span>
                </button>
                {['功能 B', '功能 C'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-xs transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                    title={label}
                    disabled
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
              </>
            )}
          </footer>
        </section>
      </div>

      {messageActionTarget
        ? (() => {
            const actions = [
              {
                key: 'edit',
                label: '编辑',
                icon: '#icon-pen',
                onClick: () => handleEditMessage(messageActionTarget.message),
                disabled: false
              },
              {
                key: 'regenerate',
                label: '重生成',
                icon: '#icon-refresh',
                onClick: () => handleRegenerateMessage(messageActionTarget.message),
                disabled: !messageActionTarget.canRegenerate
              },
              {
                key: 'multi-select',
                label: '多选',
                icon: '#icon-duoxuan',
                onClick: () => handleStartMultiSelect(messageActionTarget.message),
                disabled: messageActionTarget.message.id === undefined
              },
              {
                key: 'delete',
                label: '删除',
                icon: '#icon-delete',
                onClick: () => handleDeleteMessage(messageActionTarget.message),
                disabled: false
              }
            ];

            const renderActionButton = (
              action: (typeof actions)[number],
              variant: 'bubble' | 'modal'
            ) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={
                  variant === 'bubble'
                    ? 'flex w-16 flex-col items-center gap-1 rounded-xl bg-white/8 text-xs font-medium text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40'
                    : 'flex w-full items-center gap-3 rounded-2xl bg-white/12 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40'
                }
                style={{gap: 0}}
              >
                <span
                  className={
                    variant === 'bubble'
                      ? 'flex h-8 w-8 items-center justify-center rounded-full bg-white/12'
                      : 'flex h-9 w-9 items-center justify-center rounded-full bg-white/12'
                  }
                >
                  <svg
                    aria-hidden="true"
                    className={variant === 'bubble' ? 'h-4 w-4' : 'h-5 w-5'}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <use xlinkHref={action.icon} />
                  </svg>
                </span>
                <span className={variant === 'bubble' ? 'text-[11px]' : 'text-sm'}>{action.label}</span>
              </button>
            );

            const anchor = messageActionTarget.anchor;
            if (anchor) {
              const centerX = anchor.x + anchor.width / 2;
              const halfWidth = Math.max(72, Math.min(130, anchor.viewportWidth / 2 - 16));
              const clampedX = Math.min(anchor.viewportWidth - halfWidth, Math.max(halfWidth, centerX));
              const top = Math.max(84, anchor.y - 12);
              return (
                <div className="fixed inset-0 z-50">
                  <button
                    type="button"
                    className="absolute inset-0 h-full w-full cursor-default bg-transparent"
                    onClick={closeMessageActions}
                  />
                  <div
                    className="absolute z-10 flex flex-col items-center gap-[2px]"
                    style={{ left: clampedX, top, transform: 'translate(-50%, calc(-100% - -7px))', gap: '0px' }}
                  >
                    <div
                      style={{ paddingTop: 0 }}
                      className="max-w-[260px] rounded-2xl border border-white/15 bg-slate-950/90 px-3 py-2 text-white shadow-xl backdrop-blur-md"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-3">
                        {actions.map((action) => renderActionButton(action, 'bubble'))}
                      </div>
                    </div>
                    <div
                      className="pointer-events-none"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '9px solid transparent',
                        borderRight: '9px solid transparent',
                        borderTop: '10px solid rgb(2 6 23 / 0.9)',
                        marginTop: -2
                      }}
                    />
                  </div>
                </div>
              );
            }

            return (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6 pt-10 sm:items-center sm:pb-0"
                onClick={closeMessageActions}
              >
                <div
                  className="w-full max-w-sm rounded-3xl bg-slate-900 p-4 text-white shadow-2xl sm:rounded-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="mb-3 line-clamp-3 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/70">
                    {messageActionTarget.message.content}
                  </p>
                  <div className="flex flex-col gap-3">
                    {actions.map((action) => renderActionButton(action, 'modal'))}
                  </div>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10"
                    onClick={closeMessageActions}
                  >
                    取消
                  </button>
                </div>
              </div>
            );
          })()
        : null}

      {isDetailsOpen && activeContact ? (
        <ContactDetailsModal
          contact={activeContact}
          tokenStats={tokenStats ?? undefined}
          onClose={() => setIsDetailsOpen(false)}
          onSave={handleSaveContactDetails}
          onDelete={async () => handleDeleteContact(activeContact.id)}
        />
      ) : null}
    </div>
  );
};

export default ChatApp;
