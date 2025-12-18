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

import {
  db,
  Contact,
  Message,
  StickerRecord,
  ContactInteractionMode,
  GroupMember
} from '../../services/db';
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
import { CustomSticker } from '../../constants/customStickers';
import { addStickerToCatalog, createLocalStickerUrl, removeStickerByUrl } from '../../services/stickerService';
import ContactDetailsModal from './ContactDetailsModal';
import { ContactAvatar, AssistantAvatar, UserAvatar, UserProfile } from './AvatarComponents';
import {
  AutoReplyDelayOption,
  formatTokensShort,
  normalizeAutoReplyDelayOption,
  snapToTokenStep
} from './utils';
import { buildMockImageContent, parseMockImageContent } from '../../constants/mockImage';
import {
  buildMockVoiceContent,
  estimateVoiceDurationSeconds,
  parseMockVoiceContent
} from '../../constants/mockVoice';
import { chatCompletion } from '../../services/llmClient';

const randomColor = () => {
  const palette = ['#38bdf8', '#f472b6', '#34d399', '#f59e0b', '#a855f7', '#ef4444', '#fb7185'];
  return palette[Math.floor(Math.random() * palette.length)];
};

const splitAssistantResponse = (
  content: string,
  options?: { mode?: 'default' | 'offline' }
): string[] => {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const mode = options?.mode ?? 'default';
  if (mode === 'offline') {
    const offlineBlocks = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    if (offlineBlocks.length > 0) {
      return offlineBlocks.slice(0, 4);
    }
  }

  const sentenceRegex = /[^\u3002\uFF01\uFF1F?!]+[\u3002\uFF01\uFF1F?!]?/g;
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

  if (mode === 'offline' && sentences.length > 4) {
    return sentences.slice(0, 4);
  }

  return sentences;
};

const BUILTIN_EMOJIS = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😊',
  '😍',
  '😎',
  '🤩',
  '😘',
  '😚',
  '🤔',
  '🤨',
  '😏',
  '😴',
  '😪',
  '😷',
  '🤒',
  '🥳',
  '😇',
  '🙃',
  '🙂',
  '🙄',
  '😭',
  '😤',
  '😡',
  '😱',
  '😰',
  '🥺',
  '😅',
  '😆',
  '😉',
  '👍',
  '👎',
  '🙏',
  '👏',
  '🤝',
  '👀',
  '💪',
  '❤️',
  '💔',
  '✨',
  '🔥',
  '🌟',
  '🎉',
  '🎁',
  '⚡'
] as const;

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
  onCreateContact: () => void;
  onCreateGroup: () => void;
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

type BatchUploadItem = {
  id: string;
  label: string;
  file: File;
  previewUrl: string;
};

type ParsedGroupReplySegment = {
  key: string;
  name: string;
  text: string;
  member?: GroupMember;
};

const normalizeGroupMemberName = (value: string) => value.replace(/[【】]/g, '').trim();
const markdownImageRegex = /!?\s*\[([^\]]*)\]\s*\(([^)]+)\)/g;
const standaloneMarkdownImageRegex = /^!\s*\[[^\]]*]\s*\([^)]+\)$/;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseGroupAssistantMessage = (
  content: string,
  members: GroupMember[]
): ParsedGroupReplySegment[] => {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();
  if (!normalizedContent) {
    return [];
  }
  const normalizedMembers = members.map((member) => ({
    member,
    normalized: normalizeGroupMemberName(member.name).replace(/\s+/g, '').toLowerCase()
  }));
  const patternSource = members
    .map((member) => normalizeGroupMemberName(member.name))
    .filter((name) => name.length > 0)
    .map((name) => escapeRegExp(name))
    .sort((a, b) => b.length - a.length);
  const colonPattern = '[\\uFF1A:：﹕︰]';
  const leadingWrapperPattern = '[@\\\\"“‘’「『（(【\\[]*';
  const memberRegex =
    patternSource.length > 0
      ? new RegExp(`^${leadingWrapperPattern}(${patternSource.join('|')})${colonPattern}\\s*(.*)$`)
      : null;
  const matchMember = (name: string) => {
    const normalized = normalizeGroupMemberName(name).replace(/\s+/g, '').toLowerCase();
    return (
      normalizedMembers.find((entry) => entry.normalized === normalized) ||
      normalizedMembers.find((entry) => normalized.includes(entry.normalized)) ||
      undefined
    );
  };
  if (!memberRegex) {
    return [
      {
        key: `group-segment-0`,
        name: '群成员',
        text: normalizedContent,
        member: undefined
      }
    ];
  }
  const segments: Array<{ name: string; text: string }> = [];
  let activeSegment: { name: string; text: string } | null = null;
  let pendingBlankLines = 0;
  const lines = normalizedContent.split('\n');
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      if (activeSegment) {
        pendingBlankLines += 1;
      }
      return;
    }
    const match = memberRegex ? line.match(memberRegex) : null;
    if (match) {
      const name = match[1] ? normalizeGroupMemberName(match[1]) : '群成员';
      const text = (match[2] ?? '').trim();
      const segment = { name, text };
      segments.push(segment);
      activeSegment = segment;
      pendingBlankLines = 0;
      return;
    }
    if (!activeSegment) {
      activeSegment = {
        name: '群成员',
        text: line
      };
      segments.push(activeSegment);
      pendingBlankLines = 0;
      return;
    }
    const separator = pendingBlankLines > 0 ? '\n\n' : '\n';
    activeSegment.text = activeSegment.text
      ? `${activeSegment.text}${separator}${line}`
      : line;
    pendingBlankLines = 0;
  });
  if (segments.length === 0) {
    return [
      {
        key: `group-segment-0`,
        name: '群成员',
        text: normalizedContent,
        member: undefined
      }
    ];
  }
  return segments.map((segment, index) => {
    const matched = matchMember(segment.name);
    return {
      key: matched?.member.id ?? `${segment.name}-${index}`,
      name: segment.name,
      text: segment.text.trim(),
      member: matched?.member
    };
  });
};
const sentenceSegmentRegex = /[^\u3002\uFF01\uFF1F?!]+[\u3002\uFF01\uFF1F?!]?/g;

const QUOTE_PAIRS: Array<[string, string]> = [
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
  ['《', '》'],
  ['〈', '〉'],
  ['‘', '’'],
  ['"', '"'],
  ["'", "'"],
  ['【', '】'],
  ['[', ']'],
  ['（', '）'],
  ['(', ')']
];

const stripWrappingQuotes = (value: string) => {
  let result = value.trim();
  let matched = true;
  while (matched && result.length > 1) {
    matched = false;
    for (const [open, close] of QUOTE_PAIRS) {
      if (result.startsWith(open) && result.endsWith(close)) {
        result = result.slice(open.length, result.length - close.length).trim();
        matched = true;
        break;
      }
    }
  }
  return result;
};

const normalizeMarkdownImageToken = (value: string) =>
  value
    .replace(/!\s*\[/, '![')
    .replace(/\]\s*\(/, '](')
    .trim();

const extractStandaloneMarkdownImage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (standaloneMarkdownImageRegex.test(trimmed)) {
    return normalizeMarkdownImageToken(trimmed);
  }
  const unwrapped = stripWrappingQuotes(trimmed);
  if (unwrapped !== trimmed && standaloneMarkdownImageRegex.test(unwrapped)) {
    return normalizeMarkdownImageToken(unwrapped);
  }
  return null;
};

const appendPlainTextSegments = (text: string, collector: string[]) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const matches = trimmed.match(sentenceSegmentRegex);
  if (matches) {
    matches.forEach((match) => {
      const segment = match.trim();
      if (segment.length > 0) {
        collector.push(segment);
      }
    });
    return;
  }
  collector.push(trimmed);
};

const splitGroupSegmentText = (value: string): string[] => {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/!\s*\n\s*\[/g, '![')
    .replace(/\]\s*\n\s*\(/g, '](')
    .trim();
  if (!normalized) {
    return [];
  }
  const segments: string[] = [];
  const paragraphs = normalized.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  paragraphs.forEach((paragraph) => {
    const standaloneImage = extractStandaloneMarkdownImage(paragraph);
    if (standaloneImage) {
      segments.push(standaloneImage);
      return;
    }
    markdownImageRegex.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = markdownImageRegex.exec(paragraph)) !== null) {
      const before = paragraph.slice(lastIndex, match.index);
      appendPlainTextSegments(before, segments);
      segments.push(normalizeMarkdownImageToken(match[0]));
      lastIndex = match.index + match[0].length;
    }
    const remaining = paragraph.slice(lastIndex);
    appendPlainTextSegments(remaining, segments);
  });
  return segments;
};

