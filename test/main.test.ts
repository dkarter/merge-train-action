import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  info: vi.fn(),
  getInput: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  runMergeTrain: vi.fn(),
  readFileSync: vi.fn()
}));

vi.mock('@actions/core', () => ({
  info: mocked.info,
  getInput: mocked.getInput,
  setFailed: mocked.setFailed,
  setOutput: mocked.setOutput
}));

vi.mock('node:fs', () => ({
  readFileSync: mocked.readFileSync
}));

vi.mock('../src/merge-train', () => ({
  DEFAULT_LABEL_NAME: 'ready-to-merge',
  runMergeTrain: mocked.runMergeTrain
}));

import { run } from '../src/main';

describe('run', () => {
  beforeEach(() => {
    mocked.info.mockReset();
    mocked.getInput.mockReset();
    mocked.setFailed.mockReset();
    mocked.setOutput.mockReset();
    mocked.runMergeTrain.mockReset();
    mocked.readFileSync.mockReset();

    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    mocked.readFileSync.mockReturnValue(
      JSON.stringify({
        action: 'opened',
        pull_request: {
          labels: [{ name: 'ready-to-merge' }]
        }
      })
    );
  });

  it('uses default config and emits outputs when eligible', async () => {
    mocked.getInput.mockReturnValue('');
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      labelName: 'ready-to-merge',
      message:
        "Merge train trigger eligible: pull request already has label 'ready-to-merge'."
    });

    await run();

    expect(mocked.getInput).toHaveBeenNthCalledWith(1, 'label-name');
    expect(mocked.getInput).toHaveBeenNthCalledWith(2, 'rerun-failed-checks');
    expect(mocked.runMergeTrain).toHaveBeenCalledWith({
      eventAction: 'opened',
      eventName: 'pull_request',
      labelName: 'ready-to-merge',
      payload: {
        action: 'opened',
        pull_request: {
          labels: [{ name: 'ready-to-merge' }]
        }
      }
    });
    expect(mocked.info).toHaveBeenCalledWith(
      "Merge train trigger eligible: pull request already has label 'ready-to-merge'."
    );
    expect(mocked.info).toHaveBeenCalledWith(
      'Rerun toggle is disabled (stub only).'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith(
      'label-name',
      'ready-to-merge'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'ok');
    expect(mocked.setFailed).not.toHaveBeenCalled();
  });

  it('respects custom label input and returns noop status', async () => {
    mocked.getInput.mockImplementation((name: string) => {
      if (name === 'label-name') {
        return 'queue-me';
      }

      if (name === 'rerun-failed-checks') {
        return 'true';
      }

      return '';
    });
    mocked.runMergeTrain.mockResolvedValue({
      eligible: false,
      labelName: 'queue-me',
      message:
        "No-op: pull request is not labeled 'queue-me' for event action 'opened'."
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith({
      eventAction: 'opened',
      eventName: 'pull_request',
      labelName: 'queue-me',
      payload: {
        action: 'opened',
        pull_request: {
          labels: [{ name: 'ready-to-merge' }]
        }
      }
    });
    expect(mocked.info).toHaveBeenCalledWith(
      'Rerun toggle is enabled (stub only).'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith('label-name', 'queue-me');
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'noop');
    expect(mocked.setFailed).not.toHaveBeenCalled();
  });

  it('sets failed when merge-train execution throws', async () => {
    mocked.getInput.mockReturnValue('ready-to-merge');
    mocked.runMergeTrain.mockRejectedValue(new Error('boom'));

    await run();

    expect(mocked.setFailed).toHaveBeenCalledWith('boom');
  });
});
