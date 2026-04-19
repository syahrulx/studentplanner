/**
 * Music Vibe API.
 * 
 * Flow:
 *   1. searchTracks()   – search Apple Music (iTunes API)
 *   2. setMyVibe()      – pick a song as your current vibe → saves to DB
 *   3. clearMyVibe()    – remove your current vibe
 *   4. getMyVibe()      – get current vibe
 */
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SpotifyTrack {
  id: string; // This is actually an Apple Music/iTunes Track ID now
  name: string;
  artist: string;
  albumArt: string;
  trackUrl?: string;
  previewUrl?: string;
  uri?: string;
}

export interface VibeInfo {
  song: string;
  artist: string;
  albumArt: string;
  trackId?: string; // Apple Music Track ID
}

// ---------------------------------------------------------------------------
// Public API — Set / Clear Vibe
// ---------------------------------------------------------------------------

/** Set a song as your current "vibe". Merges with existing activity so they stack. */
export async function setMyVibe(track: SpotifyTrack): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch current activity to preserve activity_type, detail, course_name
  const { data: currentAct } = await supabase
    .from('user_activities')
    .select('activity_type, detail, course_name')
    .eq('user_id', user.id)
    .maybeSingle();

  await supabase.from('user_activities').upsert(
    {
      user_id: user.id,
      activity_type: currentAct?.activity_type || 'idle',
      detail: currentAct?.detail || null,
      course_name: currentAct?.course_name || null,
      is_playing: true,
      song_name: track.name,
      song_artist: track.artist,
      song_album_art: track.albumArt,
      song_track_id: track.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}

/** Clear your current vibe. */
export async function clearMyVibe(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('user_activities').update({
    is_playing: false,
    song_name: null,
    song_artist: null,
    song_album_art: null,
    song_track_id: null,
  }).eq('user_id', user.id);
}

/** Get the current user's own vibe from the DB. */
export async function getMyVibe(): Promise<VibeInfo | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_activities')
    .select('song_name, song_artist, song_album_art, song_track_id, is_playing')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data?.is_playing || !data.song_name) return null;
  return {
    song: data.song_name,
    artist: data.song_artist || '',
    albumArt: data.song_album_art || '',
    trackId: data.song_track_id || undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API — Browse Music
// ---------------------------------------------------------------------------

/** Search for tracks using the public iTunes Search API. No authentication required! */
export async function searchTracks(query: string): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];
  const q = encodeURIComponent(query.trim());
  const url = `https://itunes.apple.com/search?term=${q}&entity=song&limit=20`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes API failed: ${res.status}`);
    const json = await res.json();
    
    return (json.results || []).map((item: any) => ({
      id: String(item.trackId),
      name: item.trackName,
      artist: item.artistName,
      // iTunes provides a 100x100 preview art, but we can replace the suffix for 300x300 high-res
      albumArt: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '300x300bb') : ''
    }));
  } catch (err: any) {
    console.warn('[MusicAuth] searchTracks error:', err);
    throw new Error('Music search failed. Please try again.');
  }
}
