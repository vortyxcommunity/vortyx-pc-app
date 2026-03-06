import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import ServerSidebar from '@/components/chat/ServerSidebar';
import ChannelSidebar from '@/components/chat/ChannelSidebar';
import ChatArea from '@/components/chat/ChatArea';
import MemberSidebar from '@/components/chat/MemberSidebar';
import DMSidebar, { DMConversation } from '@/components/chat/DMSidebar';
import DMChatArea from '@/components/chat/DMChatArea';
import VoiceCallOverlay from '@/components/chat/VoiceCallOverlay';
import VoiceChannelArea from '@/components/chat/VoiceChannelArea';
import UserProfileModal from '@/components/chat/UserProfileModal';
import { Navigate } from 'react-router-dom';

import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { audioService } from '@/lib/audio';
import { Bell, MessageSquare, PhoneCall, Info, XCircle, CheckCircle2 } from 'lucide-react';
import { useDesktopNotification } from "@/hooks/useDesktopNotification";

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  description: string;
  is_private: boolean;
  pin: string | null;
}

export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

export interface Channel {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  type: 'text' | 'voice';
  topic: string;
  position: number;
  view_role?: 'owner' | 'admin' | 'moderator' | 'member';
  send_role?: 'owner' | 'admin' | 'moderator' | 'member';
}

export interface Notification {
  id: string;
  type: 'friend_request' | 'mention' | 'server_invite' | 'system' | 'message' | 'dm';
  content: string;
  is_read: boolean;
  created_at: string;
  actor_id?: string;
  actor?: { id: string; username: string; avatar_url: string | null };
}


