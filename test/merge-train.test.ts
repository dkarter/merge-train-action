import { describe, expect, it } from 'vitest';
import { runMergeTrain } from '../src/merge-train';

describe('runMergeTrain', () => {
  it('returns a status message containing the target label', async () => {
    const result = await runMergeTrain('merge-train');

    expect(result).toEqual({
      label: 'merge-train',
      message: 'Merge train bootstrap complete for label: merge-train'
    });
  });
});
