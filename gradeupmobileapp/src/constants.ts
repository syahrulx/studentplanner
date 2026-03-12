export const COLORS = {
  navy: '#003366',
  gold: '#D4AF37',
  white: '#FFFFFF',
  gray: '#64748b',
  bg: '#f8fafc',
  border: '#e2e8f0',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f97316',
  textPrimary: '#1A1C1E',
  textSecondary: '#8E9AAF',
  cardBg: '#FFFFFF',
  inputBg: '#f8fafc',
};

export const DEFAULT_COURSES = [
  'IPS551', 'CSC584', 'ICT551', 'ICT502', 'CTU551', 'TAC451', 'LCC401', 'ISP573',
];

export const COURSE_NAMES: Record<string, string> = {
  IPS551: 'Information System Development',
  CSC584: 'Enterprise Programming',
  ICT551: 'Mobile App Development',
  ICT502: 'IT Infrastructure',
  ISP573: 'IS Planning & Strategy',
  TAC451: 'Third Language',
  CTU551: 'Tamadun Islam & Asia',
  LCC401: 'Critical Reading',
};

export const FONTS = {
  bold: '700' as const,
  black: '900' as const,
  semibold: '600' as const,
  medium: '500' as const,
  regular: '400' as const,
};

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const SOW_DATA: Record<string, number[]> = {
  CSC584: [1, 2, 2, 3, 3, 4, 8, 2, 5, 6, 7, 9, 10, 4],
  ICT551: [2, 2, 3, 3, 4, 7, 5, 2, 4, 5, 8, 8, 9, 10],
  IPS551: [1, 1, 2, 3, 3, 4, 4, 1, 5, 7, 9, 8, 10, 3],
  ICT502: [2, 3, 4, 5, 8, 4, 3, 2, 4, 5, 6, 9, 7, 2],
  ISP573: [1, 2, 3, 3, 4, 4, 7, 2, 4, 6, 6, 9, 10, 3],
  CTU551: [1, 1, 1, 2, 2, 4, 3, 8, 3, 2, 3, 4, 3, 9],
  TAC451: [2, 2, 2, 3, 3, 3, 8, 2, 3, 4, 4, 5, 5, 10],
  LCC401: [1, 1, 2, 2, 3, 3, 3, 3, 9, 4, 4, 4, 5, 8],
};
