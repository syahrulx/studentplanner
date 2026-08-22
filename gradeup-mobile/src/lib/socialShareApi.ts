import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';
import type { SocialSharePlatform } from './socialShareRewards';

const PROOF_BUCKET = 'share-proof';

export type SocialShareClaim = {
  id: string;
  platform: SocialSharePlatform;
  post_url: string;
  claimed_likes: number;
  status: 'pending' | 'approved' | 'rejected';
  awarded_days: number | null;
  review_note: string | null;
  created_at: string;
};

/** Error whose `code` maps to copy via submitErrorCopy(). */
export class SocialShareSubmitError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'SocialShareSubmitError';
  }
}

/**
 * Upload proof to the private share-proof bucket and return the storage PATH
 * (not a URL — the bucket is private; admins view it through signed URLs).
 * The {userId}/ prefix is load-bearing: storage RLS and the submit RPC both
 * require it.
 */
export async function uploadShareProof(base64Image: string, ext: string = 'jpeg'): Promise<string> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('You must be signed in to upload an image.');

  const filePath = `${userRes.user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(filePath, decode(base64Image), { contentType: `image/${ext}` });
  if (uploadError) throw uploadError;
  return filePath;
}

export async function submitShareClaim(input: {
  platform: SocialSharePlatform;
  postUrl: string;
  claimedLikes: number;
  screenshotPath: string;
}): Promise<{ claimId: string }> {
  const { data, error } = await supabase.rpc('submit_social_share_claim', {
    p_platform: input.platform,
    p_post_url: input.postUrl.trim(),
    p_claimed_likes: input.claimedLikes,
    p_screenshot_path: input.screenshotPath,
  });

  const result = data as { ok?: boolean; error?: string; claim_id?: string } | null;
  if (error || !result?.ok) {
    // The RPC rejected the claim, so the upload is an orphan — remove it
    // best-effort (storage RLS allows deleting under our own prefix).
    void supabase.storage.from(PROOF_BUCKET).remove([input.screenshotPath]).catch(() => {});
    if (error) throw error;
    throw new SocialShareSubmitError(String(result?.error ?? 'unknown'));
  }
  return { claimId: String(result.claim_id ?? '') };
}

export async function listMyShareClaims(): Promise<SocialShareClaim[]> {
  const { data, error } = await supabase
    .from('social_share_claims')
    .select('id, platform, post_url, claimed_likes, status, awarded_days, review_note, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SocialShareClaim[];
}
