import { describe, expect, it } from 'vitest';
import { extractPtiMedia } from '../src/lib/telegram/pti-media';

describe('PTI media extraction', () => {
  it('selects a video', () => expect(extractPtiMedia({ video: { file_id: 'video-1' } })).toEqual({ type: 'video', fileId: 'video-1' }));
  it('selects the largest photo', () => expect(extractPtiMedia({ photo: [{ file_id: 'small' }, { file_id: 'large' }] })).toEqual({ type: 'photo', fileId: 'large' }));
  it('accepts GIF animations and video notes', () => {
    expect(extractPtiMedia({ animation: { file_id: 'gif-1', mime_type: 'image/gif' } })).toEqual({ type: 'photo', fileId: 'gif-1' });
    expect(extractPtiMedia({ video_note: { file_id: 'note-1' } })).toEqual({ type: 'video', fileId: 'note-1' });
  });
  it('accepts image and video files sent as documents', () => {
    expect(extractPtiMedia({ document: { file_id: 'png-1', mime_type: 'image/png', file_name: 'truck.png' } })).toEqual({ type: 'photo', fileId: 'png-1' });
    expect(extractPtiMedia({ document: { file_id: 'mov-1', file_name: 'inspection.mov' } })).toEqual({ type: 'video', fileId: 'mov-1' });
  });
  it('rejects non-media replies', () => expect(extractPtiMedia({})).toBeNull());
});
