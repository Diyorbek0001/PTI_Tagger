export const defectCategories = [
  'Tire', 'Brake', 'Light', 'Air Line', 'Electrical', 'Engine', 'Fluid Leak',
  'Windshield', 'Mirror', 'Fifth Wheel', 'Suspension', 'Mudflap', 'Trailer',
  'Body Damage', 'Safety Equipment', 'Registration / Plate', 'Other',
] as const;

export const defectSeverities = ['MINOR', 'ATTENTION', 'CRITICAL'] as const;
export const defectStatuses = ['OPEN', 'ASSIGNED', 'REPAIR_SCHEDULED', 'IN_REPAIR', 'RESOLVED', 'CANCELLED'] as const;

export type DefectCategory = typeof defectCategories[number];
export type DefectSeverity = typeof defectSeverities[number];
export type DefectStatus = typeof defectStatuses[number];

export const severityLabels: Record<DefectSeverity, string> = {
  MINOR: 'Minor', ATTENTION: 'Attention Needed', CRITICAL: 'Critical / Out of Service',
};

export const statusLabels: Record<DefectStatus, string> = {
  OPEN: 'Open', ASSIGNED: 'Assigned', REPAIR_SCHEDULED: 'Repair Scheduled',
  IN_REPAIR: 'In Repair', RESOLVED: 'Resolved', CANCELLED: 'Cancelled',
};

export function formatDefectReference(value: string | number) {
  return `DEF-${String(value).padStart(6, '0')}`;
}
