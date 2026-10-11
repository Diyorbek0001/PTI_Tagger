import { describe, expect, it } from 'vitest';
import { matchesSearch } from '@/lib/search';

describe('matchesSearch', () => {
  const submission = {
    pti_reference:'PTI-000231', unit_number:'7945', company:'John Fleet', media_type:'video',
    source_chat_title:'Unit 7945 - John', status:'pending_review', created_at:'2026-10-11T16:30:00.000Z',
  };

  it.each([
    ['pti id', '000231'], ['unit', '7945'], ['company', 'john fleet'], ['media', 'video'],
    ['group', 'unit 7945 - john'], ['status', 'PENDING'], ['ISO date', '2026-10-11'],
    ['localized date', '10/11/2026'],
  ])('searches across nested record fields (%s)', (_label, query) => {
    expect(matchesSearch(submission, query)).toBe(true);
  });

  it('searches nested report data and treats blank search as a match', () => {
    expect(matchesSearch({current_assignment:{unit_number:'7945',company:'John Fleet'}}, 'John Fleet')).toBe(true);
    expect(matchesSearch(submission, '')).toBe(true);
    expect(matchesSearch(submission, 'not present')).toBe(false);
  });
});
