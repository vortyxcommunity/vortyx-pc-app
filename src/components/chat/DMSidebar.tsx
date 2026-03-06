import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface DMConversation {
  id: string;
  created_at: string;
  otherUser: { id: string; username: string; avatar_url: string | null; status: string | null };
  lastMessage?: string;
}

interface Props {
  selectedConversation: DMConversation | null;
  onSelectConversation: (c: DMConversation) => void;
  conversations: DMConversation[];
  onRefresh: () => void;
}

const statusColors: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  do_not_disturb: 'bg-destructive',
  offline: 'bg-muted-foreground',
};

const DMSidebar: React.FC<Props> = ({ selectedConversation, onSelectConversation, conversations, onRefresh }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar_url: string | null; user_tag?: string | null }[]>([]);
  const [requestMap, setRequestMap] = useState<Record<string, { status: string; direction: 'sent' | 'received' } | null>>({});
  const [searching, setSearching] = useState(false);

  const searchUsers = async () => {
    if (!searchUsername.trim() || !user) return;
    setSearching(true);
    const term = searchUsername.trim();
    // First try exact id match (search by user id)
    let results: any[] = [];
    const byId = await supabase.from('profiles').select('id, username, avatar_url, user_tag').eq('id', term).neq('id', user.id).limit(1);
    if (byId.data && byId.data.length > 0) {
      results = byId.data as any[];
    } else {
      // Fallback: search by username or user_tag (case-insensitive, partial)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, user_tag')
        .or(`username.ilike.%${term}%,user_tag.ilike.%${term}%`)
        .neq('id', user.id)
        .limit(10);
      results = (data as any[]) || [];
    }
    setSearchResults(results);
    // populate requestMap for results
    const map: Record<string, { status: string; direction: 'sent' | 'received' } | null> = {};
    await Promise.all(results.map(async (r: any) => {
      try {
        const sent = await supabase.from('friend_requests').select('id,status').eq('sender_id', user.id).eq('receiver_id', r.id).maybeSingle();
        if ((sent as any).data) {
          map[r.id] = { status: (sent as any).data.status, direction: 'sent' };
          return;
        }
        const rec = await supabase.from('friend_requests').select('id,status').eq('sender_id', r.id).eq('receiver_id', user.id).maybeSingle();
        if ((rec as any).data) {
          map[r.id] = { status: (rec as any).data.status, direction: 'received' };
          return;
        }
        map[r.id] = null;
      } catch (err) {
        map[r.id] = null;
      }
    }));
    setRequestMap(map);
    setSearching(false);
  };

  const refreshRequestFor = useCallback(async (targetId: string) => {
    if (!user) return;
    try {
      const sent = await supabase.from('friend_requests').select('id,status').eq('sender_id', user.id).eq('receiver_id', targetId).maybeSingle();
      if ((sent as any).data) {
        setRequestMap((m) => ({ ...m, [targetId]: { status: (sent as any).data.status, direction: 'sent' } }));
        return;
      }
      const rec = await supabase.from('friend_requests').select('id,status').eq('sender_id', targetId).eq('receiver_id', user.id).maybeSingle();
      if ((rec as any).data) {
        setRequestMap((m) => ({ ...m, [targetId]: { status: (rec as any).data.status, direction: 'received' } }));
        return;
      }
      setRequestMap((m) => ({ ...m, [targetId]: null }));
    } catch (e) {
      setRequestMap((m) => ({ ...m, [targetId]: null }));
    }
  }, [user]);

  useEffect(() => {
    // clear map when dialog closed
    if (!open) setRequestMap({});
  }, [open]);



  const startDM = async (targetUserId: string) => {
    if (!user) return;
    console.log('startDM called for targetUserId:', targetUserId);
    try {
      // 1. Check if a conversation already exists in the database
      const { data: myParticipations } = await supabase
        .from('dm_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      let existingConvId = null;
      if (myParticipations && myParticipations.length > 0) {
        const convIds = myParticipations.map((p: any) => p.conversation_id).filter(Boolean);
        console.log('My current convIds:', convIds);

        if (convIds.length > 0) {
          const { data: existing, error: existingError } = await supabase
            .from('dm_participants')
            .select('conversation_id')
            .eq('user_id', targetUserId)
            .in('conversation_id', convIds)
            .limit(1);

          if (existingError) {
            console.error('Error checking existing DM:', existingError);
          } else if (existing && existing.length > 0) {
            existingConvId = (existing[0] as any).conversation_id;
            console.log('Found existing conversation ID:', existingConvId);
          }
        }
      }

      let conversationToSelect: DMConversation | null = null;

      if (existingConvId) {
        // 2. If it exists, try to find it in the local list first for speed
        const localConv = conversations.find(c => c.id === existingConvId);
        if (localConv) {
          console.log('Found conversation in local list');
          conversationToSelect = localConv;
        } else {
          // 3. If not in local list, fetch the profile to build the object
          console.log('Fetching profile for targetUserId:', targetUserId);
          const { data: profile } = await supabase.from('profiles').select('id,username,avatar_url,status').eq('id', targetUserId).single();
          if (profile) {
            conversationToSelect = {
              id: existingConvId,
              created_at: '',
              otherUser: {
                id: profile.id,
                username: profile.username,
                avatar_url: profile.avatar_url,
                status: (profile as any).status
              }
            };
          }
        }
      } else {
        // 4. Create new conversation if none exists
        console.log('No existing conversation found, creating new one...');
        const { data: conv } = await supabase.from('dm_conversations').insert({}).select('id').single();
        if (conv) {
          const convId = (conv as any).id;
          console.log('New conversation created with ID:', convId);
          await supabase.from('dm_participants').insert([
            { conversation_id: convId, user_id: user.id },
            { conversation_id: convId, user_id: targetUserId },
          ]);

          const { data: profile } = await supabase.from('profiles').select('id,username,avatar_url,status').eq('id', targetUserId).single();
          if (profile) {
            conversationToSelect = {
              id: convId,
              created_at: '',
              otherUser: {
                id: profile.id,
                username: profile.username,
                avatar_url: profile.avatar_url,
                status: (profile as any).status
              }
            };
          }
        }
      }

      if (conversationToSelect) {
        console.log('Selecting conversation:', conversationToSelect);
        onSelectConversation(conversationToSelect);
        onRefresh(); // Refresh the list to include the new/updated conversation
      } else {
        console.error('Failed to resolve conversation to select');
      }
    } catch (error) {
      console.error('Error starting DM:', error);
    } finally {
      setOpen(false);
      setSearchUsername('');
      setSearchResults([]);
    }
  };

  const sendRequest = async (targetUserId: string) => {
    if (!user) return;
    const { error } = await supabase.from('friend_requests').insert({ sender_id: user.id, receiver_id: targetUserId, status: 'pending' });
    if (!error) {
      await refreshRequestFor(targetUserId);
    }
  };

  const acceptRequest = async (fromUserId: string) => {
    if (!user) return;
    // update request
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('sender_id', fromUserId).eq('receiver_id', user.id);
    // create friendship
    await supabase.from('friendships').insert({ user_id_1: user.id, user_id_2: fromUserId });
    // create DM conversation
    const { data: conv } = await supabase.from('dm_conversations').insert({}).select('id').single();
    if (conv) {
      await supabase.from('dm_participants').insert([
        { conversation_id: (conv as any).id, user_id: user.id },
        { conversation_id: (conv as any).id, user_id: fromUserId },
      ]);
    }
    await refreshRequestFor(fromUserId);
    onRefresh();
  };

  const rejectRequest = async (fromUserId: string) => {
    if (!user) return;
    await supabase.from('friend_requests').update({ status: 'rejected' }).eq('sender_id', fromUserId).eq('receiver_id', user.id);
    await refreshRequestFor(fromUserId);
  };

  return (
    <div className="w-60 h-full bg-card/50 flex flex-col border-r border-border shrink-0 overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border">
        <h2 className="font-semibold text-foreground text-sm">Direct Messages</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">New Message</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search username..."
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                  className="bg-background border-border"
                />
                <Button onClick={searchUsers} disabled={searching} variant="secondary" size="sm">
                  Search
                </Button>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {searchResults.map((u) => {
                  const req = requestMap[u.id] ?? null;
                  return (
                    <div key={u.id} className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md hover:bg-accent transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground font-semibold text-xs">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            u.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm text-foreground block truncate">{u.username}</span>
                          {u.user_tag && <span className="text-xs text-muted-foreground">{u.user_tag}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!req && (
                          <Button type="button" size="sm" className="z-50" onClick={() => sendRequest(u.id)}>
                            Send Request
                          </Button>
                        )}
                        {req && req.status === 'pending' && req.direction === 'sent' && (
                          <span className="text-sm text-muted-foreground">Pending</span>
                        )}
                        {req && req.status === 'pending' && req.direction === 'received' && (
                          <div className="flex items-center gap-2">
                            <Button type="button" size="sm" className="z-50" onClick={() => acceptRequest(u.id)}>
                              Accept
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="z-50" onClick={() => rejectRequest(u.id)}>
                              Reject
                            </Button>
                          </div>
                        )}
                        {req && req.status === 'accepted' && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              startDM(u.id);
                            }}
                          >
                            Message
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {searchResults.length === 0 && searchUsername && !searching && (
                  <p className="text-sm text-muted-foreground text-center py-2">No users found</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            type="button"
            onClick={() => onSelectConversation(conv)}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${selectedConversation?.id === conv.id
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground font-semibold text-xs shrink-0">
                {conv.otherUser.avatar_url ? (
                  <img src={conv.otherUser.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  conv.otherUser.username.charAt(0).toUpperCase()
                )}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${statusColors[conv.otherUser.status || 'offline']}`} />
            </div>
            <span className="truncate">{conv.otherUser.username}</span>
          </button>
        ))}
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No conversations yet</p>
        )}
      </div>
    </div>
  );
};

export default DMSidebar;
