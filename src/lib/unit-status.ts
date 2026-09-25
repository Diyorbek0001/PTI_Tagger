const reassignmentWords = ['inactive', 'hometime', 'terminated'];

export function groupNeedsReassignment(title: string | null | undefined) {
  const normalized = title?.toLowerCase() ?? '';
  return reassignmentWords.some(word => normalized.includes(word));
}
