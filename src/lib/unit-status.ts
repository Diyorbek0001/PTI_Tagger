const reassignmentWords = ['inactive', 'hometime', 'home time', 'terminated'];

export function groupNeedsReassignment(title: string | null | undefined) {
  const normalized = title?.toLowerCase() ?? '';
  return reassignmentWords.some(word => normalized.includes(word));
}
