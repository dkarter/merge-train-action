export type MergeTrainResult = {
  label: string;
  message: string;
};

export const runMergeTrain = async (
  label: string
): Promise<MergeTrainResult> => {
  return {
    label,
    message: `Merge train bootstrap complete for label: ${label}`
  };
};
