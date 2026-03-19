import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
const getInput = vi.fn();
const setFailed = vi.fn();
const setOutput = vi.fn();
const runMergeTrain = vi.fn();

vi.mock('@actions/core', () => ({
  info,
  getInput,
  setFailed,
  setOutput
}));

vi.mock('../src/merge-train', () => ({
  runMergeTrain
}));

describe('run', () => {
  beforeEach(() => {
    info.mockReset();
    getInput.mockReset();
    setFailed.mockReset();
    setOutput.mockReset();
    runMergeTrain.mockReset();
  });

  it('reads label input and emits outputs', async () => {
    getInput.mockReturnValue('merge-train');
    runMergeTrain.mockResolvedValue({
      label: 'merge-train',
      message: 'Merge train bootstrap complete for label: merge-train'
    });

    const module = await import('../src/main');
    await module.run();

    expect(getInput).toHaveBeenCalledWith('label', { required: true });
    expect(runMergeTrain).toHaveBeenCalledWith('merge-train');
    expect(info).toHaveBeenCalledWith(
      'Merge train bootstrap complete for label: merge-train'
    );
    expect(setOutput).toHaveBeenCalledWith('label', 'merge-train');
    expect(setOutput).toHaveBeenCalledWith('status', 'ok');
    expect(setFailed).not.toHaveBeenCalled();
  });
});
