export const CONTACT_ICON_OPTIONS = [
  'icon-mianyinmao',
  'icon-wumaomao',
  'icon-lihuamao',
  'icon-sanhuamao',
  'icon-tianyuanmao',
  'icon-yingduanmao',
  'icon-xianluomao',
  'icon-bosimao',
  'icon-baimao',
  'icon-shamao',
  'icon-mimiyanmao',
  'icon-mao',
  'icon-boxuemao',
  'icon-a-Group46',
  'icon-a-Group33',
  'icon-a-Group37',
  'icon-a-Group45',
  'icon-heimao',
  'icon-huangmao',
  'icon-niunaimao'
] as const;

export type ContactIconName = (typeof CONTACT_ICON_OPTIONS)[number];

export const getRandomContactIcon = (): ContactIconName => {
  const index = Math.floor(Math.random() * CONTACT_ICON_OPTIONS.length);
  return CONTACT_ICON_OPTIONS[index];
};
