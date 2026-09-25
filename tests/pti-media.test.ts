import { describe, expect, it } from 'vitest';
import { extractPtiMedia } from '../src/lib/telegram/pti-media';

describe('PTI media extraction', () => {
  it('selects a video', () => expect(extractPtiMedia({ video: { file_id: 'video-1' } })).toEqual({ type: 'video', fileId: 'video-1' }));
  it('selects the largest photo', () => expect(extractPtiMedia({ photo: [{ file_id: 'small' }, { file_id: 'large' }] })).toEqual({ type: 'photo', fileId: 'large' }));
  it('rejects non-media replies', () => expect(extractPtiMedia({})).toBeNull());
});
