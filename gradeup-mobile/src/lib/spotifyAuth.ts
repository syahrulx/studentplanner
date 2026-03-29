/**
 * Spotify OAuth PKCE + Vibe Picker API.
 *
 * Flow:
 *   1. connectSpotify()       – OAuth login, stores refresh_token
 *   2. getMyPlaylists()       – user's Spotify playlists
 *   3. getPlaylistTracks()    – tracks inside a playlist
 *   4. getRecentlyPlayed()    – last 20 recently played tracks
 *   5. setMyVibe()            – pick a song as your current vibe → saves to DB
 *   6. clearMyVibe()          – remove your current vibe
 *   7. addTrackToLibrary()    – friend saves your vibe song to their Liked Songs
 */
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SPOTIFY_CLIENT_ID =
  (Constants.expoConfig?.extra as any)?.spotifyClientId as string || '';

const SPOTIFY_SCOPES = [
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-modify',
  'user-library-read',
];

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

// In-memory cache for the access token (avoids unnecessary refreshes)
let cachedAccessToken: string | null = null;
let cachedTokenTimestamp: number = 0;
const TOKEN_LIFETIME_MS = 50 * 60 * 1000; // 50 minutes (Spotify tokens last 60 min)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string;
  trackUrl: string;
  previewUrl?: string;
  uri: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string;
  trackCount: number;
}

export interface VibeInfo {
  song: string;
  artist: string;
  albumArt: string;
  trackUrl: string;
  spotifyUri: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const res = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Spotify token exchange failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });

  const res = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Spotify token refresh failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

/** Get a fresh access token for the current user. Uses cache if still valid. */
async function getMyAccessToken(): Promise<string | null> {
  // Use cached token if still fresh
  if (cachedAccessToken && Date.now() - cachedTokenTimestamp < TOKEN_LIFETIME_MS) {
    return cachedAccessToken;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tokenRow } = await supabase
    .from('spotify_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!tokenRow?.refresh_token) return null;
  
  const token = await refreshAccessToken(tokenRow.refresh_token);
  cachedAccessToken = token;
  cachedTokenTimestamp = Date.now();
  return token;
}

function parseTrack(item: any): SpotifyTrack {
  return {
    id: item.id,
    name: item.name || 'Unknown',
    artist: (item.artists || []).map((a: any) => a.name).join(', ') || 'Unknown',
    albumArt: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || '',
    trackUrl: item.external_urls?.spotify || '',
    previewUrl: item.preview_url || undefined,
    uri: item.uri || '',
  };
}

// ---------------------------------------------------------------------------
// Public API — Auth
// ---------------------------------------------------------------------------

export async function connectSpotify(): Promise<boolean> {
  if (!SPOTIFY_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_SPOTIFY_CLIENT_ID is not configured.');
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'gradeupmobile', path: 'spotify-callback' });
  console.log('[SpotifyAuth] Using Redirect URI:', redirectUri);

  const request = new AuthSession.AuthRequest({
    clientId: SPOTIFY_CLIENT_ID,
    scopes: SPOTIFY_SCOPES,
    redirectUri,
    usePKCE: true,
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success' || !result.params.code) {
    return false;
  }

  const { refreshToken, accessToken } = await exchangeCode(
    result.params.code,
    redirectUri,
    request.codeVerifier!
  );

  // Cache the access token so we don't need to refresh immediately
  cachedAccessToken = accessToken;
  cachedTokenTimestamp = Date.now();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('spotify_tokens').upsert(
    { user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );

  return true;
}

export async function disconnectSpotify(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('spotify_tokens').delete().eq('user_id', user.id);
  // Clear vibe
  await supabase.from('user_activities').update({
    is_playing: false,
    song_name: null,
    song_artist: null,
    song_album_art: null,
  }).eq('user_id', user.id);
}

export async function isSpotifyConnected(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('spotify_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// Public API — Browse Music
// ---------------------------------------------------------------------------

/** Get user's Spotify playlists. */
export async function getMyPlaylists(): Promise<SpotifyPlaylist[]> {
  const accessToken = await getMyAccessToken();
  if (!accessToken) return [];

  try {
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=30', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.images?.[0]?.url || '',
      trackCount: p.tracks?.total || 0,
    }));
  } catch (e) {
    console.warn('[SpotifyAuth] getMyPlaylists error:', e);
    return [];
  }
}

/** Get tracks in a specific playlist. */
export async function getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
  const accessToken = await getMyAccessToken();
  if (!accessToken) return [];

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists,album,external_urls,preview_url,uri))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.items || [])
      .filter((i: any) => i.track && i.track.id)
      .map((i: any) => parseTrack(i.track));
  } catch (e) {
    console.warn('[SpotifyAuth] getPlaylistTracks error:', e);
    return [];
  }
}

/** Get recently played tracks. */
export async function getRecentlyPlayed(): Promise<SpotifyTrack[]> {
  const accessToken = await getMyAccessToken();
  if (!accessToken) return [];

  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    // Deduplicate by track id
    const seen = new Set<string>();
    return (json.items || [])
      .filter((i: any) => {
        if (!i.track?.id || seen.has(i.track.id)) return false;
        seen.add(i.track.id);
        return true;
      })
      .map((i: any) => parseTrack(i.track));
  } catch (e) {
    console.warn('[SpotifyAuth] getRecentlyPlayed error:', e);
    return [];
  }
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
  }).eq('user_id', user.id);
}

/** Get the current user's own vibe from the DB. */
export async function getMyVibe(): Promise<VibeInfo | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_activities')
    .select('song_name, song_artist, song_album_art, is_playing')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data?.is_playing || !data.song_name) return null;
  return {
    song: data.song_name,
    artist: data.song_artist || '',
    albumArt: data.song_album_art || '',
    trackUrl: '',
    spotifyUri: '',
  };
}

/** Fetch the 30-second audio preview URL for a given track ID. */
export async function getTrackPreviewUrl(trackId: string): Promise<string | null> {
  const accessToken = await getMyAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.preview_url || null;
  } catch (e) {
    console.warn('[SpotifyAuth] getTrackPreviewUrl error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — Friend Actions
// ---------------------------------------------------------------------------

/** Add a track to the current user's Spotify "Liked Songs" library. */
export async function addTrackToLibrary(trackId: string): Promise<boolean> {
  const accessToken = await getMyAccessToken();
  if (!accessToken) return false;

  try {
    const res = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch (e) {
    console.warn('[SpotifyAuth] addTrackToLibrary error:', e);
    return false;
  }
}

/** Search for tracks on Spotify. */
export async function searchTracks(query: string): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];
  const accessToken = await getMyAccessToken();
  if (!accessToken) {
    console.warn('[SpotifyAuth] searchTracks: no access token');
    throw new Error('Spotify not connected. Please reconnect Spotify in Settings.');
  }

  const q = encodeURIComponent(query.trim());
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${q}&type=track&limit=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const errorText = await res.text();
    console.warn('[SpotifyAuth] searchTracks API error:', res.status, errorText);
    if (res.status === 401) {
      // Invalidate cached token so next call gets a fresh one
      cachedAccessToken = null;
      cachedTokenTimestamp = 0;
      throw new Error('Spotify session expired. Please try again or reconnect Spotify.');
    }
    throw new Error(`Spotify search failed (${res.status})`);
  }
  const json = await res.json();
  return (json.tracks?.items || []).map((t: any) => parseTrack(t));
}
