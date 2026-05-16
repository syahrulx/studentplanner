-- Enable Realtime for DM messages so the app can receive instant badge updates
begin;
  -- Add dm_messages to the supabase_realtime publication
  alter publication supabase_realtime add table public.dm_messages;
  
  -- (Optional but recommended) Also add conversations if you want to track last_message_at in real-time
  alter publication supabase_realtime add table public.dm_conversations;
commit;
