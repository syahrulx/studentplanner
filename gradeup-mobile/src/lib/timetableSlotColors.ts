const SLOT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#06b6d4', '#6366f1', '#84cc16', '#f97316',
];

export function getSlotColorForSubjectCode(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = ((hash << 5) - hash) + code.charCodeAt(i);
  return SLOT_COLORS[Math.abs(hash) % SLOT_COLORS.length];
}

export const TIMETABLE_SLOT_COLOR_OPTIONS = [...SLOT_COLORS];
