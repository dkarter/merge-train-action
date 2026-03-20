import * as core from '@actions/core';
import * as fs from 'node:fs';
import { runMergeTrain } from './merge-train';
import {
  DEFAULT_LABEL_NAME,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_WAIT_TIMEOUT_SECONDS
} from './merge-train';
import { createGitHubClient } from './github-client';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);
const INPUT_LABEL_NAME = 'label-name';
const INPUT_TOKEN = 'token';
const INPUT_RERUN_FAILED_CHECKS = 'rerun-failed-checks';
const INPUT_WAIT_TIMEOUT_SECONDS = 'wait-timeout-seconds';
const INPUT_POLL_INTERVAL_SECONDS = 'poll-interval-seconds';
const INPUT_PAUSE = 'pause';
const INPUT_PAUSE_REASON = 'pause-reason';
const INPUT_TRUST_SAME_REPO_ONLY = 'trust-same-repo-only';
const INPUT_TRUST_MIN_AUTHOR_ASSOCIATION = 'trust-min-author-association';
const INPUT_TRUST_AUTHOR_ALLOWLIST = 'trust-author-allowlist';
const INPUT_TRUST_REQUIRE_APPROVED_REVIEW = 'trust-require-approved-review';

const toBoolean = (value: string, fallback: boolean): boolean => {
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
};

const toPositiveInteger = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const toCsvList = (value: string): string[] => {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const readPayload = (): unknown => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return {};
  }

  const payloadContent = fs.readFileSync(eventPath, 'utf8');
  return JSON.parse(payloadContent) as unknown;
};

export const run = async (): Promise<void> => {
  try {
    const configuredLabel =
      core.getInput(INPUT_LABEL_NAME) || DEFAULT_LABEL_NAME;
    const paused = toBoolean(core.getInput(INPUT_PAUSE) || '', false);
    const pauseReason = core.getInput(INPUT_PAUSE_REASON).trim();

    if (paused) {
      const pauseMessage = pauseReason
        ? `Paused: merge train execution skipped (${pauseReason}).`
        : 'Paused: merge train execution skipped.';
      core.info(pauseMessage);
      core.setOutput('label-name', configuredLabel);
      core.setOutput('status', 'noop');
      return;
    }

    const rerunFailedChecks = toBoolean(
      core.getInput(INPUT_RERUN_FAILED_CHECKS) || '',
      true
    );
    const waitTimeoutSeconds = toPositiveInteger(
      core.getInput(INPUT_WAIT_TIMEOUT_SECONDS) || '',
      DEFAULT_WAIT_TIMEOUT_SECONDS
    );
    const pollIntervalSeconds = toPositiveInteger(
      core.getInput(INPUT_POLL_INTERVAL_SECONDS) || '',
      DEFAULT_POLL_INTERVAL_SECONDS
    );
    const trustSameRepoOnly = toBoolean(
      core.getInput(INPUT_TRUST_SAME_REPO_ONLY) || '',
      true
    );
    const trustMinAuthorAssociation = core
      .getInput(INPUT_TRUST_MIN_AUTHOR_ASSOCIATION)
      .trim();
    const trustAuthorAllowlist = toCsvList(
      core.getInput(INPUT_TRUST_AUTHOR_ALLOWLIST) || ''
    );
    const trustRequireApprovedReview = toBoolean(
      core.getInput(INPUT_TRUST_REQUIRE_APPROVED_REVIEW) || '',
      false
    );
    const token = core.getInput(INPUT_TOKEN);
    if (!token) {
      throw new Error('Missing GitHub token. Set required input token.');
    }

    const eventName = process.env.GITHUB_EVENT_NAME || '';
    const payload = readPayload() as { action?: string };
    const githubClient = createGitHubClient(token);

    const result = await runMergeTrain({
      eventName,
      eventAction: payload.action,
      payload,
      labelName: configuredLabel,
      githubClient,
      rerunFailedChecks,
      waitTimeoutSeconds,
      pollIntervalSeconds,
      trustSameRepoOnly,
      trustMinAuthorAssociation,
      trustAuthorAllowlist,
      trustRequireApprovedReview
    });

    for (const logEntry of result.logs) {
      core.info(logEntry);
    }
    core.info(result.message);
    core.info(`Rerun toggle is ${rerunFailedChecks ? 'enabled' : 'disabled'}.`);

    core.setOutput('label-name', result.labelName);
    core.setOutput('status', result.status);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      return;
    }

    core.setFailed('Unknown error while running merge-train-action.');
  }
};

if (require.main === module) {
  void run();
}
