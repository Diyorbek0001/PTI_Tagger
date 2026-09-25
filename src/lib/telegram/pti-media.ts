type Photo = { file_id: string };
type Video = { file_id: string };
export type PtiMedia = { type: 'photo' | 'video'; fileId: string };

export function extractPtiMedia(message: { photo?: Photo[]; video?: Video } | undefined): PtiMedia | null {
  if (!message) return null;
  if (message.video) return { type: 'video', fileId: message.video.file_id };
  const largestPhoto = message.photo?.at(-1);
  return largestPhoto ? { type: 'photo', fileId: largestPhoto.file_id } : null;
}
