import * as github from '@actions/github';
import type {
  MergeResult,
  MergeTrainGitHubClient,
  PullRequestState,
  UpdateBranchResult
} from './merge-train';

const STATUS_COMMENT_MARKER = '<!-- merge-train-status-comment:v1 -->';

const normalizeStatusState = (
  state: string
): 'success' | 'failure' | 'pending' => {
  if (state === 'success') {
    return 'success';
  }

  if (state === 'failure' || state === 'error') {
    return 'failure';
  }

  return 'pending';
};

const extractLabelNames = (
  labels: Array<{ name?: string } | string>
): string[] => {
  return labels
    .map((label) => {
      if (typeof label === 'string') {
        return label;
      }

      return typeof label.name === 'string' ? label.name : null;
    })
    .filter((label): label is string => Boolean(label && label.length > 0));
};

const parseWorkflowRunIdFromDetailsUrl = (
  detailsUrl: string | null | undefined
): number | null => {
  if (typeof detailsUrl !== 'string') {
    return null;
  }

  const match = detailsUrl.match(/\/actions\/runs\/(\d+)(?:\/|$)/);
  if (!match || !match[1]) {
    return null;
  }

  const runId = Number.parseInt(match[1], 10);
  if (!Number.isInteger(runId) || runId <= 0) {
    return null;
  }

  return runId;
};

const withStatusCommentMarker = (body: string): string => {
  if (body.includes(STATUS_COMMENT_MARKER)) {
    return body;
  }

  return `${body}\n\n${STATUS_COMMENT_MARKER}`;
};

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

type IssueComment = {
  id: number;
  body: string;
};

