import { supabase } from './supabase';
import type { ChatSession, ChatMessage } from '../types';

const SESSIONS_TABLE = 'ai_chat_sessions';
const MESSAGES_TABLE = 'ai_chat_messages';

function rowToSession(row: Record<string, unknown>): ChatSession {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    title: String(row.title),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as 'user' | 'ai',
    content: String(row.content),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function getChatSessions(userId: string, subjectId?: string): Promise<ChatSession[]> {
  let query = supabase
    .from(SESSIONS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (subjectId) {
    query = query.eq('subject_id', subjectId);
  }

  const { data, error } = await query;
  if (error) {
    if (__DEV__) console.error('[ChatDb] getChatSessions failed:', error);
    return [];
  }
  return (data ?? []).map(rowToSession);
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
    
  if (error) {
    if (__DEV__) console.error('[ChatDb] getChatMessages failed:', error);
    return [];
  }
  return (data ?? []).map(rowToMessage);
}

export async function createChatSession(userId: string, session: Omit<ChatSession, 'id'>): Promise<ChatSession> {
  const { data, error } = await supabase.from(SESSIONS_TABLE).insert({
    user_id: userId,
    subject_id: session.subjectId,
    title: session.title,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  }).select().single();
  
  if (error) {
    if (__DEV__) console.error('[ChatDb] createChatSession failed:', error);
    throw error;
  }
  return rowToSession(data);
}

export async function updateChatSessionTimestamp(sessionId: string): Promise<void> {
  const { error } = await supabase.from(SESSIONS_TABLE).update({
    updated_at: new Date().toISOString(),
  }).eq('id', sessionId);
  
  if (error) {
    if (__DEV__) console.error('[ChatDb] updateChatSessionTimestamp failed:', error);
  }
}

export async function deleteChatSession(userId: string, sessionId: string): Promise<void> {
  const { error } = await supabase.from(SESSIONS_TABLE).delete().eq('user_id', userId).eq('id', sessionId);
  if (error) {
    if (__DEV__) console.error('[ChatDb] deleteChatSession failed:', error);
    throw error;
  }
}

export async function createChatMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
  const { data, error } = await supabase.from(MESSAGES_TABLE).insert({
    session_id: message.sessionId,
    role: message.role,
    content: message.content,
    created_at: message.createdAt,
  }).select().single();
  
  if (error) {
    if (__DEV__) console.error('[ChatDb] createChatMessage failed:', error);
    throw error;
  }
  return rowToMessage(data);
}
