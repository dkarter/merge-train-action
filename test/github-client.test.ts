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

describe('createGitHubClient.upsertMergeTrainStatusComment', () => {
  beforeEach(() => {
    vi.mocked(github.getOctokit).mockReset();
  });

  it('creates a new status comment when none exists', async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] });
    const createComment = vi.fn().mockResolvedValue(undefined);
    const updateComment = vi.fn();

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment
        }
      }
    } as never);

    const client = createGitHubClient('token');
    await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'status body'
    });

    expect(listComments).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      issue_number: 9,
      per_page: 100
    });
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 9,
        body: expect.stringContaining('status body')
      })
    );
    expect(updateComment).not.toHaveBeenCalled();
  });

  it('updates existing bot status comment instead of creating duplicates', async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [
        {
          id: 42,
          body: 'old body\n\n<!-- merge-train-status-comment:v1 -->',
          user: {
            login: 'github-actions[bot]',
            type: 'Bot'
          }
        }
      ]
    });
    const createComment = vi.fn();
    const updateComment = vi.fn().mockResolvedValue(undefined);

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment
        }
      }
    } as never);

    const client = createGitHubClient('token');
    await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'new body'
    });

    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      comment_id: 42,
      body: expect.stringContaining('new body')
    });
  });

  it('picks an existing marked bot comment when duplicate comments exist', async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [
        {
          id: 10,
          body: 'first\n\n<!-- merge-train-status-comment:v1 -->',
          user: {
            login: 'github-actions[bot]',
            type: 'Bot'
          }
        },
        {
          id: 20,
          body: 'latest\n\n<!-- merge-train-status-comment:v1 -->',
          user: {
            login: 'github-actions[bot]',
            type: 'Bot'
          }
        }
      ]
    });
    const createComment = vi.fn();
    const updateComment = vi.fn().mockResolvedValue(undefined);

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment
        }
      }
    } as never);

    const client = createGitHubClient('token');
    await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'replacement body'
    });

    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 20 })
    );
  });
});
