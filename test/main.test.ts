import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  info: vi.fn(),
  getInput: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  createGitHubClient: vi.fn(),
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
  DEFAULT_POLL_INTERVAL_SECONDS: 15,
  DEFAULT_LABEL_NAME: 'ready-to-merge',
  DEFAULT_WAIT_TIMEOUT_SECONDS: 600,
  runMergeTrain: mocked.runMergeTrain
}));

vi.mock('../src/github-client', () => ({
  createGitHubClient: mocked.createGitHubClient
}));

import { run } from '../src/main';

describe('run', () => {
  beforeEach(() => {
    mocked.info.mockReset();
    mocked.getInput.mockReset();
    mocked.setFailed.mockReset();
    mocked.setOutput.mockReset();
    mocked.createGitHubClient.mockReset();
    mocked.runMergeTrain.mockReset();
    mocked.readFileSync.mockReset();

    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    vi.stubEnv('GITHUB_TOKEN', 'gh-token');
    mocked.createGitHubClient.mockReturnValue({});
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
      status: 'merged',
      labelName: 'ready-to-merge',
      message:
        'Merged: pull request #9 merged after required checks succeeded.',
      logs: ['Transition: required checks succeeded.']
    });

    await run();

    expect(mocked.getInput).toHaveBeenNthCalledWith(1, 'label-name');
    expect(mocked.getInput).toHaveBeenNthCalledWith(2, 'rerun-failed-checks');
    expect(mocked.getInput).toHaveBeenNthCalledWith(3, 'wait-timeout-seconds');
    expect(mocked.getInput).toHaveBeenNthCalledWith(4, 'poll-interval-seconds');
    expect(mocked.getInput).toHaveBeenNthCalledWith(5, 'github-token');
    expect(mocked.createGitHubClient).toHaveBeenCalledWith('gh-token');
    expect(mocked.runMergeTrain).toHaveBeenCalledWith({
      eventAction: 'opened',
      eventName: 'pull_request',
      githubClient: {},
      labelName: 'ready-to-merge',
      pollIntervalSeconds: 15,
      payload: {
        action: 'opened',
        pull_request: {
          labels: [{ name: 'ready-to-merge' }]
        }
      },
      waitTimeoutSeconds: 600
    });
    expect(mocked.info).toHaveBeenCalledWith(
      'Transition: required checks succeeded.'
    );
    expect(mocked.info).toHaveBeenCalledWith(
      'Merged: pull request #9 merged after required checks succeeded.'
    );
    expect(mocked.info).toHaveBeenCalledWith(
      'Rerun toggle is disabled (stub only).'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith(
      'label-name',
      'ready-to-merge'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'merged');
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
      eligible: true,
      status: 'noop',
      labelName: 'queue-me',
      message: "No-op: pull request #9 is 'closed', not open.",
      logs: ["Transition: No-op: pull request #9 is 'closed', not open."]
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith({
      eventAction: 'opened',
      eventName: 'pull_request',
      githubClient: {},
      labelName: 'queue-me',
      pollIntervalSeconds: 15,
      payload: {
        action: 'opened',
        pull_request: {
          labels: [{ name: 'ready-to-merge' }]
        }
      },
      waitTimeoutSeconds: 600
    });
    expect(mocked.info).toHaveBeenCalledWith(
      'Rerun toggle is enabled (stub only).'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith('label-name', 'queue-me');
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'noop');
    expect(mocked.setFailed).not.toHaveBeenCalled();
  });

  it('sets failed when merge-train execution throws', async () => {
    mocked.getInput.mockImplementation((name: string) => {
      if (name === 'github-token') {
        return '';
      }

      return 'ready-to-merge';
    });
    mocked.runMergeTrain.mockRejectedValue(new Error('boom'));

    await run();

    expect(mocked.setFailed).toHaveBeenCalledWith('boom');
  });

  it('sets failed when no token is provided', async () => {
    mocked.getInput.mockImplementation((name: string) => {
      if (name === 'label-name') {
        return 'ready-to-merge';
      }

      if (name === 'github-token') {
        return '';
      }

      return '';
    });
    vi.stubEnv('GITHUB_TOKEN', '');

    await run();

    expect(mocked.setFailed).toHaveBeenCalledWith(
      'Missing GitHub token. Set input github-token or GITHUB_TOKEN.'
    );
    expect(mocked.runMergeTrain).not.toHaveBeenCalled();
  });
});