export const createGitHubClient = (token: string): MergeTrainGitHubClient => {
  const octokit = github.getOctokit(token);
  const inFlightCommentUpserts = new Map<string, Promise<number>>();

  const listIssueComments = async ({
    owner,
    repo,
    pullNumber
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<IssueComment[]> => {
    const comments: IssueComment[] = [];
    let page = 1;

    while (true) {
      const response = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: pullNumber,
        per_page: 100,
        page
      });

      for (const comment of response.data) {
        if (
          typeof comment.id !== 'number' ||
          typeof comment.body !== 'string'
        ) {
          continue;
        }

        comments.push({
          id: comment.id,
          body: comment.body
        });
      }

      if (response.data.length < 100) {
        return comments;
      }

      page += 1;
    }
  };

  const selectMarkedStatusComments = (
    comments: IssueComment[]
  ): IssueComment[] => {
    return comments
      .filter((comment) => comment.body.includes(STATUS_COMMENT_MARKER))
      .sort((left, right) => left.id - right.id);
  };

  const cleanupDuplicateStatusComments = async ({
    owner,
    repo,
    authoritativeCommentId,
    statusComments
  }: {
    owner: string;
    repo: string;
    authoritativeCommentId: number;
    statusComments: IssueComment[];
  }): Promise<void> => {
    for (const statusComment of statusComments) {
      if (statusComment.id === authoritativeCommentId) {
        continue;
      }

      try {
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: statusComment.id
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          error.status === 404
        ) {
          continue;
        }

        throw error;
      }
    }
  };

  const updateStatusCommentById = async ({
    owner,
    repo,
    commentId,
    body
  }: {
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }): Promise<void> => {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body
    });
  };

  return {
    getPullRequest: async ({
      owner,
      repo,
      pullNumber
    }): Promise<PullRequestState> => {
      const response = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber
      });
      const reviewDecision = (
        response.data as {
          review_decision?: string | null;
        }
      ).review_decision;

      return {
        number: response.data.number,
        state: response.data.state,
        merged: Boolean(response.data.merged),
        mergeable:
          typeof response.data.mergeable === 'boolean'
            ? response.data.mergeable
            : null,
        mergeableState: response.data.mergeable_state ?? null,
        headSha: response.data.head.sha,
        baseRef: response.data.base.ref,
        labels: extractLabelNames(response.data.labels),
        authorLogin: response.data.user?.login ?? null,
        authorAssociation: response.data.author_association ?? null,
        reviewDecision: reviewDecision ?? null,
        headRepositoryFullName: response.data.head.repo?.full_name ?? null,
        baseRepositoryFullName: response.data.base.repo?.full_name ?? null
      };
    },

    updateBranch: async ({
      owner,
      repo,
      pullNumber,
      expectedHeadSha
    }): Promise<UpdateBranchResult> => {
      try {
        const response = await octokit.rest.pulls.updateBranch({
          owner,
          repo,
          pull_number: pullNumber,
          expected_head_sha: expectedHeadSha
        });

        return {
          attempted: true,
          updated: response.status === 202
        };
      } catch (error) {
        if (typeof error !== 'object' || error === null) {
          throw error;
        }

        const statusCode =
          'status' in error && typeof error.status === 'number'
            ? error.status
            : undefined;
        const message =
          'message' in error && typeof error.message === 'string'
            ? error.message
            : 'unknown';

        if (statusCode === 422 || statusCode === 403 || statusCode === 409) {
          return {
            attempted: true,
            updated: false,
            reason: `${statusCode}:${message}`
          };
        }

        if (statusCode === 404) {
          return {
            attempted: false,
            updated: false,
            reason: `${statusCode}:${message}`
          };
        }

        throw error;
      }
    },

    getRequiredCheckContexts: async ({ owner, repo, branch }) => {
      try {
        const response = await octokit.rest.repos.getBranch({
          owner,
          repo,
          branch
        });

        const contexts = new Set<string>();
        for (const context of response.data.protection?.required_status_checks
          ?.contexts ?? []) {
          contexts.add(context);
        }

        for (const check of response.data.protection?.required_status_checks
          ?.checks ?? []) {
          if (typeof check.context === 'string' && check.context.length > 0) {
            contexts.add(check.context);
          }
        }

        return [...contexts.values()];
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          error.status === 404
        ) {
          return [];
        }

        throw error;
      }
    },

    getCombinedStatusContexts: async ({ owner, repo, ref }) => {
      const response = await octokit.rest.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref
      });

      const statuses: Record<string, 'success' | 'failure' | 'pending'> = {};
      for (const statusEntry of response.data.statuses) {
        statuses[statusEntry.context] = normalizeStatusState(statusEntry.state);
      }

      return statuses;
    },

    getCheckRuns: async ({ owner, repo, ref }) => {
      const response = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref,
        per_page: 100
      });

      return response.data.check_runs.map((checkRun) => ({
        id: checkRun.id,
        name: checkRun.name,
        status: checkRun.status,
        conclusion: checkRun.conclusion
      }));
    },

    rerunCheckRuns: async ({ owner, repo, checkRunIds }) => {
      const requestedCheckRunIds: number[] = [];
      const skippedCheckRuns: Array<{ checkRunId: number; reason: string }> =
        [];
      const requestedWorkflowRunIds = new Set<number>();

      for (const checkRunId of checkRunIds) {
        try {
          await octokit.rest.checks.rerequestRun({
            owner,
            repo,
            check_run_id: checkRunId
          });
          requestedCheckRunIds.push(checkRunId);
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            error.status === 422
          ) {
            try {
              const checkRunResponse = await octokit.rest.checks.get({
                owner,
                repo,
                check_run_id: checkRunId
              });
              const workflowRunId = parseWorkflowRunIdFromDetailsUrl(
                checkRunResponse.data.details_url
              );

              if (workflowRunId) {
                if (!requestedWorkflowRunIds.has(workflowRunId)) {
                  await octokit.rest.actions.reRunWorkflowFailedJobs({
                    owner,
                    repo,
                    run_id: workflowRunId
                  });
                  requestedWorkflowRunIds.add(workflowRunId);
                }

                requestedCheckRunIds.push(checkRunId);
                continue;
              }
            } catch (fallbackError) {
              if (
                typeof fallbackError === 'object' &&
                fallbackError !== null &&
                'status' in fallbackError &&
                typeof fallbackError.status === 'number' &&
                'message' in fallbackError &&
                typeof fallbackError.message === 'string'
              ) {
                skippedCheckRuns.push({
                  checkRunId,
                  reason: `${fallbackError.status}:${fallbackError.message}`
                });
                continue;
              }

              throw fallbackError;
            }
          }

          if (
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof error.status === 'number' &&
            'message' in error &&
            typeof error.message === 'string' &&
            (error.status === 403 ||
              error.status === 404 ||
              error.status === 422)
          ) {
            skippedCheckRuns.push({
              checkRunId,
              reason: `${error.status}:${error.message}`
            });
            continue;
          }

          throw error;
        }
      }

      return {
        requestedCheckRunIds,
        skippedCheckRuns
      };
    },

    mergePullRequest: async ({
      owner,
      repo,
      pullNumber,
      sha
    }): Promise<MergeResult> => {
      try {
        const response = await octokit.rest.pulls.merge({
          owner,
          repo,
          pull_number: pullNumber,
          sha
        });

        return {
          merged: response.data.merged,
          message: response.data.message
        };
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof error.status === 'number' &&
          'message' in error &&
          typeof error.message === 'string'
        ) {
          return {
            merged: false,
            message: `${error.status}:${error.message}`
          };
        }

        throw error;
      }
    },

    upsertMergeTrainStatusComment: async ({
      owner,
      repo,
      pullNumber,
      body,
      commentId
    }) => {
      const key = `${owner}/${repo}#${pullNumber}`;
      const previous = inFlightCommentUpserts.get(key);
      if (previous) {
        await previous.catch(() => undefined);
      }

      const upsertPromise = (async (): Promise<number> => {
        const normalizedBody = withStatusCommentMarker(body);

        if (typeof commentId === 'number' && Number.isInteger(commentId)) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await updateStatusCommentById({
                owner,
                repo,
                commentId,
                body: normalizedBody
              });
              return commentId;
            } catch (error) {
              if (
                typeof error === 'object' &&
                error !== null &&
                'status' in error &&
                error.status === 404
              ) {
                if (attempt < 2) {
                  await sleep(250);
                  continue;
                }

                break;
              }

              throw error;
            }
          }
        }

        const statusComments = selectMarkedStatusComments(
          await listIssueComments({ owner, repo, pullNumber })
        );

        let authoritativeComment = statusComments[0];

        if (!authoritativeComment) {
          const createResponse = await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullNumber,
            body: normalizedBody
          });

          const refreshedStatusComments = selectMarkedStatusComments(
            await listIssueComments({ owner, repo, pullNumber })
          );
          authoritativeComment = refreshedStatusComments[0] ?? {
            id: createResponse.data.id,
            body: normalizedBody
          };
          await cleanupDuplicateStatusComments({
            owner,
            repo,
            authoritativeCommentId: authoritativeComment.id,
            statusComments: refreshedStatusComments
          });

          if (authoritativeComment.body !== normalizedBody) {
            await updateStatusCommentById({
              owner,
              repo,
              commentId: authoritativeComment.id,
              body: normalizedBody
            });
          }

          return authoritativeComment.id;
        }

        if (authoritativeComment.body !== normalizedBody) {
          await updateStatusCommentById({
            owner,
            repo,
            commentId: authoritativeComment.id,
            body: normalizedBody
          });
        }

        await cleanupDuplicateStatusComments({
          owner,
          repo,
          authoritativeCommentId: authoritativeComment.id,
          statusComments
        });

        return authoritativeComment.id;
      })();

      inFlightCommentUpserts.set(key, upsertPromise);

      try {
        return await upsertPromise;
      } finally {
        if (inFlightCommentUpserts.get(key) === upsertPromise) {
          inFlightCommentUpserts.delete(key);
        }
      }
    }
  };
};
