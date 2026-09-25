export function formatPtiReference(value: string | number | bigint): string {
  return `PTI-${String(value).padStart(6, '0')}`;
}
