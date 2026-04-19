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
  process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ||
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
let refreshPromise: Promise<string | null> | null = null;
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

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; newRefreshToken?: string }> {
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
  return {
    accessToken: json.access_token as string,
    newRefreshToken: json.refresh_token as string | undefined, // Spotify sometimes rotates the refresh token
  };
}

/** Get a fresh access token for the current user. Uses cache if still valid. */
async function getMyAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() - cachedTokenTimestamp < TOKEN_LIFETIME_MS) {
    return cachedAccessToken;
  }

  // If a refresh is already in progress, wait for it instead of sending multiple requests
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: tokenRow } = await supabase
      .from('spotify_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!tokenRow?.refresh_token) return null;

    try {
      const { accessToken, newRefreshToken } = await refreshAccessToken(tokenRow.refresh_token);
      cachedAccessToken = accessToken;
      cachedTokenTimestamp = Date.now();

      // If Spotify rotated the refresh token, we MUST save the new one,
      // otherwise the old one will be invalid on the next refresh!
      if (newRefreshToken && newRefreshToken !== tokenRow.refresh_token) {
        await supabase.from('spotify_tokens').upsert(
          { user_id: user.id, refresh_token: newRefreshToken, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      }

      return accessToken;
    } catch (e) {
      cachedAccessToken = null;
      cachedTokenTimestamp = 0;
      console.warn('[SpotifyAuth] token refresh failed, clearing cache:', e);
      return null;
    } finally {
      refreshPromise = null; // Clear promise so future calls can re-evaluate
    }
  })();

  return refreshPromise;
}

/** Invalidate the in-memory access token so the next call fetches a fresh one. */
export function invalidateAccessTokenCache(): void {
  cachedAccessToken = null;
  cachedTokenTimestamp = 0;
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

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'rencana', path: 'spotify-callback' });
  if (__DEV__) console.log('[SpotifyAuth] Using Redirect URI:', redirectUri);

  const request = new AuthSession.AuthRequest({
    clientId: SPOTIFY_CLIENT_ID,
    scopes: SPOTIFY_SCOPES,
    redirectUri,
    usePKCE: true,
    // Ensures reconnecting can pick up new scopes (e.g. user-library-modify for Liked Songs).
    extraParams: { show_dialog: 'true' },
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
  cachedAccessToken = null;
  cachedTokenTimestamp = 0;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('spotify_tokens').delete().eq('user_id', user.id);
  await supabase.from('user_activities').update({
    is_playing: false,
    song_name: null,
    song_artist: null,
    song_album_art: null,
    song_track_id: null,
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

/** Get user's Spotify playlists. Retries once on 401. */
export async function getMyPlaylists(): Promise<SpotifyPlaylist[]> {
  let accessToken = await getMyAccessToken();
  if (!accessToken) return [];

  const doFetch = (tok: string) =>
    fetch('https://api.spotify.com/v1/me/playlists?limit=30', { headers: { Authorization: `Bearer ${tok}` } });

  try {
    let res = await doFetch(accessToken);
    if (res.status === 401) {
      invalidateAccessTokenCache();
      accessToken = await getMyAccessToken();
      if (accessToken) res = await doFetch(accessToken);
    }
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

/** Get recently played tracks. Retries once on 401. */
export async function getRecentlyPlayed(): Promise<SpotifyTrack[]> {
  let accessToken = await getMyAccessToken();
  if (!accessToken) return [];

  const doFetch = (tok: string) =>
    fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', { headers: { Authorization: `Bearer ${tok}` } });

  try {
    let res = await doFetch(accessToken);
    if (res.status === 401) {
      invalidateAccessTokenCache();
      accessToken = await getMyAccessToken();
      if (accessToken) res = await doFetch(accessToken);
    }
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
    song_track_id: null,
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

/** Fetch the 30-second audio preview URL for a given track ID. Retries once on 401. */
export async function getTrackPreviewUrl(trackId: string): Promise<string | null> {
  let accessToken = await getMyAccessToken();
  if (!accessToken) return null;

  const doFetch = (tok: string) =>
    fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });

  try {
    let res = await doFetch(accessToken);
    if (res.status === 401) {
      invalidateAccessTokenCache();
      accessToken = await getMyAccessToken();
      if (accessToken) res = await doFetch(accessToken);
    }
    
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

export type AddTrackToLibraryResult = { ok: true } | { ok: false; message: string };

/** Accept raw Spotify track id, spotify:track:id, or open.spotify.com/track/… URL. */
export function normalizeSpotifyTrackId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const uri = /^spotify:track:([a-zA-Z0-9]+)\s*$/i.exec(s);
  if (uri?.[1]) return uri[1];
  const url = /open\.spotify\.com\/(?:[\w-]+\/)?track\/([a-zA-Z0-9]+)/i.exec(s);
  if (url?.[1]) return url[1];
  if (/^[a-zA-Z0-9]{22}$/.test(s)) return s;
  return null;
}

/** Add a track to the current user's Spotify "Liked Songs" library. */
export async function addTrackToLibrary(trackId: string): Promise<AddTrackToLibraryResult> {
  const id = normalizeSpotifyTrackId(trackId);
  if (!id) {
    return {
      ok: false,
      message:
        'This song link is not a valid Spotify track ID. Ask your friend to pick their vibe from Spotify again.',
    };
  }

  const putTracks = (token: string) =>
    fetch(`https://api.spotify.com/v1/me/tracks`, {
      method: 'PUT',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: [id] })
    });

  let accessToken = await getMyAccessToken();
  if (!accessToken) {
    return { ok: false, message: 'Spotify is not connected. Connect it in Settings, then try again.' };
  }

  try {
    let res = await putTracks(accessToken);
    if (res.status === 401) {
      invalidateAccessTokenCache();
      accessToken = await getMyAccessToken();
      if (accessToken) res = await putTracks(accessToken);
    }

    if (res.ok) return { ok: true };

    const raw = await res.text().catch(() => '');
    let detail = raw.trim().slice(0, 220);
    try {
      const j = JSON.parse(raw) as { error?: { message?: string }; message?: string };
      const m = (j?.error?.message || j?.message || '').trim();
      if (m) detail = m;
    } catch {
      /* keep text slice */
    }

    if (res.status === 403) {
      return {
        ok: false,
        message:
          `Spotify blocked saving (HTTP 403). ${detail ? 'Detail: ' + detail : 'Missing scope.'} If this persists, log out of Spotify completely in your browser, then reconnect here.`,
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        message: 'Spotify session expired. Reconnect Spotify in Settings, then try again.',
      };
    }
    if (res.status === 429) {
      return { ok: false, message: 'Spotify rate limit. Try again in a minute.' };
    }
    if (res.status === 400) {
      return {
        ok: false,
        message: 'This track could not be saved (invalid or unavailable on Spotify).',
      };
    }

    const suffix = detail ? ` ${detail}` : '';
    return {
      ok: false,
      message: `Could not save to your library (${res.status}).${suffix} You can try reconnecting Spotify in Settings.`,
    };
  } catch (e) {
    console.warn('[SpotifyAuth] addTrackToLibrary error:', e);
    return { ok: false, message: 'Network error. Check your connection and try again.' };
  }
}

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
