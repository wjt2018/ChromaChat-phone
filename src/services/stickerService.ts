import { db, type StickerRecord } from './db';
import type { CustomSticker } from '../constants/customStickers';

const mapRecordToSticker = ({ label, url }: StickerRecord): CustomSticker => ({
  label,
  url
});

export const getStickerCatalog = async (): Promise<CustomSticker[]> => {
  const records = await db.stickers.orderBy('createdAt').toArray();
  return records.map(mapRecordToSticker);
};

export const removeStickerByUrl = async (url: string) => {
  await db.stickers.delete(url);
};

export const addStickerToCatalog = async (sticker: CustomSticker) => {
  await db.stickers.put({
    ...sticker,
    createdAt: Date.now()
  });
};