const sanitizeLabel = (value: string, fallback: string) => {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return fallback;
};

const deriveLabelFromFile = (file: File, index = 0) => {
  const base = file.name.replace(/\.[^.]+$/, '');
  return sanitizeLabel(base, `本地表情${index + 1}`);
};

const deriveLabelFromUrl = (url: string, index = 0) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? parsed.hostname;
    const base = last.replace(/\.[^.]+$/, '');
    return sanitizeLabel(base, `网络表情${index + 1}`);
  } catch {
    return `网络表情${index + 1}`;
  }
};

const isValidExternalUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const ContactSidebar = ({
  contacts,
  activeContactId,
  onSelect,
  onCreateContact,
  onCreateGroup
}: ContactSidebarProps) => (
  <aside className="hidden h-full w-80 flex-none flex-col gap-4 border-r border-white/10 bg-white/5 p-6 shadow-inner shadow-black/10 backdrop-blur-xl sm:flex lg:w-96">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-white/80">联系人</h2>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={onCreateGroup}
          className="rounded-full border border-dashed border-white/30 px-3 py-1 text-xs text-white/70 transition hover:border-white/60 hover:bg-white/20"
        >
          + 新建群聊
        </button>
        <button
          onClick={onCreateContact}
          className="rounded-full border border-dashed border-white/30 px-3 py-1 text-xs text-white/70 transition hover:border-white/60 hover:bg-white/20"
        >
          + 新建角色
        </button>
      </div>
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
  onCreateContact: () => void;
  onCreateGroup: () => void;
};

const ContactListScreen = ({
  contacts,
  onSelect,
  onCreateContact,
  onCreateGroup
}: ContactListScreenProps) => (
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onCreateGroup}
          className="rounded-full border border-dashed border-white/30 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/60 hover:bg-white/20"
        >
          + 新建群聊
        </button>
        <button
          onClick={onCreateContact}
          className="rounded-full border border-dashed border-white/30 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/60 hover:bg-white/20"
        >
          + 新建角色
        </button>
      </div>
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

type CreateModalVariant = 'contact' | 'group';

const CREATE_MODAL_COPY: Record<
  CreateModalVariant,
  {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    promptLabel: string;
    promptPlaceholder: string;
    submitLabel: string;
    submittingLabel: string;
    emptyNameError: string;
    previewName: string;
  }
> = {
  contact: {
    title: '创建新的 AI 角色',
    nameLabel: '角色姓名',
    namePlaceholder: '例如：阿黎',
    promptLabel: '人设描述',
    promptPlaceholder: '介绍角色的性格、说话方式、背景故事等',
    submitLabel: '创建角色',
    submittingLabel: '创建中...',
    emptyNameError: '请填写角色姓名',
    previewName: '新角色'
  },
  group: {
    title: '创建新的群聊',
    nameLabel: '群聊名称',
    namePlaceholder: '例如：周末小组讨论',
    promptLabel: '群聊规则',
    promptPlaceholder: '例如：固定话题、禁言规则或其他说明',
    submitLabel: '创建群聊',
    submittingLabel: '创建中...',
    emptyNameError: '请填写群聊名称',
    previewName: '新群聊'
  }
};

type CreateContactPayload = {
  name: string;
  prompt: string;
  avatarColor: string;
  avatarIcon: ContactIconName;
  avatarUrl?: string;
  type?: 'single' | 'group';
  groupMembers?: GroupMember[];
};

