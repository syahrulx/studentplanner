/**
 * Direct Messaging API — Pro-only chat between friends.
 *
 * All data lives in Supabase (`dm_conversations`, `dm_messages`,
 * `dm_shared_flashcards`, `dm_shared_quizzes`).
 */
import { supabase } from './supabase';
import type { FriendProfile } from './communityApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DmMessageType = 'text' | 'flashcard_share' | 'quiz_share';

export interface DmConversation {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  created_at: string;
  /** Populated client-side after join */
  friend?: FriendProfile;
  /** Last message preview */
  last_message?: DmMessage | null;
  /** Count of unread messages for the current user */
  unread_count?: number;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: DmMessageType;
  metadata: Record<string, unknown>;
  read_by_recipient: boolean;
  created_at: string;
}

export interface DmSharedFlashcard {
  id: string;
  message_id: string;
  sender_id: string;
  note_id: string;
  note_title: string;
  cards: { front: string; back: string }[];
  created_at: string;
}

export interface DmSharedQuiz {
  id: string;
  message_id: string;
  sender_id: string;
  quiz_title: string;
  quiz_data: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

/** Normalise user pair so user_a < user_b (matches the DB trigger). */
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ---------------------------------------------------------------------------
// Pro Friends
// ---------------------------------------------------------------------------

/**
 * Fetch accepted friends who are on the Pro plan.
 * We join friendships → profiles and filter `subscription_plan = 'pro'`.
 */
export async function getProFriends(userId: string): Promise<FriendProfile[]> {
  // 1. Get all accepted friendships involving this user
  const { data: friendships, error: fErr } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (fErr || !friendships?.length) return [];

  const friendIds = friendships.map((f) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id,
  );

  // 2. Fetch profiles filtering to pro plan
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group, subscription_plan')
    .in('id', friendIds)
    .eq('subscription_plan', 'pro');

  if (pErr) throw pErr;
  return (profiles || []) as FriendProfile[];
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Get or create a conversation between two users. */
export async function getOrCreateConversation(userId: string, friendId: string): Promise<DmConversation> {
  const [a, b] = orderedPair(userId, friendId);

  // Try to find existing
  const { data: existing } = await supabase
    .from('dm_conversations')
    .select('*')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle();

  if (existing) return existing as DmConversation;

  // Create new
  const { data, error } = await supabase
    .from('dm_conversations')
    .insert({ user_a: a, user_b: b })
    .select()
    .single();

  if (error) throw error;
  return data as DmConversation;
}

/** Delete a conversation */
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('dm_conversations')
    .delete()
    .eq('id', conversationId);
  if (error) throw error;
}

/** List all conversations for a user, enriched with friend profile and last message. */
export async function getConversations(userId: string): Promise<DmConversation[]> {
  const { data: convos, error } = await supabase
    .from('dm_conversations')
    .select('*')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error || !convos?.length) return [];

  // Collect friend IDs
  const friendIds = convos.map((c) => (c.user_a === userId ? c.user_b : c.user_a));

  // Fetch friend profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .in('id', friendIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // Fetch last message for each conversation
  const enriched: DmConversation[] = [];
  for (const c of convos) {
    const friendId = c.user_a === userId ? c.user_b : c.user_a;
    const friend = profileMap.get(friendId) || null;

    // Last message
    const { data: lastMsgs } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastMessage = lastMsgs?.[0] || null;

    // Unread count
    const { count } = await supabase
      .from('dm_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', c.id)
      .neq('sender_id', userId)
      .eq('read_by_recipient', false);

    enriched.push({
      ...c,
      friend: friend || undefined,
      last_message: lastMessage as DmMessage | null,
      unread_count: count || 0,
    });
  }

