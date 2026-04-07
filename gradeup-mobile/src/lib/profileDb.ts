import { supabase } from './supabase';
import type { AcademicLevel, SubscriptionPlan } from '../types';

function normalizeSubscriptionPlanUpdate(raw: SubscriptionPlan): SubscriptionPlan {
  if (raw === 'plus' || raw === 'pro') return raw;
  return 'free';
}

function normalizeSubscriptionPlan(raw: string | null | undefined): SubscriptionPlan {
  if (raw === 'plus' || raw === 'pro') return raw;
  return 'free';
}

const TABLE = 'profiles';

export interface ProfileRow {
  id: string;
  name: string | null;
  university: string | null;
  academic_level: string | null;
  student_id: string | null;
  program: string | null;
  part: number | null;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<{
  name: string;
  university?: string;
  universityId?: string;
  academicLevel?: AcademicLevel;
  studentId?: string;
  program?: string;
  part?: number;
  avatarUrl?: string;
  campus?: string;
  faculty?: string;
  studyMode?: string;
  currentSemester?: number;
  heaTermCode?: string;
  mystudentEmail?: string;
  lastSync?: string;
  portalTeachingAnchoredSemester?: number;
  subscriptionPlan?: SubscriptionPlan;
} | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'name, university, university_id, academic_level, student_id, program, part, avatar_url, campus, faculty, study_mode, current_semester, hea_term_code, mystudent_email, last_sync, portal_teaching_anchored_semester, subscription_plan',
    )
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  const row = data as {
    name: string | null;
    university: string | null;
    university_id: string | null;
    academic_level: string | null;
    student_id: string | null;
    program: string | null;
    part: number | null;
    avatar_url: string | null;
    campus: string | null;
    faculty: string | null;
    study_mode: string | null;
    current_semester: number | null;
    hea_term_code: string | null;
    mystudent_email: string | null;
    last_sync: string | null;
    portal_teaching_anchored_semester: number | null;
    subscription_plan: string | null;
  };
  const level = row.academic_level as AcademicLevel | undefined;
  return {
    name: row.name ?? '',
    university: row.university ?? undefined,
    universityId: row.university_id ? String(row.university_id) : undefined,
    academicLevel: level && ['Diploma', 'Bachelor', 'Master', 'PhD', 'Foundation', 'Other'].includes(level) ? level : undefined,
    studentId: row.student_id ? String(row.student_id) : undefined,
    program: row.program ? String(row.program) : undefined,
    part: row.part != null && Number.isFinite(Number(row.part)) ? Number(row.part) : undefined,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    campus: row.campus ? String(row.campus) : undefined,
    faculty: row.faculty ? String(row.faculty) : undefined,
    studyMode: row.study_mode ? String(row.study_mode) : undefined,
    currentSemester:
      row.current_semester != null && Number.isFinite(Number(row.current_semester))
        ? Number(row.current_semester)
        : undefined,
    heaTermCode: row.hea_term_code ? String(row.hea_term_code).trim() || undefined : undefined,
    mystudentEmail: row.mystudent_email ? String(row.mystudent_email) : undefined,
    lastSync: row.last_sync ? String(row.last_sync) : undefined,
    portalTeachingAnchoredSemester:
      row.portal_teaching_anchored_semester != null &&
      Number.isFinite(Number(row.portal_teaching_anchored_semester))
        ? Number(row.portal_teaching_anchored_semester)
        : undefined,
    subscriptionPlan: normalizeSubscriptionPlan(row.subscription_plan),
  };
}

export async function updateProfile(
  userId: string,
  updates: {
    name?: string;
    university?: string;
    universityId?: string | null;
    academicLevel?: AcademicLevel;
    studentId?: string;
    program?: string;
    part?: number;
    avatarUrl?: string | null;
    campus?: string;
    faculty?: string;
    studyMode?: string;
    currentSemester?: number;
    heaTermCode?: string | null;
    mystudentEmail?: string;
    lastSync?: string | null;
    portalTeachingAnchoredSemester?: number | null;
    subscriptionPlan?: SubscriptionPlan;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.university !== undefined) payload.university = updates.university;
  if (updates.universityId !== undefined) payload.university_id = updates.universityId;
  if (updates.academicLevel !== undefined) payload.academic_level = updates.academicLevel;
  if (updates.studentId !== undefined) payload.student_id = updates.studentId.trim() || null;
  if (updates.program !== undefined) payload.program = updates.program.trim() || null;
  if (updates.part !== undefined) payload.part = updates.part > 0 ? updates.part : null;
  if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
  if (updates.campus !== undefined) payload.campus = updates.campus.trim() || null;
  if (updates.faculty !== undefined) payload.faculty = updates.faculty.trim() || null;
  if (updates.studyMode !== undefined) payload.study_mode = updates.studyMode.trim() || null;
  if (updates.currentSemester !== undefined) {
    payload.current_semester = updates.currentSemester > 0 ? updates.currentSemester : null;
  }
  if (updates.heaTermCode !== undefined) payload.hea_term_code = updates.heaTermCode ? String(updates.heaTermCode).trim() : null;
  if (updates.mystudentEmail !== undefined) payload.mystudent_email = updates.mystudentEmail.trim() || null;
  if (updates.lastSync !== undefined) payload.last_sync = updates.lastSync;
  if (updates.portalTeachingAnchoredSemester !== undefined) {
    payload.portal_teaching_anchored_semester =
      updates.portalTeachingAnchoredSemester != null && updates.portalTeachingAnchoredSemester > 0
        ? updates.portalTeachingAnchoredSemester
        : null;
  }
  if (updates.subscriptionPlan !== undefined) {
    payload.subscription_plan = normalizeSubscriptionPlanUpdate(updates.subscriptionPlan);
  }
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from(TABLE).update(payload).eq('id', userId);
  if (error) throw new Error(error.message || 'Failed to update profile');
}
