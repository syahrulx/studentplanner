import { supabase } from './supabase';

export interface WhatsNewPrompt {
  id: string;
  is_active: boolean;
  version_name: string;
  title: string;
  content: string;
}

/**
 * Fetches the currently active What's New prompt, if any.
 * Since is_active is unique (enforced by the admin panel), there should
 * only be one or zero active prompts.
 */
export async function fetchActiveWhatsNewPrompt(): Promise<WhatsNewPrompt | null> {
  const { data, error } = await supabase
    .from('whats_new_prompts')
    .select('id, is_active, version_name, title, content')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as WhatsNewPrompt;
}
