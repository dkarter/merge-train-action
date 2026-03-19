import * as core from '@actions/core';
import { runMergeTrain } from './merge-train';

export const run = async (): Promise<void> => {
  try {
    const label = core.getInput('label', { required: true });
    const result = await runMergeTrain(label);

    core.info(result.message);
    core.setOutput('label', result.label);
    core.setOutput('status', 'ok');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      return;
    }

    core.setFailed('Unknown error while running merge-train-action.');
  }
};

void run();
