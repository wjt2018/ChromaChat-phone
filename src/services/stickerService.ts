import { db, type StickerRecord } from './db';
import type { CustomSticker } from '../constants/customStickers';

export const LOCAL_STICKER_SCHEME = 'chroma-sticker://';

export const createLocalStickerUrl = () => `${LOCAL_STICKER_SCHEME}${crypto.randomUUID()}`;

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

export type StickerCatalogInput = CustomSticker & {
  source?: 'remote' | 'upload';
  blobData?: Blob | null;
};

export const addStickerToCatalog = async (sticker: StickerCatalogInput) => {
  await db.stickers.put({
    ...sticker,
    blobData: sticker.blobData ?? undefined,
    createdAt: Date.now()
  });
};
