export const CONTACT_ICON_OPTIONS = [
  'icon-a-Group33',
  'icon-a-Group37',
  'icon-a-Group45',
  'icon-a-Group46',
  'icon-baimao',
  'icon-baimao1',
  'icon-bianmu',
  'icon-bosimao',
  'icon-boxuemao',
  'icon-buoumao',
  'icon-cangao',
  'icon-cangshu',
  'icon-chaiquan',
  'icon-fadou',
  'icon-gengduomaochong',
  'icon-gengduomengchong',
  'icon-gengduoquanzhong',
  'icon-hashiqi',
  'icon-heimao',
  'icon-heimao1',
  'icon-helanzhu',
  'icon-huangmao',
  'icon-jinmao',
  'icon-jumao',
  'icon-kedaya',
  'icon-keji',
  'icon-lachangquan',
  'icon-lanmao',
  'icon-lihuamao',
  'icon-mao',
  'icon-mianyinmao',
  'icon-mimiyanmao',
  'icon-nainiumao',
  'icon-niunaimao',
  'icon-sanhuamao',
  'icon-sanhuamao1',
  'icon-shamao',
  'icon-tianyuanmao',
  'icon-tianyuanquan',
  'icon-wumaomao',
  'icon-wumaomao1',
  'icon-xianluomao',
  'icon-xianluomao1',
  'icon-yang',
  'icon-yingduanmao'
] as const;

export type ContactIconName = (typeof CONTACT_ICON_OPTIONS)[number];

export const getRandomContactIcon = (): ContactIconName => {
  const index = Math.floor(Math.random() * CONTACT_ICON_OPTIONS.length);
  return CONTACT_ICON_OPTIONS[index];
};
