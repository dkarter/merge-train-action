import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  getInput: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn()
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}));

vi.mock('../src/merge-train', () => ({
  DEFAULT_POLL_INTERVAL_SECONDS: 15,
  DEFAULT_LABEL_NAME: 'ready-to-merge',
  DEFAULT_WAIT_TIMEOUT_SECONDS: 600,
  runMergeTrain: vi.fn()
}));

vi.mock('../src/github-client', () => ({
  createGitHubClient: vi.fn()
}));

import * as core from '@actions/core';
import * as fs from 'node:fs';
import { createGitHubClient } from '../src/github-client';
import { runMergeTrain } from '../src/merge-train';
import { run } from '../src/main';

const mocked = {
  info: vi.mocked(core.info),
  getInput: vi.mocked(core.getInput),
  setFailed: vi.mocked(core.setFailed),
  setOutput: vi.mocked(core.setOutput),
  createGitHubClient: vi.mocked(createGitHubClient),
  runMergeTrain: vi.mocked(runMergeTrain),
  readFileSync: vi.mocked(fs.readFileSync)
};

const eventPayload = {
  action: 'opened',
  pull_request: {
    labels: [{ name: 'ready-to-merge' }]
  }
};

const mockInputs = (overrides: Record<string, string>, fallback = ''): void => {
  const resolvedInputs: Record<string, string> = {
    token: 'gh-token',
    ...overrides
  };
  mocked.getInput.mockImplementation(
    (name: string) => resolvedInputs[name] ?? fallback
  );
};

const githubClient = {} as ReturnType<typeof createGitHubClient>;

const buildRunMergeTrainArgs = (overrides: Record<string, unknown> = {}) => ({
  eventAction: 'opened',
  eventName: 'pull_request',
  githubClient,
  labelName: 'ready-to-merge',
  pollIntervalSeconds: 15,
  payload: eventPayload,
  rerunFailedChecks: true,
  trustAuthorAllowlist: [],
  trustMinAuthorAssociation: '',
  trustRequireApprovedReview: false,
  trustSameRepoOnly: true,
  autoDeleteSourceBranch: false,
  waitTimeoutSeconds: 600,
  ...overrides
});

