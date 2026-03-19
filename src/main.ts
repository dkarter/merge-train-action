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
    const configuredLabel = core.getInput('label-name') || DEFAULT_LABEL_NAME;
    const rerunFailedChecks = toBoolean(
      core.getInput('rerun-failed-checks') || '',
      true
    );
    const waitTimeoutSeconds = toPositiveInteger(
      core.getInput('wait-timeout-seconds') || '',
      DEFAULT_WAIT_TIMEOUT_SECONDS
    );
    const pollIntervalSeconds = toPositiveInteger(
      core.getInput('poll-interval-seconds') || '',
      DEFAULT_POLL_INTERVAL_SECONDS
    );
    const token =
      core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
    if (!token) {
      throw new Error(
        'Missing GitHub token. Set input github-token or GITHUB_TOKEN.'
      );
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
      pollIntervalSeconds
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