  // Sort by latest message locally, just in case last_message_at wasn't fully synced
  return enriched.sort((a, b) => {
    const timeA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : (a.last_message_at ? new Date(a.last_message_at).getTime() : 0);
    const timeB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : (b.last_message_at ? new Date(b.last_message_at).getTime() : 0);
    return timeB - timeA;
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Fetch paginated messages for a conversation. */
export async function getMessages(
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<DmMessage[]> {
  let query = supabase
    .from('dm_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as DmMessage[]).reverse();
}

/** Send a text message. */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  messageType: DmMessageType = 'text',
  metadata: Record<string, unknown> = {},
): Promise<DmMessage> {
  const { data, error } = await supabase
    .from('dm_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: messageType,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DmMessage;
}

/** Mark all messages from the other user as read. */
export async function markMessagesRead(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('dm_messages')
    .update({ read_by_recipient: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('read_by_recipient', false);

  if (error && __DEV__) console.warn('[DM] markMessagesRead failed:', error);
}

/** Get total unread DM messages count across all conversations for a user. */
export async function getTotalUnreadDmCount(userId: string): Promise<number> {
  try {
    // Get all conversation IDs for this user
    const { data: convos } = await supabase
      .from('dm_conversations')
      .select('id')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    if (!convos?.length) return 0;

    const convoIds = convos.map((c) => c.id);

    const { count, error } = await supabase
      .from('dm_messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convoIds)
      .neq('sender_id', userId)
      .eq('read_by_recipient', false);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Share Flashcards
// ---------------------------------------------------------------------------

export async function shareFlashcardDeck(
  conversationId: string,
  senderId: string,
  noteId: string,
  noteTitle: string,
  cards: { front: string; back: string }[],
): Promise<DmMessage> {
  // 1. Insert the message
  const msg = await sendMessage(
    conversationId,
    senderId,
    `📇 Shared flashcard deck: ${noteTitle}`,
    'flashcard_share',
    { note_id: noteId, note_title: noteTitle, card_count: cards.length },
  );

  // 2. Insert shared flashcards record
  const { error } = await supabase
    .from('dm_shared_flashcards')
    .insert({
      message_id: msg.id,
      sender_id: senderId,
      note_id: noteId,
      note_title: noteTitle,
      cards,
    });

  if (error && __DEV__) console.warn('[DM] shareFlashcardDeck insert failed:', error);

  return msg;
}

// ---------------------------------------------------------------------------
// Share Quiz
// ---------------------------------------------------------------------------

export async function shareQuiz(
  conversationId: string,
  senderId: string,
  quizTitle: string,
  quizData: Record<string, unknown>,
): Promise<DmMessage> {
  const questionCount = Array.isArray(quizData.questions) ? quizData.questions.length : 0;

  // 1. Insert the message
  const msg = await sendMessage(
    conversationId,
    senderId,
    `🎯 Shared quiz: ${quizTitle} (${questionCount} questions)`,
    'quiz_share',
    { quiz_title: quizTitle, question_count: questionCount },
  );

  // 2. Insert shared quiz record
  const { error } = await supabase
    .from('dm_shared_quizzes')
    .insert({
      message_id: msg.id,
      sender_id: senderId,
      quiz_title: quizTitle,
      quiz_data: quizData,
    });

  if (error && __DEV__) console.warn('[DM] shareQuiz insert failed:', error);

  return msg;
}

// ---------------------------------------------------------------------------
// Fetch shared content by message ID
// ---------------------------------------------------------------------------

export async function getSharedFlashcards(messageId: string): Promise<DmSharedFlashcard | null> {
  const { data, error } = await supabase
    .from('dm_shared_flashcards')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle();

  if (error) return null;
  return data as DmSharedFlashcard | null;
}

export async function getSharedQuiz(messageId: string): Promise<DmSharedQuiz | null> {
  const { data, error } = await supabase
    .from('dm_shared_quizzes')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle();

  if (error) return null;
  return data as DmSharedQuiz | null;
}

// ---------------------------------------------------------------------------
// Realtime subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to new messages in a conversation via Supabase Realtime.
 * Returns a cleanup function.
 */
export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (msg: DmMessage) => void,
): () => void {
  const channel = supabase
    .channel(`dm-messages-${conversationId}`)
    .on(
      'postgres_changes' as any,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: any) => {
        if (payload.new) {
          onNewMessage(payload.new as DmMessage);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
