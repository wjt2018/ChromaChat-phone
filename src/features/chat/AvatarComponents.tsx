import { useEffect, useState } from 'react';

import { Contact } from '../../services/db';
import { ContactIconName } from '../../constants/icons';

export type UserProfile = {
  name: string;
  avatarColor: string;
  avatarIcon?: string;
  avatarUrl?: string;
};

export const ContactAvatar = ({
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

export const UserAvatar = ({
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

export const AssistantAvatar = ({
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
