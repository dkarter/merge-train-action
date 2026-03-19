export const DEFAULT_LABEL_NAME = 'ready-to-merge';
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
export const DEFAULT_POLL_INTERVAL_SECONDS = 15;

const SUCCESS_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const FAILURE_CHECK_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'stale',
  'startup_failure',
  'timed_out'
]);

type Label = {
  name?: unknown;
};

type PullRequestLike = {
  labels?: unknown;
};

export type MergeTrainResult = {
  eligible: boolean;
  status: 'merged' | 'noop' | 'blocked';
  labelName: string;
  message: string;
  logs: string[];
};

export type PullRequestState = {
  number: number;
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  headSha: string;
  baseRef: string;
  labels: string[];
};

export type MergeResult = {
  merged: boolean;
  message: string;
};

export type UpdateBranchResult = {
  attempted: boolean;
  updated: boolean;
  reason?: string;
};

export type MergeTrainGitHubClient = {
  getPullRequest: (params: {
    owner: string;
    repo: string;
    pullNumber: number;
  }) => Promise<PullRequestState>;
  updateBranch: (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    expectedHeadSha: string;
  }) => Promise<UpdateBranchResult>;
  getRequiredCheckContexts: (params: {
    owner: string;
    repo: string;
    branch: string;
  }) => Promise<string[]>;
  getCombinedStatusContexts: (params: {
    owner: string;
    repo: string;
    ref: string;
  }) => Promise<Record<string, 'success' | 'failure' | 'pending'>>;
  getCheckRuns: (params: {
    owner: string;
    repo: string;
    ref: string;
  }) => Promise<
    Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
    }>
  >;
  rerunCheckRuns: (params: {
    owner: string;
    repo: string;
    checkRunIds: number[];
  }) => Promise<{
    requestedCheckRunIds: number[];
    skippedCheckRuns: Array<{
      checkRunId: number;
      reason: string;
    }>;
  }>;
  mergePullRequest: (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    sha: string;
  }) => Promise<MergeResult>;
};

type MergeTrainParams = {
  eventName: string;
  eventAction?: string;
  payload: unknown;
  labelName: string;
  githubClient: MergeTrainGitHubClient;
  rerunFailedChecks?: boolean;
  waitTimeoutSeconds?: number;
  pollIntervalSeconds?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

type PullRequestPayload = {
  number?: unknown;
  labels?: unknown;
  merged?: unknown;
  state?: unknown;
};

type RepositoryPayload = {
  name?: unknown;
  owner?: {
    login?: unknown;
  };
};

type CheckOutcome = 'success' | 'failure' | 'pending';

const parseLabelName = (label: unknown): string | null => {
  if (!label || typeof label !== 'object') {
    return null;
  }

  const labelName = (label as Label).name;
  if (typeof labelName !== 'string') {
    return null;
  }

  return labelName;
};

const pullRequestHasLabel = (
  pullRequest: PullRequestLike | undefined,
  labelName: string
): boolean => {
  if (!pullRequest || !Array.isArray(pullRequest.labels)) {
    return false;
  }

  return pullRequest.labels.some(
    (label) => parseLabelName(label) === labelName
  );
};

const parseString = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return value;
};

const parsePullNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
};

const parsePayloadRepository = (payload: {
  repository?: RepositoryPayload;
}): { owner: string; repo: string } | null => {
  const owner = parseString(payload.repository?.owner?.login);
  const repo = parseString(payload.repository?.name);
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
};

const evaluateCheckRun = (checkRun: {
  status: string;
  conclusion: string | null;
}): CheckOutcome => {
  if (checkRun.status !== 'completed') {
    return 'pending';
  }

  if (
    checkRun.conclusion &&
    SUCCESS_CHECK_CONCLUSIONS.has(checkRun.conclusion)
  ) {
    return 'success';
  }

  if (
    checkRun.conclusion &&
    FAILURE_CHECK_CONCLUSIONS.has(checkRun.conclusion)
  ) {
    return 'failure';
  }

  return 'pending';
};

const combineCheckOutcomes = (outcomes: CheckOutcome[]): CheckOutcome => {
  if (outcomes.some((outcome) => outcome === 'failure')) {
    return 'failure';
  }

  if (outcomes.every((outcome) => outcome === 'success')) {
    return 'success';
  }

  return 'pending';
};

