import * as core from '@actions/core';
import * as fs from 'node:fs';
import { runMergeTrain } from './merge-train';
import { DEFAULT_LABEL_NAME } from './merge-train';

const toBoolean = (value: string): boolean => value.toLowerCase() === 'true';

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
      core.getInput('rerun-failed-checks') || 'false'
    );
    const eventName = process.env.GITHUB_EVENT_NAME || '';
    const payload = readPayload() as { action?: string };

    const result = await runMergeTrain({
      eventName,
      eventAction: payload.action,
      payload,
      labelName: configuredLabel
    });

    core.info(result.message);
    core.info(
      `Rerun toggle is ${rerunFailedChecks ? 'enabled' : 'disabled'} (stub only).`
    );

    core.setOutput('label-name', result.labelName);
    core.setOutput('status', result.eligible ? 'ok' : 'noop');
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