type View = 'servers' | 'dms';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const { showNotification: showNativeNotification } = useDesktopNotification();

  const showPremiumToast = useCallback((title: string, description: string, type: 'message' | 'call' | 'info' | 'success' | 'error' = 'info') => {
    const icons = {
      message: <MessageSquare className="w-5 h-5 text-primary" />,
      call: <PhoneCall className="w-5 h-5 text-success animate-pulse" />,
      info: <Info className="w-5 h-5 text-primary" />,
      success: <CheckCircle2 className="w-5 h-5 text-success" />,
      error: <XCircle className="w-5 h-5 text-destructive" />,
    };

    audioService.play(type === 'call' ? 'INCOMING_CALL' : (type === 'message' ? 'MESSAGE' : 'NOTIFICATION'), type === 'call');

    // Trigger Native Notification for Windows if in Electron
    showNativeNotification(title, description);

    toast.custom((t) => (
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-card/95 backdrop-blur-xl border border-primary/20 p-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px] pointer-events-auto"
      >
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-foreground truncate">{title}</h4>
          <p className="text-xs text-muted-foreground truncate opacity-80">{description}</p>
        </div>
        <button
          onClick={() => toast.dismiss(t)}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
        >
          <Bell className="w-4 h-4 text-muted-foreground" />
        </button>
      </motion.div>
    ), { duration: type === 'call' ? 15000 : 5000 });
  }, [showNativeNotification]);

  const [profilesCache, setProfilesCache] = useState<Record<string, any>>({});
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showMembers, setShowMembers] = useState(true);
  const [view, setView] = useState<View>('servers');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const statusColors: Record<string, string> = {
    online: 'bg-success',
    idle: 'bg-warning',
    do_not_disturb: 'bg-destructive',
    offline: 'bg-muted-foreground',
  };
  const [dmConversations, setDmConversations] = useState<DMConversation[]>([]);
  const [selectedDM, setSelectedDM] = useState<DMConversation | null>(null);
  const [friends, setFriends] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<{ id: string; sender_id: string; sender?: { id: string; username: string; avatar_url: string | null } }[]>([]);
  const [activeCall, setActiveCall] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const prevNotifCount = useRef(0);

  const fetchServers = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('servers')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setServers(data as unknown as Server[]);
  }, [user]);

  useEffect(() => { fetchServers(); }, [fetchServers]);
  useEffect(() => { if (user) audioService.init(); }, [user]);

  const fetchChannels = useCallback(async () => {
    if (!selectedServer) {
      setChannels([]);
      setCategories([]);
      return;
    }

    const [channelsRes, categoriesRes] = await Promise.all([
      supabase.from('channels').select('*').eq('server_id', selectedServer.id).order('position', { ascending: true }),
      supabase.from('server_categories' as any).select('*').eq('server_id', selectedServer.id).order('position', { ascending: true })
    ]);

    if (categoriesRes.data) setCategories(categoriesRes.data as unknown as Category[]);
    if (channelsRes.data) {
      const typed = channelsRes.data as unknown as Channel[];

      setChannels(typed);

      // Clear selected channel if it's no longer in the list (e.g. permission changed)
      if (selectedChannel && !typed.find(c => c.id === selectedChannel.id)) {
        const textChannel = typed.find(c => c.type === 'text');
        setSelectedChannel(textChannel || null);
      } else if (!selectedChannel || selectedChannel.server_id !== selectedServer.id) {
        const textChannel = typed.find(c => c.type === 'text');
        setSelectedChannel(textChannel || null);
      }
    }
  }, [selectedServer]);


  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const fetchDMConversations = useCallback(async () => {
    if (!user) return;
    const { data: myParts } = await supabase
      .from('dm_participants')
      .select('conversation_id')
      .eq('user_id', user.id);
    if (!myParts || myParts.length === 0) { setDmConversations([]); return; }

    const convIds = myParts.map((p: any) => p.conversation_id);
    const { data: otherParts } = await supabase
      .from('dm_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds)
      .neq('user_id', user.id);

    if (!otherParts) { setDmConversations([]); return; }

    const otherUserIds = [...new Set(otherParts.map((p: any) => p.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, status')
      .in('id', otherUserIds);

    const profileMap: Record<string, any> = {};
    profiles?.forEach((p: any) => { profileMap[p.id] = p; });

    const convs: DMConversation[] = otherParts.map((p: any) => ({
      id: p.conversation_id,
      created_at: '',
      otherUser: profileMap[p.user_id] || { id: p.user_id, username: 'Unknown', avatar_url: null, status: 'offline' },
    }));

    setDmConversations(convs);
  }, [user]);

  useEffect(() => { fetchDMConversations(); }, [fetchDMConversations]);

  const activeCallRef = useRef<any>(null);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  // Global Realtime Events (Calls, Messages & Notifications)
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    // Explicitly select profile details for the actor
    const { data, error } = await supabase
      .from('notifications' as any)
      .select(`
        *,
        actor:profiles!actor_id(id, username, avatar_url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Notification Fetch Error:', error);
      return;
    }

    if (data) {
      setNotifications(data as any);
      const unread = data.filter((n: any) => !n.is_read).length;
      if (unread > prevNotifCount.current) {
        audioService.play('NOTIFICATION');
      }
      prevNotifCount.current = unread;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Use highly specific channel names for stability
    const notifSub = supabase.channel(`notifs_active_${user.id}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('New Notification Received:', payload);
          fetchNotifications();
          const n = payload.new as any;
          showNativeNotification('Vortyx', n.content);
        }
      )
      .subscribe(async (status) => {
        console.log(`Notification Subscription: ${status}`);
        if (status === 'CHANNEL_ERROR') {
          console.error('Notification channel error - check RLS and connectivity');
        }
      });

    const callSub = supabase
      .channel(`incoming_calls_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_calls',
        filter: `receiver_id=eq.${user.id}`
      }, async (payload) => {
        console.log('Incoming call event:', payload);
        const call = payload.new as any;
        if (call.status === 'ringing') {
          const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', call.caller_id).single();
          setActiveCall({ ...call, otherUser: profile || { username: 'Unknown', avatar_url: null } });
          showPremiumToast('Incoming Call', `${profile?.username || 'Someone'} is calling...`, 'call');
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'dm_calls'
      }, async (payload) => {
        const call = payload.new as any;
        const currentCall = activeCallRef.current;
        if (currentCall?.id === call.id) {
          if (call.status === 'ended' || call.status === 'declined') {
            setActiveCall(null);
            audioService.stopAll();
            showPremiumToast('Call Ended', '', 'info');
          } else if (call.status === 'active') {
            setActiveCall((prev: any) => prev ? { ...prev, status: 'active' } : null);
            audioService.stopAll();
          }
        }
      })
      .subscribe((status) => {
        console.log(`Call subscription status: ${status}`);
      });

    return () => {
      supabase.removeChannel(notifSub);
      supabase.removeChannel(callSub);
      audioService.stopAll();
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications' as any).update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const deleteNotif = async (id: string) => {
    await supabase.from('notifications' as any).delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = async () => {
    if (!user) return;
    setNotifications([]); // Clear instantly for UI speed
    await supabase.from('notifications' as any).delete().eq('user_id', user.id);
    toast.success('Notifications cleared');
  };

  const handleNotifFriendRequest = async (notif: Notification, accept: boolean) => {
    if (!user || !notif.actor_id) return;
    if (accept) {
      await acceptRequest('', notif.actor_id); // Reuses existing accept logic
      toast.success("Friend request accepted!");
    } else {
      await supabase.from('friend_requests').update({ status: 'rejected' }).eq('sender_id', notif.actor_id).eq('receiver_id', user.id);
      toast.info("Friend request rejected");
    }
    await markAsRead(notif.id);
    await deleteNotif(notif.id);
  };

  const leaveVoiceChannel = useCallback(async () => {
    if (!user) return;
    await supabase.from('server_voice_states' as any).delete().eq('user_id', user.id);
  }, [user]);

  useEffect(() => {
    if (selectedChannel?.type !== 'voice') {
      leaveVoiceChannel();
    }
  }, [selectedChannel, leaveVoiceChannel]);

  useEffect(() => {
    if (selectedDM) {
      // Logic for DMs
    }
  }, [selectedDM]);

  const fetchFriends = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('friendships').select('user_id_1,user_id_2').or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);
    if (!data) { setFriends([]); return; }
    const otherIds = data.map((f: any) => (f.user_id_1 === user.id ? f.user_id_2 : f.user_id_1));
    if (otherIds.length === 0) { setFriends([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id,username,avatar_url,status').in('id', otherIds as string[]);
    setFriends((profiles || []) as any[]);
  }, [user]);

  const fetchIncomingRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('friend_requests').select('id,sender_id,status').eq('receiver_id', user.id).eq('status', 'pending');
    if (data) {
      const senders = data.map((r: any) => r.sender_id);
      const { data: profiles } = await supabase.from('profiles').select('id,username,avatar_url').in('id', senders as string[]);
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => (profileMap[p.id] = p));
      setIncomingRequests((data as any[]).map((r: any) => ({ id: r.id, sender_id: r.sender_id, sender: profileMap[r.sender_id] })));
    } else setIncomingRequests([]);
  }, [user]);

  useEffect(() => {
    if (view === 'dms') {
      fetchFriends();
      fetchIncomingRequests();
    }
  }, [view, fetchFriends, fetchIncomingRequests]);

  const startOrOpenDM = async (targetUserId: string) => {
    if (!user) return;
    try {
      const { data: myParts } = await supabase.from('dm_participants').select('conversation_id').eq('user_id', user.id);
      const convIds = myParts?.map((p: any) => p.conversation_id).filter(Boolean) || [];

      let existingConvId = null;
      if (convIds.length > 0) {
        const { data: existing } = await supabase.from('dm_participants').select('conversation_id').eq('user_id', targetUserId).in('conversation_id', convIds).limit(1);
        if (existing && existing.length > 0) existingConvId = (existing[0] as any).conversation_id;
      }

      let conversationToSelect: DMConversation | null = null;
      if (existingConvId) {
        const { data: profile } = await supabase.from('profiles').select('id,username,avatar_url,status').eq('id', targetUserId).single();
        if (profile) conversationToSelect = { id: existingConvId, created_at: '', otherUser: { id: profile.id, username: profile.username, avatar_url: profile.avatar_url, status: (profile as any).status } };
      } else {
        const { data: conv } = await supabase.from('dm_conversations').insert({}).select('id').single();
        if (conv) {
          const convId = (conv as any).id;
          await supabase.from('dm_participants').insert([{ conversation_id: convId, user_id: user.id }, { conversation_id: convId, user_id: targetUserId }]);
          const { data: profile } = await supabase.from('profiles').select('id,username,avatar_url,status').eq('id', targetUserId).single();
          if (profile) conversationToSelect = { id: convId, created_at: '', otherUser: { id: profile.id, username: profile.username, avatar_url: profile.avatar_url, status: (profile as any).status } };
        }
      }

      if (conversationToSelect) {
        setView('dms');
        setSelectedDM(conversationToSelect);
        fetchDMConversations();
      }
    } catch (error) {
      console.error('Error in startOrOpenDM:', error);
    }
  };

  const startVoiceCall = async (conversationId: string, targetUserId: string) => {
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', targetUserId).single();
    const { data, error } = await supabase.from('dm_calls' as any).insert({
      caller_id: user.id,
      receiver_id: targetUserId,
      conversation_id: conversationId,
      status: 'ringing'
    }).select().single();

    if (!error && data) {
      setActiveCall({ ...(data as any), otherUser: profile || { username: 'Unknown', avatar_url: null } });
      audioService.play('OUTGOING_CALL', true);
    } else if (error) {
      toast.error("Failed to start call: " + error.message);
    }
  };

  const acceptRequest = async (requestId: string, fromUserId: string) => {
    if (!user) return;
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
    await supabase.from('friendships').insert({ user_id_1: user.id, user_id_2: fromUserId });
    const { data: conv } = await supabase.from('dm_conversations').insert({}).select('id').single();
    if (conv) {
      await supabase.from('dm_participants').insert([
        { conversation_id: (conv as any).id, user_id: user.id },
        { conversation_id: (conv as any).id, user_id: fromUserId },
      ]);
    }
    await fetchFriends();
    await fetchIncomingRequests();
    await fetchDMConversations();
  };

  const rejectRequest = async (requestId: string) => {
    if (!user) return;
    await supabase.from('friend_requests').update({ status: 'rejected' }).eq('id', requestId);
    await fetchIncomingRequests();
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex h-full bg-background overflow-hidden" onClick={() => audioService.init()} onKeyDown={() => audioService.init()}>
      <ServerSidebar
        servers={servers}
        selectedServer={selectedServer}
        onSelectServer={(s) => { setView('servers'); setSelectedServer(s); setSelectedChannel(null); setSelectedDM(null); }}
        onServersUpdate={fetchServers}
        onDMClick={() => { setView('dms'); setSelectedServer(null); setSelectedChannel(null); }}
        isDMView={view === 'dms'}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onDeleteNotif={deleteNotif}
        onClearAll={clearAllNotifications}
        onHandleFriendRequest={handleNotifFriendRequest}
      />

      {view === 'dms' ? (
        <>
          <DMSidebar selectedConversation={selectedDM} onSelectConversation={(c) => { setView('dms'); setSelectedDM(c); }} conversations={dmConversations} onRefresh={fetchDMConversations} />
          {selectedDM ? (
            <DMChatArea conversation={selectedDM} onStartCall={(targetId) => startVoiceCall(selectedDM.id, targetId)} />
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <h2 className="text-xl font-bold mb-4">Activity Center</h2>
              <div className="space-y-4">
                {incomingRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-4 bg-card/50 rounded-2xl border border-white/5 shadow-xl cursor-pointer hover:bg-white/5 transition-colors" onClick={() => r.sender_id && setProfileUserId(r.sender_id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-secondary overflow-hidden">
                        {r.sender?.avatar_url ? <img src={r.sender.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold">{r.sender?.username?.charAt(0)}</div>}
                      </div>
                      <div>
                        <div className="font-bold">{r.sender?.username}</div>
                        <div className="text-xs text-muted-foreground uppercase tracking-widest font-black opacity-30">Friend Request</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); acceptRequest(r.id, r.sender_id); }}>Accept</Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); rejectRequest(r.id); }}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : selectedServer ? (
        <>
          <ChannelSidebar server={selectedServer} categories={categories} channels={channels} selectedChannel={selectedChannel} onSelectChannel={setSelectedChannel} onChannelsUpdate={() => { fetchChannels(); fetchServers(); }} />
          {selectedChannel && selectedChannel.type === 'text' ? (
            <ChatArea channel={selectedChannel} showMembers={showMembers} onToggleMembers={() => setShowMembers(!showMembers)} onMemberClick={(id) => setProfileUserId(id)} />
          ) : selectedChannel && selectedChannel.type === 'voice' ? (
            <VoiceChannelArea channel={selectedChannel} onLeave={() => setSelectedChannel(null)} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground opacity-20">Select a channel to start</div>
          )}
          {showMembers && selectedServer && selectedChannel?.type !== 'voice' && (
            <MemberSidebar serverId={selectedServer.id} onMemberClick={(id) => setProfileUserId(id)} />
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground opacity-20"><motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>Welcome to Vortyx</motion.div></div>
      )}

      <UserProfileModal
        userId={profileUserId}
        serverId={selectedServer?.id}
        onOpenChange={(open) => !open && setProfileUserId(null)}
        onStartDM={startOrOpenDM}
      />
      <VoiceCallOverlay user={user} activeCall={activeCall} onEnd={() => setActiveCall(null)} showToast={showPremiumToast} />
    </div>
  );
};

export default MainApp;