const evaluateRequiredChecks = (params: {
  requiredContexts: string[];
  statusContexts: Record<string, 'success' | 'failure' | 'pending'>;
  checkRuns: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}): {
  overallOutcome: CheckOutcome;
  failingRequiredContexts: string[];
} => {
  if (params.requiredContexts.length === 0) {
    return {
      overallOutcome: 'success',
      failingRequiredContexts: []
    };
  }

  const contextOutcomes = params.requiredContexts.map((requiredContext) => {
    const statusOutcome = params.statusContexts[requiredContext];
    if (statusOutcome) {
      return {
        requiredContext,
        outcome: statusOutcome
      };
    }

    const matchingCheckRuns = params.checkRuns.filter(
      (checkRun) => checkRun.name === requiredContext
    );
    if (matchingCheckRuns.length === 0) {
      return {
        requiredContext,
        outcome: 'pending' as const
      };
    }

    return {
      requiredContext,
      outcome: combineCheckOutcomes(matchingCheckRuns.map(evaluateCheckRun))
    };
  });

  return {
    overallOutcome: combineCheckOutcomes(
      contextOutcomes.map((contextOutcome) => contextOutcome.outcome)
    ),
    failingRequiredContexts: contextOutcomes
      .filter((contextOutcome) => contextOutcome.outcome === 'failure')
      .map((contextOutcome) => contextOutcome.requiredContext)
  };
};

const isNoopPullRequestState = (
  pullRequest: PullRequestState,
  labelName: string
): string | null => {
  if (pullRequest.merged) {
    return `No-op: pull request #${pullRequest.number} is already merged.`;
  }

  if (pullRequest.state !== 'open') {
    return `No-op: pull request #${pullRequest.number} is '${pullRequest.state}', not open.`;
  }

  if (!pullRequest.labels.includes(labelName)) {
    return `No-op: pull request #${pullRequest.number} is no longer labeled '${labelName}'.`;
  }

  if (pullRequest.mergeable === false) {
    return `No-op: pull request #${pullRequest.number} is not mergeable (mergeable_state='${pullRequest.mergeableState ?? 'unknown'}').`;
  }

  return null;
};

const defaultSleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export const runMergeTrain = async ({
  eventName,
  eventAction,
  payload,
  labelName,
  githubClient,
  rerunFailedChecks = true,
  waitTimeoutSeconds = DEFAULT_WAIT_TIMEOUT_SECONDS,
  pollIntervalSeconds = DEFAULT_POLL_INTERVAL_SECONDS,
  sleep = defaultSleep
}: MergeTrainParams): Promise<MergeTrainResult> => {
  const webhookPayload = payload as {
    pull_request?: PullRequestPayload;
    label?: Label;
    repository?: RepositoryPayload;
  };
  const logs: string[] = [];

  if (eventName !== 'pull_request') {
    return {
      eligible: false,
      status: 'noop',
      labelName,
      message: `No-op: event '${eventName}' is not supported. Waiting for pull_request events.`,
      logs
    };
  }

  if (pullRequestHasLabel(webhookPayload.pull_request, labelName)) {
    logs.push(
      `Transition: trigger eligible because pull request already has label '${labelName}'.`
    );
  } else {
    const addedLabelName = parseLabelName(webhookPayload.label);
    if (eventAction === 'labeled' && addedLabelName === labelName) {
      logs.push(
        `Transition: trigger eligible because action labeled with '${labelName}'.`
      );
    } else {
      return {
        eligible: false,
        status: 'noop',
        labelName,
        message: `No-op: pull request is not labeled '${labelName}' for event action '${eventAction ?? 'unknown'}'.`,
        logs
      };
    }
  }

  const repositoryCoordinates = parsePayloadRepository(webhookPayload);
  const pullNumber = parsePullNumber(webhookPayload.pull_request?.number);
  if (!repositoryCoordinates || !pullNumber) {
    return {
      eligible: false,
      status: 'noop',
      labelName,
      message:
        'No-op: pull_request payload is missing repository owner/name or pull request number.',
      logs
    };
  }

  const { owner, repo } = repositoryCoordinates;
  logs.push(`Transition: loading pull request #${pullNumber} state.`);
  let pullRequest = await githubClient.getPullRequest({
    owner,
    repo,
    pullNumber
  });

  const initialNoopReason = isNoopPullRequestState(pullRequest, labelName);
  if (initialNoopReason) {
    logs.push(`Transition: ${initialNoopReason}`);
    return {
      eligible: true,
      status: 'noop',
      labelName,
      message: initialNoopReason,
      logs
    };
  }

  let updateAttempted = false;
  if (pullRequest.mergeableState === 'behind') {
    logs.push(
      `Transition: pull request #${pullNumber} is behind '${pullRequest.baseRef}', attempting safe update branch.`
    );
    const updateResult = await githubClient.updateBranch({
      owner,
      repo,
      pullNumber,
      expectedHeadSha: pullRequest.headSha
    });
    updateAttempted = updateResult.attempted;

    if (updateResult.updated) {
      logs.push(
        `Transition: update branch accepted for pull request #${pullNumber}; waiting for refreshed checks.`
      );
    } else if (updateResult.attempted) {
      logs.push(
        `Transition: update branch attempted but not applied for pull request #${pullNumber} (${updateResult.reason ?? 'unknown'}).`
      );
    } else {
      logs.push(
        `Transition: update branch unavailable for pull request #${pullNumber} (${updateResult.reason ?? 'unknown'}).`
      );
    }
  }

  const requiredContexts = await githubClient.getRequiredCheckContexts({
    owner,
    repo,
    branch: pullRequest.baseRef
  });
  if (requiredContexts.length === 0) {
    logs.push(
      `Transition: no required checks configured for '${pullRequest.baseRef}'; merge gate can proceed.`
    );
  } else {
    logs.push(
      `Transition: required checks for '${pullRequest.baseRef}' are [${requiredContexts.join(', ')}].`
    );
  }

  const deadline = Date.now() + waitTimeoutSeconds * 1000;
  let latestOutcome: CheckOutcome = 'pending';
  let rerunAttempted = false;

  while (Date.now() <= deadline) {
    pullRequest = await githubClient.getPullRequest({
      owner,
      repo,
      pullNumber
    });

    const loopNoopReason = isNoopPullRequestState(pullRequest, labelName);
    if (loopNoopReason) {
      logs.push(`Transition: ${loopNoopReason}`);
      return {
        eligible: true,
        status: 'noop',
        labelName,
        message: loopNoopReason,
        logs
      };
    }

    const statusContexts = await githubClient.getCombinedStatusContexts({
      owner,
      repo,
      ref: pullRequest.headSha
    });
    const checkRuns = await githubClient.getCheckRuns({
      owner,
      repo,
      ref: pullRequest.headSha
    });
    const checkEvaluation = evaluateRequiredChecks({
      requiredContexts,
      statusContexts,
      checkRuns
    });
    latestOutcome = checkEvaluation.overallOutcome;

    if (latestOutcome === 'failure') {
      const failingChecks =
        checkEvaluation.failingRequiredContexts.length > 0
          ? checkEvaluation.failingRequiredContexts
          : requiredContexts;
      const failingChecksList = failingChecks.join(', ');

      if (rerunFailedChecks && !rerunAttempted) {
        rerunAttempted = true;

        const rerunnableCheckRuns = checkRuns
          .filter(
            (checkRun) =>
              failingChecks.includes(checkRun.name) &&
              evaluateCheckRun(checkRun) === 'failure'
          )
          .map((checkRun) => checkRun.id);
        const uniqueRerunnableCheckRuns = [
          ...new Set(rerunnableCheckRuns.values())
        ];

        if (uniqueRerunnableCheckRuns.length === 0) {
          const failureMessage = `Blocked: required checks failed [${failingChecksList}] and no failed check-runs were eligible for one-time rerun.`;
          logs.push(`Transition: ${failureMessage}`);
          return {
            eligible: true,
            status: 'blocked',
            labelName,
            message: failureMessage,
            logs
          };
        }

        const rerunResult = await githubClient.rerunCheckRuns({
          owner,
          repo,
          checkRunIds: uniqueRerunnableCheckRuns
        });

        if (rerunResult.requestedCheckRunIds.length > 0) {
          logs.push(
            `Transition: required checks failed [${failingChecksList}]; requested one-time rerun for check-run IDs [${rerunResult.requestedCheckRunIds.join(', ')}].`
          );
        }
        if (rerunResult.skippedCheckRuns.length > 0) {
          logs.push(
            `Transition: skipped rerun for check-runs [${rerunResult.skippedCheckRuns.map((skippedCheck) => `${skippedCheck.checkRunId} (${skippedCheck.reason})`).join(', ')}].`
          );
        }

        logs.push(
          `Transition: waiting for rerun check conclusions on '${pullRequest.headSha}' (interval ${pollIntervalSeconds}s).`
        );
        await sleep(pollIntervalSeconds * 1000);
        continue;
      }

      const failureMessage = rerunAttempted
        ? `Blocked: required checks still failing after one-time rerun [${failingChecksList}].`
        : `Blocked: required checks failing [${failingChecksList}] (rerun disabled).`;
      logs.push(`Transition: ${failureMessage}`);
      return {
        eligible: true,
        status: 'blocked',
        labelName,
        message: failureMessage,
        logs
      };
    }

    if (latestOutcome === 'success') {
      if (pullRequest.mergeable === null) {
        logs.push(
          `Transition: required checks are green but mergeability for '${pullRequest.headSha}' is still unknown; waiting for refresh.`
        );
        await sleep(pollIntervalSeconds * 1000);
        continue;
      }

      if (pullRequest.mergeable !== true) {
        const blockedMessage =
          'Blocked: required checks are green but pull request is not mergeable yet.';
        logs.push(`Transition: ${blockedMessage}`);
        return {
          eligible: true,
          status: 'blocked',
          labelName,
          message: blockedMessage,
          logs
        };
      }

      const mergeCandidateSha = pullRequest.headSha;
      const refreshedPullRequest = await githubClient.getPullRequest({
        owner,
        repo,
        pullNumber
      });

      const preMergeNoopReason = isNoopPullRequestState(
        refreshedPullRequest,
        labelName
      );
      if (preMergeNoopReason) {
        logs.push(`Transition: ${preMergeNoopReason}`);
        return {
          eligible: true,
          status: 'noop',
          labelName,
          message: preMergeNoopReason,
          logs
        };
      }

      if (refreshedPullRequest.headSha !== mergeCandidateSha) {
        logs.push(
          `Transition: head SHA changed from '${mergeCandidateSha}' to '${refreshedPullRequest.headSha}' before merge; restarting checks.`
        );
        await sleep(pollIntervalSeconds * 1000);
        continue;
      }

      logs.push(
        `Transition: required checks succeeded for '${refreshedPullRequest.headSha}', attempting merge.`
      );
      const mergeResult = await githubClient.mergePullRequest({
        owner,
        repo,
        pullNumber,
        sha: refreshedPullRequest.headSha
      });

      if (!mergeResult.merged) {
        const postMergePullRequest = await githubClient.getPullRequest({
          owner,
          repo,
          pullNumber
        });
        const postMergeNoopReason = isNoopPullRequestState(
          postMergePullRequest,
          labelName
        );
        if (postMergeNoopReason) {
          logs.push(`Transition: ${postMergeNoopReason}`);
          return {
            eligible: true,
            status: 'noop',
            labelName,
            message: postMergeNoopReason,
            logs
          };
        }

        const blockedMessage = `Blocked: GitHub rejected merge attempt (${mergeResult.message}).`;
        logs.push(`Transition: ${blockedMessage}`);
        return {
          eligible: true,
          status: 'blocked',
          labelName,
          message: blockedMessage,
          logs
        };
      }

      const mergedMessage = `Merged: pull request #${pullNumber} merged after required checks succeeded.`;
      logs.push(`Transition: ${mergedMessage}`);
      return {
        eligible: true,
        status: 'merged',
        labelName,
        message: mergedMessage,
        logs
      };
    }

    logs.push(
      `Transition: waiting for required checks on '${pullRequest.headSha}' (interval ${pollIntervalSeconds}s).`
    );
    await sleep(pollIntervalSeconds * 1000);
  }

  if (updateAttempted) {
    const timeoutMessage =
      'Blocked: timed out while waiting for update/check completion after safe update attempt.';
    logs.push(`Transition: ${timeoutMessage}`);
    return {
      eligible: true,
      status: 'blocked',
      labelName,
      message: timeoutMessage,
      logs
    };
  }

  const timeoutMessage =
    'Blocked: timed out while waiting for required checks to finish.';
  logs.push(`Transition: ${timeoutMessage}`);
  return {
    eligible: true,
    status: 'blocked',
    labelName,
    message: timeoutMessage,
    logs
  };
};