const expectDefaultInputCalls = (): void => {
  expect(mocked.getInput).toHaveBeenNthCalledWith(1, 'label-name');
  expect(mocked.getInput).toHaveBeenNthCalledWith(2, 'pause');
  expect(mocked.getInput).toHaveBeenNthCalledWith(3, 'pause-reason');
  expect(mocked.getInput).toHaveBeenNthCalledWith(4, 'rerun-failed-checks');
  expect(mocked.getInput).toHaveBeenNthCalledWith(5, 'wait-timeout-seconds');
  expect(mocked.getInput).toHaveBeenNthCalledWith(6, 'poll-interval-seconds');
  expect(mocked.getInput).toHaveBeenNthCalledWith(7, 'trust-same-repo-only');
  expect(mocked.getInput).toHaveBeenNthCalledWith(
    8,
    'trust-min-author-association'
  );
  expect(mocked.getInput).toHaveBeenNthCalledWith(9, 'trust-author-allowlist');
  expect(mocked.getInput).toHaveBeenNthCalledWith(
    10,
    'trust-require-approved-review'
  );
  expect(mocked.getInput).toHaveBeenNthCalledWith(
    11,
    'auto-delete-source-branch'
  );
  expect(mocked.getInput).toHaveBeenNthCalledWith(12, 'token');
};

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
    mocked.createGitHubClient.mockReturnValue(githubClient);
    mocked.readFileSync.mockReturnValue(JSON.stringify(eventPayload));
  });

  it('uses default config and emits outputs when eligible', async () => {
    mockInputs({});
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      status: 'merged',
      labelName: 'ready-to-merge',
      message:
        'Merged: pull request #9 merged after required checks succeeded.',
      logs: ['Transition: required checks succeeded.']
    });

    await run();

    expectDefaultInputCalls();
    expect(mocked.createGitHubClient).toHaveBeenCalledWith('gh-token');
    expect(mocked.runMergeTrain).toHaveBeenCalledWith(buildRunMergeTrainArgs());
    expect(mocked.info).toHaveBeenCalledWith(
      'Transition: required checks succeeded.'
    );
    expect(mocked.info).toHaveBeenCalledWith(
      'Merged: pull request #9 merged after required checks succeeded.'
    );
    expect(mocked.info).toHaveBeenCalledWith('Rerun toggle is enabled.');
    expect(mocked.setOutput).toHaveBeenCalledWith(
      'label-name',
      'ready-to-merge'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'merged');
    expect(mocked.setFailed).not.toHaveBeenCalled();
  });

  it('respects custom label input and returns noop status', async () => {
    mockInputs({
      'label-name': 'queue-me',
      'rerun-failed-checks': 'true'
    });
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      status: 'noop',
      labelName: 'queue-me',
      message: "No-op: pull request #9 is 'closed', not open.",
      logs: ["Transition: No-op: pull request #9 is 'closed', not open."]
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith(
      buildRunMergeTrainArgs({ labelName: 'queue-me' })
    );
    expectDefaultInputCalls();
    expect(mocked.info).toHaveBeenCalledWith('Rerun toggle is enabled.');
    expect(mocked.setOutput).toHaveBeenCalledWith('label-name', 'queue-me');
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'noop');
    expect(mocked.setFailed).not.toHaveBeenCalled();
  });

  it('sets failed when merge-train execution throws', async () => {
    mockInputs({}, 'ready-to-merge');
    mocked.runMergeTrain.mockRejectedValue(new Error('boom'));

    await run();

    expect(mocked.setFailed).toHaveBeenCalledWith('boom');
  });

  it('returns clean noop without side effects when pause is enabled', async () => {
    mockInputs({ pause: 'true', 'pause-reason': 'maintenance window' });

    await run();

    expect(mocked.getInput).toHaveBeenNthCalledWith(1, 'label-name');
    expect(mocked.getInput).toHaveBeenNthCalledWith(2, 'pause');
    expect(mocked.getInput).toHaveBeenNthCalledWith(3, 'pause-reason');
    expect(mocked.createGitHubClient).not.toHaveBeenCalled();
    expect(mocked.runMergeTrain).not.toHaveBeenCalled();
    expect(mocked.info).toHaveBeenCalledWith(
      'Paused: merge train execution skipped (maintenance window).'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith(
      'label-name',
      'ready-to-merge'
    );
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'noop');
    expect(mocked.setFailed).not.toHaveBeenCalled();
  });

  it('sets failed when no token is provided', async () => {
    mockInputs({ 'label-name': 'ready-to-merge', token: '' });

    await run();

    expect(mocked.setFailed).toHaveBeenCalledWith(
      'Missing GitHub token. Set required input token.'
    );
    expect(mocked.runMergeTrain).not.toHaveBeenCalled();
  });

  it('runs normally when pause is explicitly disabled', async () => {
    mockInputs({ pause: 'false' });
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      status: 'noop',
      labelName: 'ready-to-merge',
      message: "No-op: pull request #9 is 'closed', not open.",
      logs: []
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith(buildRunMergeTrainArgs());
    expect(mocked.info).toHaveBeenCalledWith('Rerun toggle is enabled.');
    expect(mocked.setOutput).toHaveBeenCalledWith('status', 'noop');
  });

  it('parses rerun toggle robustly and disables rerun for false-like values', async () => {
    mockInputs({ 'rerun-failed-checks': 'No' });
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      status: 'noop',
      labelName: 'ready-to-merge',
      message: "No-op: pull request #9 is 'closed', not open.",
      logs: []
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith(
      expect.objectContaining({ rerunFailedChecks: false })
    );
    expectDefaultInputCalls();
    expect(mocked.info).toHaveBeenCalledWith('Rerun toggle is disabled.');
  });

  it('passes trust policy inputs through to merge train', async () => {
    mockInputs({
      'trust-same-repo-only': 'false',
      'trust-min-author-association': 'member',
      'trust-author-allowlist': 'octocat,hubot',
      'trust-require-approved-review': 'yes'
    });
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      status: 'noop',
      labelName: 'ready-to-merge',
      message: "No-op: pull request #9 is 'closed', not open.",
      logs: []
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith(
      buildRunMergeTrainArgs({
        trustSameRepoOnly: false,
        trustMinAuthorAssociation: 'member',
        trustAuthorAllowlist: ['octocat', 'hubot'],
        trustRequireApprovedReview: true
      })
    );
  });

  it('passes branch auto-delete toggle through to merge train', async () => {
    mockInputs({ 'auto-delete-source-branch': 'yes' });
    mocked.runMergeTrain.mockResolvedValue({
      eligible: true,
      status: 'noop',
      labelName: 'ready-to-merge',
      message: "No-op: pull request #9 is 'closed', not open.",
      logs: []
    });

    await run();

    expect(mocked.runMergeTrain).toHaveBeenCalledWith(
      buildRunMergeTrainArgs({
        autoDeleteSourceBranch: true
      })
    );
  });
});
