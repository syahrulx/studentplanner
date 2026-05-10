import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@task_categories_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface TaskCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
}

// Fallback to the original hardcoded values if network fails
const FALLBACK_CATEGORIES: TaskCategory[] = [
  { id: 'assignment', name: 'Assignment', icon: '📝', color: '#3b82f6', sort_order: 1 },
  { id: 'quiz',       name: 'Quiz',       icon: '❓', color: '#f59e0b', sort_order: 2 },
  { id: 'project',    name: 'Project',    icon: '💼', color: '#8b5cf6', sort_order: 3 },
  { id: 'lab',        name: 'Lab',        icon: '🔬', color: '#10b981', sort_order: 4 },
  { id: 'test',       name: 'Test',       icon: '📋', color: '#ef4444', sort_order: 5 },
  { id: 'exam',       name: 'Exam',       icon: '📚', color: '#ec4899', sort_order: 6 },
];

interface CachedCategories {
  data: TaskCategory[];
  fetchedAt: number;
}

export async function fetchTaskCategories(): Promise<TaskCategory[]> {
  // Serve from cache if still fresh
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedCategories = JSON.parse(raw);
      if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
      }
    }
  } catch { /* cache miss is fine */ }

  // Fetch from Supabase
  try {
    const { data, error } = await supabase
      .from('task_categories')
      .select('id, name, icon, color, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error || !data || data.length === 0) throw new Error('empty');

    const categories = data as TaskCategory[];

    // Persist to cache
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data: categories, fetchedAt: Date.now() }));
    return categories;
  } catch {
    return FALLBACK_CATEGORIES;
  }
}

/** Force-clears the category cache (e.g., call after a long offline session). */
export async function invalidateTaskCategoryCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
