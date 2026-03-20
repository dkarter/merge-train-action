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
    const createComment = vi.fn().mockResolvedValue({ data: { id: 101 } });
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
    const commentId = await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'status body'
    });

    expect(listComments).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      issue_number: 9,
      per_page: 100,
      page: 1
    });
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 9,
        body: expect.stringContaining('status body')
      })
    );
    expect(updateComment).not.toHaveBeenCalled();
    expect(commentId).toBe(101);
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
    const commentId = await client.upsertMergeTrainStatusComment({
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
    expect(commentId).toBe(42);
  });

  it('keeps the oldest marked status comment and deletes duplicate markers', async () => {
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
    const deleteComment = vi.fn().mockResolvedValue(undefined);

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment,
          deleteComment
        }
      }
    } as never);

    const client = createGitHubClient('token');
    const commentId = await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'replacement body'
    });

    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 10 })
    );
    expect(deleteComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      comment_id: 20
    });
    expect(commentId).toBe(10);
  });

  it('updates a previously created comment id directly to avoid duplicate comments', async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [
        {
          id: 77,
          body: 'existing\n\n<!-- merge-train-status-comment:v1 -->'
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
    const commentId = await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'new status body',
      commentId: 77
    });

    expect(updateComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      comment_id: 77,
      body: expect.stringContaining('new status body')
    });
    expect(listComments).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      issue_number: 9,
      per_page: 100,
      page: 1
    });
    expect(createComment).not.toHaveBeenCalled();
    expect(commentId).toBe(77);
  });

  it('serializes concurrent upserts for the same PR to avoid duplicate creation', async () => {
    let nextId = 501;
    const comments: Array<{ id: number; body: string }> = [];
    const listComments = vi.fn().mockImplementation(async () => ({
      data: comments.map((comment) => ({
        id: comment.id,
        body: comment.body
      }))
    }));
    const createComment = vi.fn().mockImplementation(async ({ body }) => {
      await Promise.resolve();
      const id = nextId;
      nextId += 1;
      comments.push({ id, body });
      return { data: { id } };
    });
    const updateComment = vi
      .fn()
      .mockImplementation(async ({ comment_id, body }) => {
        const match = comments.find((comment) => comment.id === comment_id);
        if (match) {
          match.body = body;
        }
        return undefined;
      });
    const deleteComment = vi.fn().mockImplementation(async ({ comment_id }) => {
      const index = comments.findIndex((comment) => comment.id === comment_id);
      if (index >= 0) {
        comments.splice(index, 1);
      }
      return undefined;
    });

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment,
          deleteComment
        }
      }
    } as never);

    const client = createGitHubClient('token');
    const [firstCommentId, secondCommentId] = await Promise.all([
      client.upsertMergeTrainStatusComment({
        owner: 'acme',
        repo: 'merge-train-action',
        pullNumber: 9,
        body: 'phase one body'
      }),
      client.upsertMergeTrainStatusComment({
        owner: 'acme',
        repo: 'merge-train-action',
        pullNumber: 9,
        body: 'phase two body'
      })
    ]);

    expect(createComment).toHaveBeenCalledTimes(1);
    expect(deleteComment).not.toHaveBeenCalled();
    expect(firstCommentId).toBe(501);
    expect(secondCommentId).toBe(501);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain('phase two body');
  });

  it('dedupes marker comments created by parallel external runs', async () => {
    const comments: Array<{ id: number; body: string }> = [
      {
        id: 40,
        body: 'newer status\n\n<!-- merge-train-status-comment:v1 -->'
      },
      { id: 30, body: 'older status\n\n<!-- merge-train-status-comment:v1 -->' }
    ];
    const listComments = vi.fn().mockImplementation(async () => ({
      data: comments.map((comment) => ({
        id: comment.id,
        body: comment.body
      }))
    }));
    const createComment = vi.fn();
    const updateComment = vi
      .fn()
      .mockImplementation(async ({ comment_id, body }) => {
        const match = comments.find((comment) => comment.id === comment_id);
        if (match) {
          match.body = body;
        }
        return undefined;
      });
    const deleteComment = vi.fn().mockImplementation(async ({ comment_id }) => {
      const index = comments.findIndex((comment) => comment.id === comment_id);
      if (index >= 0) {
        comments.splice(index, 1);
      }
      return undefined;
    });

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment,
          deleteComment
        }
      }
    } as never);

    const client = createGitHubClient('token');
    const commentId = await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'authoritative body'
    });

    expect(commentId).toBe(30);
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 30 })
    );
    expect(deleteComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'merge-train-action',
      comment_id: 40
    });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.id).toBe(30);
    expect(createComment).not.toHaveBeenCalled();
  });

  it('does not create duplicate comments when direct update returns 404', async () => {
    const listComments = vi.fn();
    const createComment = vi.fn();
    const updateComment = vi.fn().mockRejectedValue({
      status: 404,
      message: 'Not Found'
    });

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
    const commentId = await client.upsertMergeTrainStatusComment({
      owner: 'acme',
      repo: 'merge-train-action',
      pullNumber: 9,
      body: 'new status body',
      commentId: 77
    });

    expect(updateComment).toHaveBeenCalledTimes(3);
    expect(listComments).not.toHaveBeenCalled();
    expect(createComment).not.toHaveBeenCalled();
    expect(commentId).toBe(77);
  });
});
