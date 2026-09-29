type Photo = { file_id: string };
type Video = { file_id: string };
type Animation = { file_id: string; mime_type?: string };
type VideoNote = { file_id: string };
type Document = { file_id: string; mime_type?: string; file_name?: string };
export type PtiMedia = { type: 'photo' | 'video'; fileId: string };

const imageExtensions = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp']);
const videoExtensions = new Set(['3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm', 'wmv']);

export function extractPtiMedia(message: { photo?: Photo[]; video?: Video; video_note?: VideoNote; animation?: Animation; document?: Document } | undefined): PtiMedia | null {
  if (!message) return null;
  if (message.video) return { type: 'video', fileId: message.video.file_id };
  if (message.video_note) return { type: 'video', fileId: message.video_note.file_id };
  if (message.animation) return { type: message.animation.mime_type?.startsWith('video/') ? 'video' : 'photo', fileId: message.animation.file_id };
  const largestPhoto = message.photo?.at(-1);
  if (largestPhoto) return { type: 'photo', fileId: largestPhoto.file_id };
  if (!message.document) return null;
  const mime = message.document.mime_type?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return { type: 'photo', fileId: message.document.file_id };
  if (mime.startsWith('video/')) return { type: 'video', fileId: message.document.file_id };
  const extension = message.document.file_name?.split('.').pop()?.toLowerCase();
  if (extension && imageExtensions.has(extension)) return { type: 'photo', fileId: message.document.file_id };
  if (extension && videoExtensions.has(extension)) return { type: 'video', fileId: message.document.file_id };
  return null;
}
