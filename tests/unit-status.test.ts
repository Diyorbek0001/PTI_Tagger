import { describe, expect, it } from 'vitest';
import { groupNeedsReassignment } from '../src/lib/unit-status';

describe('groupNeedsReassignment', () => {
  it.each(['Unit 42 Inactive', 'HOMETIME - 6304', 'Driver terminated'])('flags %s', title => {
    expect(groupNeedsReassignment(title)).toBe(true);
  });

  it('does not flag a normal group', () => {
    expect(groupNeedsReassignment('PTI Unit 6304')).toBe(false);
  });
});
