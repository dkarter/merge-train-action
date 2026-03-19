import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_NAME, runMergeTrain } from '../src/merge-train';

describe('runMergeTrain', () => {
  it('uses the default configured label name constant', () => {
    expect(DEFAULT_LABEL_NAME).toBe('ready-to-merge');
  });

  it('is eligible when pull request already has configured label', async () => {
    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: {
        pull_request: {
          labels: [{ name: 'ready-to-merge' }, { name: 'bug' }]
        }
      }
    });

    expect(result).toEqual({
      eligible: true,
      labelName: 'ready-to-merge',
      message:
        "Merge train trigger eligible: pull request already has label 'ready-to-merge'."
    });
  });

  it('is eligible when labeled action adds the configured label', async () => {
    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'labeled',
      labelName: 'ready-to-merge',
      payload: {
        label: { name: 'ready-to-merge' },
        pull_request: {
          labels: [{ name: 'bug' }]
        }
      }
    });

    expect(result).toEqual({
      eligible: true,
      labelName: 'ready-to-merge',
      message:
        "Merge train trigger eligible: added label 'ready-to-merge' matches configuration."
    });
  });

  it('is a no-op when pull request does not have configured label', async () => {
    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'opened',
      labelName: 'ready-to-merge',
      payload: {
        pull_request: {
          labels: [{ name: 'bug' }]
        }
      }
    });

    expect(result).toEqual({
      eligible: false,
      labelName: 'ready-to-merge',
      message:
        "No-op: pull request is not labeled 'ready-to-merge' for event action 'opened'."
    });
  });

  it('is a no-op for non pull_request events', async () => {
    const result = await runMergeTrain({
      eventName: 'push',
      eventAction: undefined,
      labelName: 'ready-to-merge',
      payload: {}
    });

    expect(result).toEqual({
      eligible: false,
      labelName: 'ready-to-merge',
      message:
        "No-op: event 'push' is not supported. Waiting for pull_request events."
    });
  });
});
