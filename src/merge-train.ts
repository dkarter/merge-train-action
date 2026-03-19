export const DEFAULT_LABEL_NAME = 'ready-to-merge';

type Label = {
  name?: unknown;
};

type PullRequestLike = {
  labels?: unknown;
};

export type MergeTrainResult = {
  eligible: boolean;
  labelName: string;
  message: string;
};

type MergeTrainParams = {
  eventName: string;
  eventAction?: string;
  payload: unknown;
  labelName: string;
};

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

export const runMergeTrain = async ({
  eventName,
  eventAction,
  payload,
  labelName
}: MergeTrainParams): Promise<MergeTrainResult> => {
  const webhookPayload = payload as {
    pull_request?: PullRequestLike;
    label?: Label;
  };

  if (eventName !== 'pull_request') {
    return {
      eligible: false,
      labelName,
      message: `No-op: event '${eventName}' is not supported. Waiting for pull_request events.`
    };
  }

  if (pullRequestHasLabel(webhookPayload.pull_request, labelName)) {
    return {
      eligible: true,
      labelName,
      message: `Merge train trigger eligible: pull request already has label '${labelName}'.`
    };
  }

  const addedLabelName = parseLabelName(webhookPayload.label);
  if (eventAction === 'labeled' && addedLabelName === labelName) {
    return {
      eligible: true,
      labelName,
      message: `Merge train trigger eligible: added label '${labelName}' matches configuration.`
    };
  }

  return {
    eligible: false,
    labelName,
    message: `No-op: pull request is not labeled '${labelName}' for event action '${eventAction ?? 'unknown'}'.`
  };
};
