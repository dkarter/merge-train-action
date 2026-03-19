import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LABEL_NAME,
  runMergeTrain,
  type MergeTrainGitHubClient,
  type PullRequestState
} from '../src/merge-train';

const buildPullRequestState = (
  overrides: Partial<PullRequestState>
): PullRequestState => ({
  number: 9,
  state: 'open',
  merged: false,
  mergeable: true,
  mergeableState: 'clean',
  headSha: 'sha-1',
  baseRef: 'main',
  labels: ['ready-to-merge'],
  ...overrides
});

const basePayload = {
  action: 'synchronize',
  repository: {
    name: 'merge-train-action',
    owner: {
      login: 'acme'
    }
  },
  pull_request: {
    number: 9,
    labels: [{ name: 'ready-to-merge' }]
  }
};

const createClient = (): MergeTrainGitHubClient => ({
  getPullRequest: vi.fn(),
  updateBranch: vi.fn(),
  getRequiredCheckContexts: vi.fn(),
  getCombinedStatusContexts: vi.fn(),
  getCheckRuns: vi.fn(),
  rerunCheckRuns: vi.fn(),
  mergePullRequest: vi.fn()
});

describe('runMergeTrain', () => {
  it('uses the default configured label name constant', () => {
    expect(DEFAULT_LABEL_NAME).toBe('ready-to-merge');
  });

  it('attempts safe update when pull request is behind and then merges', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(
        buildPullRequestState({
          mergeableState: 'behind',
          headSha: 'sha-behind'
        })
      )
      .mockResolvedValueOnce(
        buildPullRequestState({
          mergeableState: 'clean',
          headSha: 'sha-updated'
        })
      )
      .mockResolvedValueOnce(
        buildPullRequestState({
          mergeableState: 'clean',
          headSha: 'sha-updated'
        })
      );
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: true,
      updated: true
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test',
      'ci/lint'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'success'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([
      {
        id: 17,
        name: 'ci/lint',
        status: 'completed',
        conclusion: 'success'
      }
    ]);
    vi.mocked(githubClient.rerunCheckRuns).mockResolvedValue({
      requestedCheckRunIds: [],
      skippedCheckRuns: []
    });
    vi.mocked(githubClient.mergePullRequest).mockResolvedValue({
      merged: true,
      message: 'Pull Request successfully merged'
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(githubClient.updateBranch).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      expectedHeadSha: 'sha-behind'
    });
    expect(githubClient.mergePullRequest).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      sha: 'sha-updated'
    });
    expect(result.eligible).toBe(true);
    expect(result.status).toBe('merged');
    expect(result.message).toBe(
      'Merged: pull request #9 merged after required checks succeeded.'
    );
  });

  it('returns no-op when update branch is unavailable and pull request stays unmergeable', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(
        buildPullRequestState({
          mergeableState: 'behind',
          headSha: 'sha-behind'
        })
      )
      .mockResolvedValueOnce(
        buildPullRequestState({
          mergeable: false,
          mergeableState: 'behind',
          headSha: 'sha-behind'
        })
      );
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false,
      reason: '404:Not Found'
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'success'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([]);
    vi.mocked(githubClient.rerunCheckRuns).mockResolvedValue({
      requestedCheckRunIds: [],
      skippedCheckRuns: []
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result.status).toBe('noop');
    expect(result.message).toBe(
      "No-op: pull request #9 is not mergeable (mergeable_state='behind')."
    );
    expect(githubClient.mergePullRequest).not.toHaveBeenCalled();
  });

  it('blocks merge when required checks fail', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }));
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'failure'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([]);
    vi.mocked(githubClient.rerunCheckRuns).mockResolvedValue({
      requestedCheckRunIds: [],
      skippedCheckRuns: []
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      rerunFailedChecks: false,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result.status).toBe('blocked');
    expect(result.message).toBe(
      'Blocked: required checks failing [ci/test] (rerun disabled).'
    );
    expect(githubClient.mergePullRequest).not.toHaveBeenCalled();
  });

  it('blocks merge when merge API rejects merge attempt', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }));
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'success'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([]);
    vi.mocked(githubClient.rerunCheckRuns).mockResolvedValue({
      requestedCheckRunIds: [],
      skippedCheckRuns: []
    });
    vi.mocked(githubClient.mergePullRequest).mockResolvedValue({
      merged: false,
      message: '405:Base branch policy blocks merge'
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result.status).toBe('blocked');
    expect(result.message).toContain('GitHub rejected merge attempt');
  });

  it('reruns failed check-runs once and merges after rerun succeeds', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }));
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts)
      .mockResolvedValueOnce({
        'ci/test': 'failure'
      })
      .mockResolvedValueOnce({
        'ci/test': 'success'
      });
    vi.mocked(githubClient.getCheckRuns)
      .mockResolvedValueOnce([
        {
          id: 101,
          name: 'ci/test',
          status: 'completed',
          conclusion: 'failure'
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 101,
          name: 'ci/test',
          status: 'completed',
          conclusion: 'success'
        }
      ]);
    vi.mocked(githubClient.rerunCheckRuns).mockResolvedValue({
      requestedCheckRunIds: [101],
      skippedCheckRuns: []
    });
    vi.mocked(githubClient.mergePullRequest).mockResolvedValue({
      merged: true,
      message: 'Pull Request successfully merged'
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      rerunFailedChecks: true,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(githubClient.rerunCheckRuns).toHaveBeenCalledTimes(1);
    expect(githubClient.rerunCheckRuns).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      checkRunIds: [101]
    });
    expect(result.status).toBe('merged');
  });

  it('blocks with diagnostics when checks still fail after one-time rerun', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }));
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts)
      .mockResolvedValueOnce({
        'ci/test': 'failure'
      })
      .mockResolvedValueOnce({
        'ci/test': 'failure'
      });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([
      {
        id: 101,
        name: 'ci/test',
        status: 'completed',
        conclusion: 'failure'
      }
    ]);
    vi.mocked(githubClient.rerunCheckRuns).mockResolvedValue({
      requestedCheckRunIds: [101],
      skippedCheckRuns: []
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      rerunFailedChecks: true,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(githubClient.rerunCheckRuns).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('blocked');
    expect(result.message).toBe(
      'Blocked: required checks still failing after one-time rerun [ci/test].'
    );
  });

  it('blocks without rerun when rerun toggle is disabled', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }));
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'failure'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([
      {
        id: 101,
        name: 'ci/test',
        status: 'completed',
        conclusion: 'failure'
      }
    ]);

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      rerunFailedChecks: false,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(githubClient.rerunCheckRuns).not.toHaveBeenCalled();
    expect(result.status).toBe('blocked');
    expect(result.message).toBe(
      'Blocked: required checks failing [ci/test] (rerun disabled).'
    );
  it('returns no-op when label is removed while waiting', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(
        buildPullRequestState({ headSha: 'sha-1', labels: ['bug'] })
      );
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result.status).toBe('noop');
    expect(result.message).toBe(
      "No-op: pull request #9 is no longer labeled 'ready-to-merge'."
    );
    expect(githubClient.mergePullRequest).not.toHaveBeenCalled();
  });

  it('restarts checks when head SHA changes before merge', async () => {
    const githubClient = createClient();
    const sleep = vi.fn();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-2' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-2' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-2' }));
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'success'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([]);
    vi.mocked(githubClient.mergePullRequest).mockResolvedValue({
      merged: true,
      message: 'Pull Request successfully merged'
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      waitTimeoutSeconds: 2,
      pollIntervalSeconds: 1,
      sleep
    });

    expect(result.status).toBe('merged');
    expect(githubClient.mergePullRequest).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      sha: 'sha-2'
    });
    expect(sleep).toHaveBeenCalled();
  });

  it('returns no-op when another run already merged the pull request', async () => {
    const githubClient = createClient();
    vi.mocked(githubClient.getPullRequest)
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(buildPullRequestState({ headSha: 'sha-1' }))
      .mockResolvedValueOnce(
        buildPullRequestState({
          state: 'closed',
          merged: true,
          labels: []
        })
      );
    vi.mocked(githubClient.updateBranch).mockResolvedValue({
      attempted: false,
      updated: false
    });
    vi.mocked(githubClient.getRequiredCheckContexts).mockResolvedValue([
      'ci/test'
    ]);
    vi.mocked(githubClient.getCombinedStatusContexts).mockResolvedValue({
      'ci/test': 'success'
    });
    vi.mocked(githubClient.getCheckRuns).mockResolvedValue([]);
    vi.mocked(githubClient.mergePullRequest).mockResolvedValue({
      merged: false,
      message: '405:Pull Request is not mergeable'
    });

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'synchronize',
      labelName: 'ready-to-merge',
      payload: basePayload,
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result.status).toBe('noop');
    expect(result.message).toBe('No-op: pull request #9 is already merged.');
  });

  it('is a no-op when pull request does not have configured label', async () => {
    const githubClient = createClient();

    const result = await runMergeTrain({
      eventName: 'pull_request',
      eventAction: 'opened',
      labelName: 'ready-to-merge',
      payload: {
        ...basePayload,
        pull_request: {
          number: 9,
          labels: [{ name: 'bug' }]
        }
      },
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result).toEqual({
      eligible: false,
      status: 'noop',
      labelName: 'ready-to-merge',
      message:
        "No-op: pull request is not labeled 'ready-to-merge' for event action 'opened'.",
      logs: []
    });
    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
  });

  it('is a no-op for non pull_request events', async () => {
    const githubClient = createClient();

    const result = await runMergeTrain({
      eventName: 'push',
      eventAction: undefined,
      labelName: 'ready-to-merge',
      payload: {},
      githubClient,
      waitTimeoutSeconds: 1,
      pollIntervalSeconds: 1,
      sleep: vi.fn()
    });

    expect(result).toEqual({
      eligible: false,
      status: 'noop',
      labelName: 'ready-to-merge',
      message:
        "No-op: event 'push' is not supported. Waiting for pull_request events.",
      logs: []
    });
  });
});