const CreateChatTargetModal = ({
  variant,
  onSubmit,
  onClose,
  contacts
}: {
  variant: CreateModalVariant;
  onSubmit: (values: CreateContactPayload) => Promise<void>;
  onClose: () => void;
  contacts: Contact[];
}) => {
  const copy = CREATE_MODAL_COPY[variant];
  const isGroupVariant = variant === 'group';
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avatarColor, setAvatarColor] = useState(randomColor());
  const [avatarIcon, setAvatarIcon] = useState<ContactIconName>(getRandomContactIcon());
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [isExistingPickerOpen, setIsExistingPickerOpen] = useState(false);
  const [isAiFormOpen, setIsAiFormOpen] = useState(false);
  const [aiDirection, setAiDirection] = useState('');
  const [isGeneratingMember, setIsGeneratingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const llmSettings = useSettingsStore((state) => ({
    baseUrl: state.baseUrl,
    apiKey: state.apiKey,
    model: state.model
  }));

  const trimmedAvatarUrl = avatarUrl.trim();
  const previewContact = {
    id: 'preview',
    name: name || copy.previewName,
    avatarColor,
    avatarIcon,
    avatarUrl: trimmedAvatarUrl || undefined,
    prompt: '',
    worldBook: '',
    createdAt: Date.now()
  } as Contact;
  const selectableContacts = useMemo(
    () => contacts.filter((contact) => (contact.type ?? 'single') !== 'group'),
    [contacts]
  );
  const addedExistingIds = useMemo(() => {
    const ids = new Set<string>();
    groupMembers.forEach((member) => {
      if (member.originContactId) {
        ids.add(member.originContactId);
      }
    });
    return ids;
  }, [groupMembers]);

  useEffect(() => {
    if (!isGroupVariant && groupMembers.length > 0) {
      setGroupMembers([]);
    }
  }, [isGroupVariant, groupMembers.length]);

  const handleAddExistingContact = useCallback(
    (contact: Contact) => {
      if (addedExistingIds.has(contact.id)) {
        return;
      }
      const member: GroupMember = {
        id: crypto.randomUUID(),
        name: contact.name,
        prompt: contact.prompt || '未设置人设',
        avatarColor: contact.avatarColor,
        avatarIcon: contact.avatarIcon,
        avatarUrl: contact.avatarUrl,
        originContactId: contact.id,
        source: 'existing'
      };
      setGroupMembers((prev) => [...prev, member]);
    },
    [addedExistingIds]
  );

  const handleRemoveMember = useCallback((memberId: string) => {
    setGroupMembers((prev) => prev.filter((member) => member.id !== memberId));
  }, []);

  const parseGeneratedMember = (content: string) => {
    const match = content.match(/\{[\s\S]*\}/);
    const payloadText = match ? match[0] : content;
    return JSON.parse(payloadText);
  };

  const handleGenerateMember = useCallback(async () => {
    if (isGeneratingMember) {
      return;
    }
    if (!llmSettings.apiKey.trim()) {
      setMemberError('请先在“设置”页面填写 API Key。');
      return;
    }
    setIsGeneratingMember(true);
    setMemberError(null);
    try {
      const direction = aiDirection.trim();
      const existingNames = groupMembers.map((member) => member.name);
      const requestLines = [
        '请设计一位中文群聊角色，返回 JSON 对象，字段包括 "name" 和 "persona"（第一人称或第三人称设定，30~80字）。',
        '角色需要用中文回复，保留独特的语气和身份背景。',
        direction.length > 0 ? `角色方向：${direction}` : '若无方向可自行发挥。'
      ];
      if (existingNames.length > 0) {
        requestLines.push(`当前已存在的角色：${existingNames.join('、')}。避免与他们重名或人设重复。`);
      }
      const { content } = await chatCompletion({
        baseUrl: llmSettings.baseUrl,
        apiKey: llmSettings.apiKey,
        model: llmSettings.model,
        temperature: 0.9,
        messages: [
          {
            role: 'system',
            content:
              'You are a creative writer who only outputs valid JSON without additional text.'
          },
          {
            role: 'user',
            content: requestLines.filter(Boolean).join('\n')
          }
        ]
      });
      const parsed = parseGeneratedMember(content);
      const memberName =
        typeof parsed.name === 'string' && parsed.name.trim().length > 0
          ? parsed.name.trim()
          : `新成员${groupMembers.length + 1}`;
      const persona =
        typeof parsed.persona === 'string' && parsed.persona.trim().length > 0
          ? parsed.persona.trim()
          : '保持神秘、随机发挥。';
      const member: GroupMember = {
        id: crypto.randomUUID(),
        name: memberName,
        prompt: persona,
        avatarColor: randomColor(),
        avatarIcon: getRandomContactIcon(),
        source: 'generated'
      };
      setGroupMembers((prev) => [...prev, member]);
      setAiDirection('');
      setIsAiFormOpen(false);
    } catch (generationError) {
      setMemberError(
        generationError instanceof Error ? generationError.message : '生成角色失败，请稍后重试。'
      );
    } finally {
      setIsGeneratingMember(false);
    }
  }, [
    aiDirection,
    groupMembers,
    isGeneratingMember,
    llmSettings.apiKey,
    llmSettings.baseUrl,
    llmSettings.model
  ]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(copy.emptyNameError);
      return;
    }
    if (isGroupVariant && groupMembers.length < 2) {
      setError('请至少添加 2 位群成员');
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
        avatarUrl: avatarUrl.trim() || undefined,
        type: isGroupVariant ? 'group' : 'single',
        groupMembers: isGroupVariant ? groupMembers : undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建联系人失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-glass backdrop-blur-2xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold text-white">{copy.title}</h2>
        <label className="block text-sm text-white/70">
          {copy.nameLabel}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder={copy.namePlaceholder}
          />
        </label>
        <label className="block text-sm text-white/70">
          {copy.promptLabel}
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
            placeholder={copy.promptPlaceholder}
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

        {isGroupVariant ? (
          <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-white">群成员</h3>
              <p className="text-xs text-white/70">
                已添加 {groupMembers.length} 位。可从已有角色中挑选，或由 AI 生成新角色。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {groupMembers.map((member) => (
                <div
                  key={member.id}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 p-3 text-left text-white sm:w-[calc(50%-0.375rem)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{member.name}</p>
                      <p className="mt-1 text-xs text-white/60 line-clamp-3">{member.prompt}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="rounded-full border border-white/20 px-2 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/10"
                    >
                      移除
                    </button>
                  </div>
                  <span className="mt-2 inline-flex items-center rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase text-white/60">
                    {member.source === 'existing' ? '已有角色' : 'AI 生成'}
                  </span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIsExistingPickerOpen((prev) => !prev);
                  setIsAiFormOpen(false);
                }}
                className="flex min-h-[96px] flex-1 items-center justify-center rounded-2xl border border-dashed border-white/25 bg-white/5 px-3 py-4 text-center text-xs text-white/70 transition hover:border-white/50 hover:bg-white/10"
              >
                + 从已有角色添加
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAiFormOpen((prev) => !prev);
                  setIsExistingPickerOpen(false);
                  setMemberError(null);
                }}
                className="flex min-h-[96px] flex-1 items-center justify-center rounded-2xl border border-dashed border-white/25 bg-white/5 px-3 py-4 text-center text-xs text-white/70 transition hover:border-white/50 hover:bg-white/10"
              >
                + AI 生成角色
              </button>
            </div>

            {isExistingPickerOpen ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/70">选择已有角色加入</p>
                  <button
                    type="button"
                    onClick={() => setIsExistingPickerOpen(false)}
                    className="text-xs text-white/60 hover:text-white"
                  >
                    收起
                  </button>
                </div>
                {selectableContacts.length === 0 ? (
                  <p className="text-xs text-white/50">暂时没有可用的角色。</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {selectableContacts.map((contact) => {
                      const disabled = addedExistingIds.has(contact.id);
                      return (
                        <div
                          key={contact.id}
                          className="flex items-start justify-between rounded-2xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="min-w-0 pr-3">
                            <p className="text-sm font-semibold text-white">{contact.name}</p>
                            <p className="mt-1 text-xs text-white/60 line-clamp-2">
                              {contact.prompt || '未设置人设'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddExistingContact(contact)}
                            disabled={disabled}
                            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {disabled ? '已添加' : '添加'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {isAiFormOpen ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/70">AI 生成角色方向（可选）</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiFormOpen(false);
                      setMemberError(null);
                    }}
                    className="text-xs text-white/60 hover:text-white"
                  >
                    收起
                  </button>
                </div>
                <textarea
                  value={aiDirection}
                  onChange={(event) => setAiDirection(event.target.value)}
                  rows={3}
                  placeholder="示例：阳光开朗的女大学生，擅长组织活动"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/10"
                />
                {memberError ? (
                  <p className="text-xs text-red-200">{memberError}</p>
                ) : (
                  <p className="text-xs text-white/50">
                    若留空则完全随机生成；需要 API Key 才能调用 AI。
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateMember}
                    disabled={isGeneratingMember}
                    className="flex-1 rounded-2xl bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/40"
                  >
                    {isGeneratingMember ? '生成中...' : '生成角色'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-2xl bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/50"
          >
            {isSubmitting ? copy.submittingLabel : copy.submitLabel}
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
  selected = false,
  stickerSrcMap
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
  stickerSrcMap: Map<string, string>;
}) => {
  const isSelf = message.role === 'user';
  const longPressRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mockImageRevealed, setMockImageRevealed] = useState(false);
  const [voiceRevealed, setVoiceRevealed] = useState(false);
  const groupMembers = contact?.type === 'group' ? contact.groupMembers ?? [] : [];

  useEffect(() => {
    setMockImageRevealed(false);
    setVoiceRevealed(false);
  }, [message.content]);

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

  const trimmedContent = message.content.trim();
  const stickerRegex = /!?\[([^\]]+)\]\(([^)]+)\)/gi;
  type StickerMatch = {
    key: string;
    alt: string;
    url: string;
    resolvedSrc: string;
    fullMatch: string;
  };
  const stickerMatches: StickerMatch[] = [];
  for (const match of trimmedContent.matchAll(stickerRegex)) {
    const fullMatch = match[0] ?? '';
    const altRaw = match[1]?.trim() ?? '';
    const url = match[2]?.trim() ?? '';
    const resolvedSrc = stickerSrcMap.get(url);
    if (!resolvedSrc) {
      continue;
    }
    stickerMatches.push({
      key: `${url}-${stickerMatches.length}`,
      alt: altRaw.length > 0 ? altRaw : `sticker-${stickerMatches.length + 1}`,
      url,
      resolvedSrc,
      fullMatch
    });
  }
  const hasStickers = stickerMatches.length > 0;
  const textWithoutStickers = hasStickers
    ? stickerMatches.reduce(
        (text, match) => text.replace(match.fullMatch, '').trim(),
        trimmedContent
      ).trim()
    : trimmedContent;
  const mockImageDescription = parseMockImageContent(trimmedContent);
  const mockVoicePayload = parseMockVoiceContent(trimmedContent);
  const isMockImageMessage = Boolean(mockImageDescription);
  const isMockVoiceMessage = Boolean(mockVoicePayload);
  const showCompactContent = hasStickers || isMockImageMessage || isMockVoiceMessage;
  const isOfflineAssistant = !isSelf && contact?.interactionMode === 'offline';

  const renderRichText = (text: string, extraClass = '') => {
    const baseClass = ['whitespace-pre-wrap break-words', extraClass].filter(Boolean).join(' ');
    if (!isOfflineAssistant) {
      return <span className={baseClass}>{text}</span>;
    }

    const parenthesesRegex = /(\([^)]*\)|（[^）]*）)/g;
    const segments: Array<{ text: string; type: 'action' | 'speech' }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = parenthesesRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          text: text.slice(lastIndex, match.index),
          type: 'speech'
        });
      }
      segments.push({
        text: match[0] ?? '',
        type: 'action'
      });
      lastIndex = match.index + (match[0]?.length ?? 0);
    }
    if (lastIndex < text.length) {
      segments.push({
        text: text.slice(lastIndex),
        type: 'speech'
      });
    }

    if (segments.length === 0) {
      return <span className={baseClass}>{text}</span>;
    }

    return (
      <span className={baseClass}>
        {segments.map((segment, index) => (
          <span
            key={`${segment.type}-${index}`}
            className={segment.type === 'speech' ? undefined : 'text-white/70'}
          >
            {segment.text}
          </span>
        ))}
      </span>
    );
  };

  const groupReplySegments = useMemo(() => {
    if (message.role !== 'assistant' || groupMembers.length === 0) {
      return null;
    }
    const parsed = parseGroupAssistantMessage(trimmedContent, groupMembers);
    const expanded: ParsedGroupReplySegment[] = [];
    let lastAttributedSpeaker: ParsedGroupReplySegment | null = null;
    parsed.forEach((segment) => {
      const hasExplicitSpeaker = segment.name !== '群成员' || Boolean(segment.member);
      const resolvedSegment =
        !hasExplicitSpeaker && lastAttributedSpeaker
          ? {
              ...segment,
              name: lastAttributedSpeaker.name,
              member: lastAttributedSpeaker.member
            }
          : segment;
      if (resolvedSegment.name !== '群成员' || resolvedSegment.member) {
        lastAttributedSpeaker = resolvedSegment;
      }
      const sentences = splitGroupSegmentText(resolvedSegment.text);
      if (sentences.length === 0) {
        return;
      }
      if (sentences.length === 1) {
        expanded.push({
          ...resolvedSegment,
          text: sentences[0]
        });
        return;
      }
      sentences.forEach((sentence, index) => {
        expanded.push({
          ...resolvedSegment,
          key: `${resolvedSegment.key}-${index}`,
          text: sentence
        });
      });
    });
    return expanded;
  }, [groupMembers, message.role, trimmedContent]);
  const hasGroupSegments = Boolean(groupReplySegments && groupReplySegments.length > 0);

  const renderSegmentContent = (segmentText: string, keyPrefix: string) => {
    const elements: React.ReactNode[] = [];
    markdownImageRegex.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = markdownImageRegex.exec(segmentText)) !== null) {
      const [fullMatch, altRaw, urlRaw] = match;
      const before = segmentText.slice(lastIndex, match.index).trim();
      if (before.length > 0) {
        elements.push(
          <div key={`${keyPrefix}-text-${elements.length}`} className="text-sm leading-relaxed">
            {renderRichText(before)}
          </div>
        );
      }
      const url = urlRaw?.trim();
      if (url) {
        const alt = altRaw?.trim().length ? altRaw.trim() : `image-${elements.length + 1}`;
        elements.push(
          <img
            key={`${keyPrefix}-image-${elements.length}`}
            src={url}
            alt={alt}
            className="mt-1 max-h-48 w-full rounded-2xl object-contain"
            draggable={false}
          />
        );
      } else if (fullMatch) {
        elements.push(
          <div key={`${keyPrefix}-text-${elements.length}`} className="text-sm leading-relaxed">
            {renderRichText(fullMatch)}
          </div>
        );
      }
      lastIndex = match.index + fullMatch.length;
    }
    const remaining = segmentText.slice(lastIndex).trim();
    if (remaining.length > 0 || elements.length === 0) {
      elements.push(
        <div key={`${keyPrefix}-text-${elements.length}`} className="text-sm leading-relaxed">
          {renderRichText(remaining)}
        </div>
      );
    }
    return elements;
  };

  const bubble = hasGroupSegments ? (
    <div className="flex flex-col gap-4 text-white">
      {groupReplySegments!.map((segment) => {
        const avatarContact = segment.member
          ? ({
              id: segment.member.id,
              name: segment.member.name,
              avatarColor: segment.member.avatarColor || '#38bdf8',
              avatarIcon: segment.member.avatarIcon,
              avatarUrl: segment.member.avatarUrl,
              prompt: segment.member.prompt,
              worldBook: '',
              createdAt: segment.member.id.length
            } as Contact)
          : null;
        const avatarNode = avatarContact ? (
          <ContactAvatar contact={avatarContact} size="h-10 w-10" iconScale="h-1/2 w-1/2" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-sm font-semibold text-white">
            {segment.name.slice(0, 1)}
          </div>
        );
        return (
          <div key={segment.key} className="flex w-full gap-3">
            <div className="flex w-16 flex-col items-center gap-1 text-center">
              <span className="line-clamp-2 text-[11px] text-white/70">{segment.name}</span>
              {avatarNode}
            </div>
            <div className="flex-1">
              <div className="max-w-full space-y-2 rounded-3xl bg-white/15 px-4 py-3 text-white shadow-white/10 backdrop-blur-md">
                {renderSegmentContent(segment.text, segment.key)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div
      className={`max-w-xs rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-lg transition sm:max-w-sm ${
        isSelf
          ? 'bg-cyan-400/85 text-slate-900 shadow-cyan-500/40 backdrop-blur-md'
          : 'bg-white/15 text-white shadow-white/10 backdrop-blur-md'
      } ${selectionMode && selected ? 'ring-2 ring-cyan-300/70 ring-offset-2 ring-offset-slate-950/40' : ''} ${
        showCompactContent ? 'p-2 sm:p-3 text-center' : ''
      }`}
    >
      {isMockImageMessage && mockImageDescription ? (
        <button
          type="button"
          onClick={() => setMockImageRevealed((prev) => !prev)}
          className={`flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed ${
            isSelf ? 'border-slate-900/30 text-slate-900' : 'border-white/40 text-white'
          } bg-white/5 px-6 py-5 text-center transition hover:bg-white/10`}
        >
          {mockImageRevealed ? (
            <>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{mockImageDescription}</p>
              <span className="text-xs opacity-70">再次点击收起</span>
            </>
          ) : (
            <>
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                  isSelf ? 'bg-slate-900/10 text-slate-900' : 'bg-white/10 text-white'
                }`}
              >
                <svg aria-hidden="true" className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                  <use xlinkHref="#icon-photo" />
                </svg>
              </span>
              <span className="text-xs opacity-70">点击查看描述</span>
            </>
          )}
        </button>
      ) : isMockVoiceMessage && mockVoicePayload ? (
        <button
          type="button"
          onClick={() => setVoiceRevealed((prev) => !prev)}
          className={`flex w-full flex-col rounded-2xl ${
            isSelf
              ? 'text-slate-900'
              : 'text-white'
          } transition hover:${voiceRevealed ? 'gap-3 text-left' : 'text-center'}`}
        >
          <div
            className={`flex w-full items-center gap-3 px-1 ${
              voiceRevealed ? 'justify-between border-b border-dashed border-current pb-1' : 'justify-center'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-xl ${
                isSelf ? 'text-slate-900' : 'text-white'
              }`}
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <use xlinkHref="#icon-saying" />
              </svg>
            </span>
            <span className="text-base tabular-nums">{mockVoicePayload.durationSeconds}s</span>
          </div>
          {voiceRevealed ? (
            <p
              className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
                isSelf ? 'text-slate-900' : 'text-white/90'
              }`}
            >
              {mockVoicePayload.transcript}
            </p>
          ) : null}
        </button>
      ) : hasStickers ? (
        <div className="flex flex-col items-center gap-2">
          {stickerMatches.map(({ key, alt, resolvedSrc }) => (
            <img
              key={key}
              src={resolvedSrc}
              alt={alt}
              className="max-h-28 max-w-full rounded-2xl object-contain"
              loading="lazy"
              draggable={false}
            />
          ))}
          {/* {textWithoutStickers.length > 0 ? (
            renderRichText(textWithoutStickers, 'block text-xs text-white/80')
          ) : null} */}
        </div>
      ) : (
        renderRichText(message.content)
      )}
    </div>
  );

  const avatar = hasGroupSegments
    ? null
    : isSelf
    ? (
        <UserAvatar profile={userProfile} size="h-9 w-9 sm:h-10 sm:w-10" />
      )
    : (
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
  const [createModalVariant, setCreateModalVariant] = useState<CreateModalVariant | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [moreOptionsView, setMoreOptionsView] = useState<'default' | 'emoji'>('default');
  const [emojiActiveTab, setEmojiActiveTab] = useState<'builtin' | 'custom'>('builtin');
  const [isMockImageModalOpen, setIsMockImageModalOpen] = useState(false);
  const [mockImageDescription, setMockImageDescription] = useState('');
  const [isSendingMockImage, setIsSendingMockImage] = useState(false);
  const [isMockVoiceModalOpen, setIsMockVoiceModalOpen] = useState(false);
  const [mockVoiceContent, setMockVoiceContent] = useState('');
  const [isSendingMockVoice, setIsSendingMockVoice] = useState(false);
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);
  const [stickerModalTab, setStickerModalTab] = useState<'single' | 'batch'>('single');
  const [stickerLabelInput, setStickerLabelInput] = useState('');
  const [stickerImageUrlInput, setStickerImageUrlInput] = useState('');
  const [singleStickerFile, setSingleStickerFile] = useState<File | null>(null);
  const [singleStickerPreviewUrl, setSingleStickerPreviewUrl] = useState<string | null>(null);
  const [stickerModalError, setStickerModalError] = useState<string | null>(null);
  const [isSavingSticker, setIsSavingSticker] = useState(false);
  const [batchFileItems, setBatchFileItems] = useState<BatchUploadItem[]>([]);
  const [batchUrlInput, setBatchUrlInput] = useState('');
  const [remoteLabelOverrides, setRemoteLabelOverrides] = useState<Record<string, string>>({});
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const handleOpenContactModal = useCallback(() => {
    setCreateModalVariant('contact');
  }, []);
  const handleOpenGroupModal = useCallback(() => {
    setCreateModalVariant('group');
  }, []);
  const handleCloseCreateModal = useCallback(() => {
    setCreateModalVariant(null);
  }, []);

  const settings = useSettingsStore();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const singleStickerFileInputRef = useRef<HTMLInputElement | null>(null);
  const batchStickerFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const INITIAL_DISPLAY_COUNT = 50;
  const PAGE_SIZE = 50;
  const [visibleMessageKeys, setVisibleMessageKeys] = useState<string[]>([]);
  const [animatingKeys, setAnimatingKeys] = useState<string[]>([]);
  const revealTimeoutRef = useRef<number | null>(null);
  const animationTimeoutsRef = useRef<Record<string, number>>({});
  const autoReplyTimerRef = useRef<number | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<MessageActionTarget | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<string[]>([]);
  const selectedMessageKeySet = useMemo(() => new Set(selectedMessageKeys), [selectedMessageKeys]);
  const [messageLimit, setMessageLimit] = useState(INITIAL_DISPLAY_COUNT);
  const [showLoadMoreHint, setShowLoadMoreHint] = useState(false);
  const customStickerRecords = useLiveQuery<StickerRecord[]>(() => db.stickers.orderBy('createdAt').toArray(), []);
  const customStickers: CustomSticker[] = useMemo(
    () => (customStickerRecords ?? []).map(({ label, url }) => ({ label, url })),
    [customStickerRecords]
  );
  const [stickerSrcMap, setStickerSrcMap] = useState<Map<string, string>>(new Map());
  const stickerLongPressTimeoutRef = useRef<number | null>(null);
  const ignoreNextStickerClickRef = useRef(false);
  const [stickerDeleteTarget, setStickerDeleteTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!customStickerRecords) {
      setStickerSrcMap(new Map());
      return;
    }
    const map = new Map<string, string>();
    const objectUrls: string[] = [];
    customStickerRecords.forEach((record) => {
      if (record.blobData) {
        const objectUrl = URL.createObjectURL(record.blobData);
        map.set(record.url, objectUrl);
        objectUrls.push(objectUrl);
      } else {
        map.set(record.url, record.url);
      }
    });
    setStickerSrcMap(map);
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [customStickerRecords]);
  const closeMockImageModal = useCallback(() => {
    setIsMockImageModalOpen(false);
    setMockImageDescription('');
  }, []);

  const openMockImageModal = useCallback(() => {
    setMockImageDescription('');
    setIsMockImageModalOpen(true);
  }, []);

  const closeMockVoiceModal = useCallback(() => {
    setIsMockVoiceModalOpen(false);
    setMockVoiceContent('');
  }, []);

  const openMockVoiceModal = useCallback(() => {
    setMockVoiceContent('');
    setIsMockVoiceModalOpen(true);
  }, []);

  const releaseBatchPreviewUrls = useCallback((items: BatchUploadItem[]) => {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const clearSingleStickerSelection = useCallback(() => {
    if (singleStickerPreviewUrl) {
      URL.revokeObjectURL(singleStickerPreviewUrl);
    }
    setSingleStickerPreviewUrl(null);
    setSingleStickerFile(null);
  }, [singleStickerPreviewUrl]);

  const resetStickerModalState = useCallback(() => {
    setStickerLabelInput('');
    setStickerImageUrlInput('');
    setStickerModalError(null);
    clearSingleStickerSelection();
    releaseBatchPreviewUrls(batchFileItems);
    setBatchFileItems([]);
    setBatchUrlInput('');
    setRemoteLabelOverrides({});
  }, [batchFileItems, clearSingleStickerSelection, releaseBatchPreviewUrls]);

  const openStickerModal = useCallback(() => {
    resetStickerModalState();
    setStickerModalTab('single');
    setIsStickerModalOpen(true);
  }, [resetStickerModalState]);

  const closeStickerModal = useCallback(() => {
    setIsStickerModalOpen(false);
    resetStickerModalState();
  }, [resetStickerModalState]);

  const batchFileItemsRef = useRef<BatchUploadItem[]>([]);
  useEffect(() => {
    batchFileItemsRef.current = batchFileItems;
  }, [batchFileItems]);
  useEffect(() => {
    return () => {
      releaseBatchPreviewUrls(batchFileItemsRef.current);
    };
  }, [releaseBatchPreviewUrls]);
  useEffect(() => {
    return () => {
      if (singleStickerPreviewUrl) {
        URL.revokeObjectURL(singleStickerPreviewUrl);
      }
    };
  }, [singleStickerPreviewUrl]);

  const handleSingleStickerFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (!file.type.startsWith('image/')) {
        setStickerModalError('仅支持图片文件，请重新选择');
        event.target.value = '';
        return;
      }
      setStickerModalError(null);
      clearSingleStickerSelection();
      setSingleStickerFile(file);
      const previewUrl = URL.createObjectURL(file);
      setSingleStickerPreviewUrl(previewUrl);
      setStickerImageUrlInput('');
      event.target.value = '';
    },
    [clearSingleStickerSelection]
  );

  const handleBatchFilesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }
    let encounteredInvalid = false;
    setBatchFileItems((prev) => {
      const additions: BatchUploadItem[] = [];
      let offset = prev.length;
      files.forEach((file) => {
        if (!file.type.startsWith('image/')) {
          encounteredInvalid = true;
          return;
        }
        additions.push({
          id: crypto.randomUUID(),
          file,
          label: deriveLabelFromFile(file, offset + additions.length),
          previewUrl: URL.createObjectURL(file)
        });
      });
      return [...prev, ...additions];
    });
    if (encounteredInvalid) {
      setStickerModalError('部分文件不是图片，已跳过非图片文件');
    } else {
      setStickerModalError(null);
    }
    event.target.value = '';
  }, []);

  const handleBatchFileLabelChange = useCallback((id: string, value: string) => {
    setBatchFileItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label: value } : item))
    );
  }, []);

  const handleRemoveBatchFileItem = useCallback((id: string) => {
    setBatchFileItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleRemoteLabelChange = useCallback((id: string, value: string) => {
    setRemoteLabelOverrides((prev) => ({
      ...prev,
      [id]: value
    }));
  }, []);

  const parsedBatchUrlItems = useMemo(
    () =>
      batchUrlInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((url, index) => ({
          id: `remote-${index}-${url}`,
          url,
          label: deriveLabelFromUrl(url, index)
        })),
    [batchUrlInput]
  );
  useEffect(() => {
    setRemoteLabelOverrides((prev) => {
      const validIds = new Set(parsedBatchUrlItems.map((item) => item.id));
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, label]) => {
        if (validIds.has(id)) {
          next[id] = label;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [parsedBatchUrlItems]);
  const hasBatchPendingItems = batchFileItems.length > 0 || parsedBatchUrlItems.length > 0;

  const handleSingleStickerConfirm = useCallback(async () => {
    const trimmedUrl = stickerImageUrlInput.trim();
    const hasFile = Boolean(singleStickerFile);
    const hasUrl = trimmedUrl.length > 0;
    if (!hasFile && !hasUrl) {
      setStickerModalError('请先输入图片 URL 或选择本地图片');
      return;
    }
    if (hasFile && hasUrl) {
      setStickerModalError('图片 URL 与本地上传只能选择其一');
      return;
    }
    if (hasUrl && !isValidExternalUrl(trimmedUrl)) {
      setStickerModalError('请输入有效的图片 URL');
      return;
    }
    const fallbackLabel =
      hasFile && singleStickerFile
        ? deriveLabelFromFile(singleStickerFile)
        : deriveLabelFromUrl(trimmedUrl);
    const label = sanitizeLabel(stickerLabelInput, fallbackLabel);
    setStickerModalError(null);
    setIsSavingSticker(true);
    try {
      if (hasFile && singleStickerFile) {
        await addStickerToCatalog({
          label,
          url: createLocalStickerUrl(),
          source: 'upload',
          blobData: singleStickerFile
        });
      } else if (hasUrl) {
        await addStickerToCatalog({
          label,
          url: trimmedUrl,
          source: 'remote'
        });
      }
      closeStickerModal();
    } catch (err) {
      setStickerModalError(err instanceof Error ? err.message : '添加表情失败，请稍后重试');
    } finally {
      setIsSavingSticker(false);
    }
  }, [
    closeStickerModal,
    singleStickerFile,
    stickerImageUrlInput,
    stickerLabelInput
  ]);

  const handleBatchStickerConfirm = useCallback(async () => {
    if (batchFileItems.length === 0 && parsedBatchUrlItems.length === 0) {
      setStickerModalError('请至少添加一张图片或一个图片链接');
      return;
    }
    const invalidUrl = parsedBatchUrlItems.find((item) => !isValidExternalUrl(item.url));
    if (invalidUrl) {
      setStickerModalError('存在无效的图片 URL，请检查输入');
      return;
    }
    setStickerModalError(null);
    setIsBatchSaving(true);
    try {
      for (const item of batchFileItems) {
        await addStickerToCatalog({
          label: sanitizeLabel(item.label, deriveLabelFromFile(item.file)),
          url: createLocalStickerUrl(),
          source: 'upload',
          blobData: item.file
        });
      }
      for (const item of parsedBatchUrlItems) {
        const override = remoteLabelOverrides[item.id];
        await addStickerToCatalog({
          label: sanitizeLabel(override ?? item.label, deriveLabelFromUrl(item.url)),
          url: item.url,
          source: 'remote'
        });
      }
      closeStickerModal();
    } catch (err) {
      setStickerModalError(err instanceof Error ? err.message : '批量添加失败，请稍后重试');
    } finally {
      setIsBatchSaving(false);
    }
  }, [batchFileItems, parsedBatchUrlItems, remoteLabelOverrides, closeStickerModal]);


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

  const syncTextareaHeight = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    const minHeight = 38;
    const nextHeight = Math.max(textarea.scrollHeight, minHeight);
    textarea.style.height = `${nextHeight}px`;
  }, []);

  const updateSelectionRef = useCallback(
    (target?: HTMLTextAreaElement | null) => {
      const node = target ?? textareaRef.current;
      if (!node) {
        return;
      }
      const start = node.selectionStart ?? node.value.length;
      const end = node.selectionEnd ?? node.value.length;
      selectionRef.current = { start, end };
    },
    []
  );

  const focusTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      const { start, end } = selectionRef.current;
      try {
        textarea.setSelectionRange(start, end);
      } catch (error) {
        // Ignore errors in environments that do not support setSelectionRange
      }
      syncTextareaHeight(textarea);
    });
  }, [syncTextareaHeight]);

  useEffect(() => {
    if (!showMoreOptions) {
      setMoreOptionsView('default');
      setEmojiActiveTab('builtin');
    } else {
      focusTextarea();
    }
  }, [showMoreOptions, focusTextarea]);

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

  const clearStickerLongPress = useCallback(() => {
    if (stickerLongPressTimeoutRef.current !== null) {
      window.clearTimeout(stickerLongPressTimeoutRef.current);
      stickerLongPressTimeoutRef.current = null;
    }
  }, []);

  const startStickerLongPress = useCallback(
    (url: string) => {
      clearStickerLongPress();
      stickerLongPressTimeoutRef.current = window.setTimeout(() => {
        setStickerDeleteTarget(url);
        ignoreNextStickerClickRef.current = true;
        stickerLongPressTimeoutRef.current = null;
      }, 600);
    },
    [clearStickerLongPress]
  );

  useEffect(() => {
    return () => {
      clearStickerLongPress();
    };
  }, [clearStickerLongPress]);

  useEffect(() => {
    if (!stickerDeleteTarget) {
      return;
    }
    const handleClickOutside = () => {
      setStickerDeleteTarget(null);
      ignoreNextStickerClickRef.current = false;
    };
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [stickerDeleteTarget]);

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
    setMessageLimit(INITIAL_DISPLAY_COUNT);
  }, [contactId, exitSelectionMode, INITIAL_DISPLAY_COUNT]);

  const activeThread = useMemo(() => {
    if (!threads || !contactId) {
      return undefined;
    }
    return threads.find((thread) => thread.contactId === contactId);
  }, [threads, contactId]);
  const activeThreadId = activeThread?.id;

  const handleSendMockImage = useCallback(async () => {
    if (!activeThread || !contactId) {
      setError('请选择会话后再发送模拟图片');
      return;
    }
    const description = mockImageDescription.trim();
    if (description.length === 0) {
      return;
    }
    setError(null);
    try {
      setIsSendingMockImage(true);
      await persistMessage({
        threadId: activeThread.id,
        role: 'user',
        content: buildMockImageContent(description)
      });
      closeMockImageModal();
      setShowMoreOptions(false);
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : '发送模拟图片失败，请稍后重试';
      setError(messageText);
    } finally {
      setIsSendingMockImage(false);
    }
  }, [activeThread, contactId, mockImageDescription, closeMockImageModal]);

  const handleSendMockVoice = useCallback(async () => {
    if (!activeThread || !contactId) {
      setError('请选择会话后再发送语音消息');
      return;
    }
    const transcript = mockVoiceContent.trim();
    if (transcript.length === 0) {
      return;
    }
    setError(null);
    try {
      setIsSendingMockVoice(true);
      await persistMessage({
        threadId: activeThread.id,
        role: 'user',
        content: buildMockVoiceContent(transcript)
      });
      closeMockVoiceModal();
      setShowMoreOptions(false);
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : '发送语音消息失败，请稍后重试';
      setError(messageText);
    } finally {
      setIsSendingMockVoice(false);
    }
  }, [activeThread, contactId, mockVoiceContent, closeMockVoiceModal]);

  const messages = useLiveQuery<Message[]>(
    async () => {
      if (!contactId || !activeThread) {
        return [];
      }
      const recent = await db.messages
        .where('threadId')
        .equals(activeThread.id)
        .reverse()
        .limit(messageLimit)
        .toArray();
      recent.reverse();
      return recent;
    },
    [activeThread?.id, contactId, messageLimit]
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

  const displayableMessages = useMemo(() => visibleMessages, [visibleMessages]);

  const totalMessageCount = useLiveQuery(
    () =>
      activeThread?.id
        ? db.messages.where('threadId').equals(activeThread.id).count()
        : Promise.resolve(0),
    [activeThread?.id]
  );

  const hasMoreDisplayMessages = (totalMessageCount ?? 0) > messageLimit;

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

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      setShowLoadMoreHint(false);
      return;
    }
    const handleScroll = () => {
      setShowLoadMoreHint(container.scrollTop <= 0 && hasMoreDisplayMessages);
    };
    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [hasMoreDisplayMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      setShowLoadMoreHint(false);
      return;
    }
    const handleScroll = () => {
      setShowLoadMoreHint(container.scrollTop <= 0 && hasMoreDisplayMessages);
    };
    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [hasMoreDisplayMessages]);

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
      history,
      stickers: customStickers
    });

    return {
      currentTokens: tokenCount,
      tokenLimit
    };
  }, [
    activeContact,
    customStickers,
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
  const trimmedMockImageDescription = mockImageDescription.trim();
  const trimmedMockVoiceContent = mockVoiceContent.trim();
  const estimatedMockVoiceDuration = useMemo(
    () =>
      trimmedMockVoiceContent.length > 0
        ? estimateVoiceDurationSeconds(trimmedMockVoiceContent)
        : 0,
    [trimmedMockVoiceContent]
  );
  const hasApiKey = settings.apiKey.trim().length > 0;
  const canSummarizeLongMemory =
    Boolean(activeThread && messages && messages.length > 0 && hasApiKey);


  useEffect(() => {
    syncTextareaHeight(textareaRef.current);
  }, [inputValue, syncTextareaHeight]);

  useEffect(() => {
    updateSelectionRef(textareaRef.current);
  }, [updateSelectionRef]);

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    syncTextareaHeight(event.currentTarget);
    setInputValue(event.currentTarget.value);
    updateSelectionRef(event.currentTarget);
  };

  const handleTextareaSelectionEvent = useCallback(
    (event: { currentTarget: HTMLTextAreaElement }) => {
      updateSelectionRef(event.currentTarget);
    },
    [updateSelectionRef]
  );

  const insertTextAtCursor = useCallback(
    (text: string, options?: { prependNewLineIfNeeded?: boolean }) => {
      const { prependNewLineIfNeeded = false } = options ?? {};
      const textarea = textareaRef.current;
      const domStart = textarea?.selectionStart ?? selectionRef.current.start;
      const domEnd = textarea?.selectionEnd ?? selectionRef.current.end;
      setInputValue((prev) => {
        const length = prev.length;
        const start = Math.max(0, Math.min(domStart, length));
        const end = Math.max(0, Math.min(domEnd, length));
        let insertion = text;
        if (prependNewLineIfNeeded && start > 0 && prev[start - 1] !== '\n') {
          insertion = `\n${insertion}`;
        }
        const nextValue = `${prev.slice(0, start)}${insertion}${prev.slice(end)}`;
        const nextCaret = start + insertion.length;
        selectionRef.current = { start: nextCaret, end: nextCaret };
        requestAnimationFrame(() => {
          const node = textareaRef.current;
          if (!node) {
            return;
          }
          node.focus();
          try {
            node.setSelectionRange(nextCaret, nextCaret);
          } catch {
            // ignore selection errors
          }
          syncTextareaHeight(node);
          updateSelectionRef(node);
        });
        return nextValue;
      });
    },
    [syncTextareaHeight, updateSelectionRef]
  );

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
      const normalizedResponse = response.trim();
      const isVoiceMessage = parseMockVoiceContent(normalizedResponse) !== null;
      const isOfflineMode = activeContact?.interactionMode === 'offline';
      const segments = isVoiceMessage
        ? []
        : splitAssistantResponse(normalizedResponse, {
            mode: isOfflineMode ? 'offline' : 'default'
          });
      const parts =
        segments.length > 0 || isVoiceMessage
          ? isVoiceMessage
            ? [normalizedResponse]
            : segments
          : [normalizedResponse];

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
  }, [activeThreadId, contactId, settings.apiKey, clearAutoReplyTimer, activeContact?.interactionMode]);

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

  const handleSendCustomSticker = useCallback(
    async (stickerMarkdown: string) => {
      if (!activeThread || !contactId) {
        setError('请选择会话后再发送贴纸。');
        return false;
      }
      if (stickerMarkdown.trim().length === 0) {
        return false;
      }
      setError(null);
      try {
        await persistMessage({
          threadId: activeThread.id,
          role: 'user',
          content: stickerMarkdown
        });
        return true;
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : '发送贴纸失败，请稍后重试。';
        setError(messageText);
        return false;
      }
    },
    [activeThread, contactId]
  );

  const handleRemoveCustomSticker = useCallback(
    async (url: string) => {
      try {
        await removeStickerByUrl(url);
        if (stickerDeleteTarget === url) {
          setStickerDeleteTarget(null);
          ignoreNextStickerClickRef.current = false;
        }
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : '删除自定义表情失败，请稍后重试。';
        setError(messageText);
      }
    },
    [setError, stickerDeleteTarget]
  );

  const handleLoadMoreMessages = useCallback(() => {
    if (!hasMoreDisplayMessages) {
      setShowLoadMoreHint(false);
      return;
    }
    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;

    setMessageLimit((prev) => {
      const total = totalMessageCount ?? prev;
      const remaining = Math.max(0, total - prev);
      const increment = remaining === 0 ? PAGE_SIZE : Math.min(PAGE_SIZE, remaining);
      return Math.min(prev + increment, total);
    });
    setShowLoadMoreHint(false);

    requestAnimationFrame(() => {
      const node = messagesContainerRef.current;
      if (!node) {
        return;
      }
      const newScrollHeight = node.scrollHeight;
      const delta = newScrollHeight - previousScrollHeight;
      node.scrollTop = previousScrollTop + delta;
    });
  }, [hasMoreDisplayMessages, totalMessageCount, PAGE_SIZE]);


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
        selectionRef.current = { start: 0, end: 0 };
        syncTextareaHeight(textareaRef.current);
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

  const handleCreateContact = async (payload: CreateContactPayload) => {
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
    interactionMode: ContactInteractionMode;
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

  const renderCreateModal = createModalVariant ? (
    <CreateChatTargetModal
      variant={createModalVariant}
      onSubmit={handleCreateContact}
      onClose={handleCloseCreateModal}
      contacts={contacts ?? []}
    />
  ) : null;

  if (!contactId) {
    return (
      <>
        <ContactListScreen
          contacts={contacts ?? []}
          onSelect={handleSelectContact}
          onCreateContact={handleOpenContactModal}
          onCreateGroup={handleOpenGroupModal}
        />
        {renderCreateModal}
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
          onCreateContact={handleOpenContactModal}
          onCreateGroup={handleOpenGroupModal}
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
            {showLoadMoreHint && hasMoreDisplayMessages ? (
              <div className="sticky top-0 z-20 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMoreMessages}
                  className="rounded-full border border-white/30 bg-white/10 px-4 py-1 text-xs text-white/80 transition hover:border-white/60 hover:bg-white/20"
                >
                  加载更多
                </button>
              </div>
            ) : null}
            {visibleMessages.length > 0 ? (
              displayableMessages.map((message) => {
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
                        stickerSrcMap={stickerSrcMap}
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
                onMouseDown={(event) => {
                  event.preventDefault();
                  updateSelectionRef(textareaRef.current);
                }}
                onClick={() => {
                  setShowMoreOptions((prev) => !prev);
                  focusTextarea();
                }}
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
                onSelect={handleTextareaSelectionEvent}
                onKeyUp={handleTextareaSelectionEvent}
                onClick={handleTextareaSelectionEvent}
                onFocus={handleTextareaSelectionEvent}
                onBlur={handleTextareaSelectionEvent}
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
              <div className="rounded-3xl border border-white/15 bg-white/5 px-4 py-3 text-white/80">
                {moreOptionsView === 'default' ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        updateSelectionRef(textareaRef.current);
                      }}
                      onClick={() => {
                        setMoreOptionsView('emoji');
                        setEmojiActiveTab('builtin');
                        focusTextarea();
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-xs transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                      title="表情"
                    >
                      <svg aria-hidden="true" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <use xlinkHref="#icon-emoji" />
                      </svg>
                      <span className="sr-only">表情</span>
                    </button>
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
                        <svg aria-hidden="true" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <use xlinkHref="#icon-huizong" />
                        </svg>
                      )}
                      <span className="sr-only">总结前文</span>
                    </button>
                    <button
                      type="button"
                      onClick={openMockImageModal}
                      disabled={!activeThread}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-xs transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                      title="模拟图片"
                    >
                      <svg aria-hidden="true" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <use xlinkHref="#icon-photo-copy" />
                      </svg>
                      <span className="sr-only">模拟图片</span>
                    </button>
                    <button
                      type="button"
                      onClick={openMockVoiceModal}
                      disabled={!activeThread}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-xs transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                      title="语音"
                    >
                      <svg aria-hidden="true" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <use xlinkHref="#icon-maikefeng" />
                      </svg>
                      <span className="sr-only">语音</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex rounded-full bg-white/10 p-1 text-xs text-white/70">
                        <button
                          type="button"
                          onClick={() => setEmojiActiveTab('builtin')}
                          className={`rounded-full px-3 py-1 transition ${
                            emojiActiveTab === 'builtin' ? 'bg-white/25 text-white' : 'text-white/70'
                          }`}
                        >
                          默认表情
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmojiActiveTab('custom')}
                          className={`rounded-full px-3 py-1 transition ${
                            emojiActiveTab === 'custom' ? 'bg-white/25 text-white' : 'text-white/70'
                          }`}
                        >
                          自定义
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={openStickerModal}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/90 transition hover:border-white/40 hover:bg-white/10"
                        >
                          添加
                        </button>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            updateSelectionRef(textareaRef.current);
                          }}
                          onClick={() => {
                            setMoreOptionsView('default');
                            focusTextarea();
                          }}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/10"
                        >
                          返回
                        </button>
                      </div>
                    </div>
                    {emojiActiveTab === 'builtin' ? (
                      <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-white/10 p-2">
                        <div className="grid grid-cols-8 gap-1 text-xl">
                          {BUILTIN_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault();
                                insertTextAtCursor(emoji);
                                focusTextarea();
                                setShowMoreOptions(false);
                              }}
                              className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/20"
                            >
                              <span>{emoji}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : customStickers.length > 0 ? (
                      <div className="flex max-h-52 overflow-y-auto gap-3" style={{ flexWrap: 'wrap' }}>
                        {customStickers.map((sticker) => {
                          const snippet = `[${sticker.label}](${sticker.url})`;
                          const previewSrc = stickerSrcMap.get(sticker.url) ?? sticker.url;
                          return (
                            <div key={sticker.url} className="relative flex flex-col items-center text-sm text-white/90">
                              <button
                                type="button"
                                onMouseDown={(event) => {
                                  startStickerLongPress(sticker.url);
                                  event.preventDefault();
                                }}
                                onMouseUp={clearStickerLongPress}
                                onMouseLeave={clearStickerLongPress}
                                onTouchStart={() => startStickerLongPress(sticker.url)}
                                onTouchEnd={clearStickerLongPress}
                                onTouchCancel={clearStickerLongPress}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  ignoreNextStickerClickRef.current = false;
                                  setStickerDeleteTarget(sticker.url);
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  if (ignoreNextStickerClickRef.current) {
                                    ignoreNextStickerClickRef.current = false;
                                    return;
                                  }
                                  if (stickerDeleteTarget) {
                                    setStickerDeleteTarget(null);
                                    ignoreNextStickerClickRef.current = false;
                                    return;
                                  }
                                  clearStickerLongPress();
                                  void (async () => {
                                    const ok = await handleSendCustomSticker(snippet);
                                    if (ok) {
                                      setShowMoreOptions(false);
                                    }
                                    focusTextarea();
                                  })();
                                }}
                                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white/15 transition hover:bg-white/25"
                              >
                                <img
                                  src={previewSrc}
                                  alt={sticker.label}
                                  className="h-16 w-16 object-cover"
                                  loading="lazy"
                                  draggable={false}
                                />
                              </button>
                              <div className="mt-1 max-w-16 truncate text-xs">{sticker.label}</div>
                              {stickerDeleteTarget === sticker.url ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRemoveCustomSticker(sticker.url);
                                  }}
                                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white shadow-lg"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/20 px-4 py-8 text-center text-xs text-white/70">
                        暂无自定义表情
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
              </>
            )}
          </footer>
        </section>
      </div>

      {renderCreateModal}

      {isStickerModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={closeStickerModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-white shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">添加自定义表情</h3>
                <p className="text-sm text-white/70">支持网络图片或本地图片（本地图片将以 Blob 形式保存在离线数据库中）。</p>
              </div>
              <div className="flex rounded-full bg-white/10 p-1 text-xs text-white/70">
                <button
                  type="button"
                  onClick={() => setStickerModalTab('single')}
                  className={`rounded-full px-3 py-1 transition ${
                    stickerModalTab === 'single' ? 'bg-white/25 text-white' : 'text-white/70'
                  }`}
                >
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => setStickerModalTab('batch')}
                  className={`rounded-full px-3 py-1 transition ${
                    stickerModalTab === 'batch' ? 'bg-white/25 text-white' : 'text-white/70'
                  }`}
                >
                  批量添加
                </button>
              </div>
            </div>

            {stickerModalError ? (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                {stickerModalError}
              </div>
            ) : null}

            {stickerModalTab === 'single' ? (
              <div className="mt-5 space-y-5">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex h-28 w-full flex-none items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 sm:h-40 sm:w-40">
                    {singleStickerPreviewUrl ? (
                      <img
                        src={singleStickerPreviewUrl}
                        alt="预览"
                        className="max-h-full max-w-full rounded-2xl object-contain"
                      />
                    ) : stickerImageUrlInput.trim() ? (
                      <img
                        src={stickerImageUrlInput.trim()}
                        alt="预览"
                        className="max-h-full max-w-full rounded-2xl object-contain"
                      />
                    ) : (
                      <span className="text-xs text-white/60">图片预览</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-4">
                    <label className="text-sm text-white/80">
                      表情标签
                      <input
                        value={stickerLabelInput}
                        onChange={(event) => setStickerLabelInput(event.target.value)}
                        placeholder="例如：开心、可爱等"
                        className="mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/15"
                      />
                    </label>
                    <label className="text-sm text-white/80">
                      图片 URL
                      <input
                        value={stickerImageUrlInput}
                        onChange={(event) => {
                          setStickerImageUrlInput(event.target.value);
                          if (event.target.value.trim().length > 0) {
                            clearSingleStickerSelection();
                          }
                          setStickerModalError(null);
                        }}
                        placeholder="https://example.com/sticker.png"
                        className="mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/15"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => singleStickerFileInputRef.current?.click()}
                    className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
                  >
                    从本地上传
                  </button>
                  {singleStickerFile ? (
                    <span className="text-xs text-white/60">已选择：{singleStickerFile.name}</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeStickerModal}
                    className="flex-1 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={handleSingleStickerConfirm}
                    disabled={
                      isSavingSticker ||
                      (!singleStickerFile && stickerImageUrlInput.trim().length === 0)
                    }
                    className="flex-1 rounded-2xl bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-300/40 disabled:text-slate-600"
                  >
                    {isSavingSticker ? '保存中...' : '确认'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  {hasBatchPendingItems ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {batchFileItems.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-xs text-white/80">
                          <div className="relative mb-2 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                            <img src={item.previewUrl} alt={item.label} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveBatchFileItem(item.id)}
                              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-semibold text-white"
                            >
                              ×
                            </button>
                          </div>
                          <label className="block text-[11px] text-white/60">
                            表情标签
                            <input
                              type="text"
                              value={item.label}
                              onChange={(event) => handleBatchFileLabelChange(item.id, event.target.value)}
                              className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-2 py-1 text-xs text-white outline-none transition focus:border-white/40 focus:bg-white/15"
                              placeholder="输入标签"
                            />
                          </label>
                          <p className="mt-1 truncate text-[11px] text-white/50">{item.file.name}</p>
                        </div>
                      ))}
                      {parsedBatchUrlItems.map((item) => {
                        const valid = isValidExternalUrl(item.url);
                        const labelValue = remoteLabelOverrides[item.id] ?? item.label;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-2xl border p-2 text-xs ${
                              valid ? 'border-white/10 bg-white/5 text-white/80' : 'border-red-500/40 bg-red-500/10 text-red-100'
                            }`}
                          >
                            <div className="mb-2 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                              {valid ? (
                                <img src={item.url} alt={labelValue} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[11px] text-red-200">无效 URL</span>
                              )}
                            </div>
                            <label className="block text-[11px]">
                              表情标签
                              <input
                                type="text"
                                value={labelValue}
                                onChange={(event) => handleRemoteLabelChange(item.id, event.target.value)}
                                disabled={!valid}
                                className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-2 py-1 text-xs text-white outline-none transition focus:border-white/40 focus:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="输入标签"
                              />
                            </label>
                            <p className="mt-1 break-all text-[11px] opacity-70">{item.url}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/20 px-4 py-8 text-center text-sm text-white/60">
                      还没有待添加的表情，请选择本地图片或输入图片链接。
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => batchStickerFileInputRef.current?.click()}
                    className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
                  >
                    从本地选择图片
                  </button>
                  <span className="text-xs text-white/60">可一次选择多张图片，上传后可单独命名或删除。</span>
                </div>
                <label className="block text-sm text-white/80">
                  图片 URL（使用英文逗号分隔）
                  <textarea
                    value={batchUrlInput}
                    onChange={(event) => {
                      setBatchUrlInput(event.target.value);
                      setStickerModalError(null);
                    }}
                    rows={3}
                    placeholder="https://a.example.com/a.png, https://b.example.com/b.png"
                    className="mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:bg-white/15"
                  />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeStickerModal}
                    className="flex-1 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchStickerConfirm}
                    disabled={isBatchSaving || !hasBatchPendingItems}
                    className="flex-1 rounded-2xl bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-300/40 disabled:text-slate-600"
                  >
                    {isBatchSaving ? '导入中...' : '确认'}
                  </button>
                </div>
              </div>
            )}

            <input
              ref={singleStickerFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleSingleStickerFileChange}
            />
            <input
              ref={batchStickerFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleBatchFilesChange}
            />
          </div>
        </div>
      ) : null}

      {isMockImageModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={closeMockImageModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-5 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <label className="block text-sm text-white/80">
              图片描述
              <textarea
                value={mockImageDescription}
                onChange={(event) => setMockImageDescription(event.target.value)}
                rows={3}
                placeholder="输入图片描述"
                className="mt-2 w-full resize-none rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
                autoFocus
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeMockImageModal}
                className="flex-1 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSendMockImage}
                disabled={trimmedMockImageDescription.length === 0 || isSendingMockImage}
                className="flex-1 rounded-2xl bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-300/40 disabled:text-slate-600"
              >
                {isSendingMockImage ? '发送中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isMockVoiceModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={closeMockVoiceModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-5 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <label className="block text-sm text-white/80">
              语音内容
              <textarea
                value={mockVoiceContent}
                onChange={(event) => setMockVoiceContent(event.target.value)}
                rows={3}
                placeholder="输入语音内容"
                className="mt-2 w-full resize-none rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white outline-none transition focus:border-white/40 focus:bg-white/15"
                autoFocus
              />
            </label>
            {trimmedMockVoiceContent.length > 0 ? (
              <p className="mt-3 text-xs text-white/60">
                预计语音时长：{estimatedMockVoiceDuration} 秒
              </p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeMockVoiceModal}
                className="flex-1 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSendMockVoice}
                disabled={trimmedMockVoiceContent.length === 0 || isSendingMockVoice}
                className="flex-1 rounded-2xl bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-300/40 disabled:text-slate-600"
              >
                {isSendingMockVoice ? '发送中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
