import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/github', () => ({
  getOctokit: vi.fn()
}));

import * as github from '@actions/github';
import { createGitHubClient } from '../src/github-client';

describe('createGitHubClient.rerunCheckRuns', () => {
  beforeEach(() => {
    vi.mocked(github.getOctokit).mockReset();
  });

  it('requests native check-run rerequest when supported', async () => {
    const rerequestRun = vi.fn().mockResolvedValue(undefined);
    const checkGet = vi.fn();
    const rerunFailedJobs = vi.fn();

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        checks: {
          rerequestRun,
          get: checkGet
        },
        actions: {
          reRunWorkflowFailedJobs: rerunFailedJobs
        }
      }
    } as never);

    const client = createGitHubClient('token');
    const result = await client.rerunCheckRuns({
      owner: 'acme',
      repo: 'merge-train-action',
      checkRunIds: [101]
    });

    expect(rerequestRun).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      check_run_id: 101
    });
    expect(rerunFailedJobs).not.toHaveBeenCalled();
    expect(checkGet).not.toHaveBeenCalled();
    expect(result).toEqual({
      requestedCheckRunIds: [101],
      skippedCheckRuns: []
    });
  });

  it('falls back to rerun failed workflow jobs for non-rerequestable GitHub Actions checks', async () => {
    const notRerequestableError = {
      status: 422,
      message: 'This check run is not rerequestable'
    };
    const rerequestRun = vi.fn().mockRejectedValue(notRerequestableError);
    const checkGet = vi.fn().mockResolvedValue({
      data: {
        details_url:
          'https://github.com/acme/merge-train-action/actions/runs/123456789/job/987654321'
      }
    });
    const rerunFailedJobs = vi.fn().mockResolvedValue(undefined);

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        checks: {
          rerequestRun,
          get: checkGet
        },
        actions: {
          reRunWorkflowFailedJobs: rerunFailedJobs
        }
      }
    } as never);

    const client = createGitHubClient('token');
    const result = await client.rerunCheckRuns({
      owner: 'acme',
      repo: 'merge-train-action',
      checkRunIds: [101, 102]
    });

    expect(rerequestRun).toHaveBeenCalledTimes(2);
    expect(checkGet).toHaveBeenCalledTimes(2);
    expect(rerunFailedJobs).toHaveBeenCalledTimes(1);
    expect(rerunFailedJobs).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      run_id: 123456789
    });
    expect(result).toEqual({
      requestedCheckRunIds: [101, 102],
      skippedCheckRuns: []
    });
  });
});
