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
      name: string;
      status: string;
      conclusion: string | null;
    }>
  >;
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
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}): CheckOutcome => {
  if (params.requiredContexts.length === 0) {
    return 'success';
  }

  const outcomes = params.requiredContexts.map((requiredContext) => {
    const statusOutcome = params.statusContexts[requiredContext];
    if (statusOutcome) {
      return statusOutcome;
    }

    const matchingCheckRuns = params.checkRuns.filter(
      (checkRun) => checkRun.name === requiredContext
    );
    if (matchingCheckRuns.length === 0) {
      return 'pending';
    }

    return combineCheckOutcomes(matchingCheckRuns.map(evaluateCheckRun));
  });

  return combineCheckOutcomes(outcomes);
};

const isNoopPullRequestState = (
  pullRequest: PullRequestState
): string | null => {
  if (pullRequest.state !== 'open') {
    return `No-op: pull request #${pullRequest.number} is '${pullRequest.state}', not open.`;
  }

  if (pullRequest.merged) {
    return `No-op: pull request #${pullRequest.number} is already merged.`;
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

  const initialNoopReason = isNoopPullRequestState(pullRequest);
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

  while (Date.now() <= deadline) {
    pullRequest = await githubClient.getPullRequest({
      owner,
      repo,
      pullNumber
    });

    const loopNoopReason = isNoopPullRequestState(pullRequest);
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
    latestOutcome = evaluateRequiredChecks({
      requiredContexts,
      statusContexts,
      checkRuns
    });

    if (latestOutcome === 'failure') {
      const failureMessage =
        'Blocked: required checks are failing. RMS-27 can add rerun behavior; this action does not rerun failed checks.';
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

      logs.push(
        `Transition: required checks succeeded for '${pullRequest.headSha}', attempting merge.`
      );
      const mergeResult = await githubClient.mergePullRequest({
        owner,
        repo,
        pullNumber,
        sha: pullRequest.headSha
      });

      if (!mergeResult.merged) {
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
