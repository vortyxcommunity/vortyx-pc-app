import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { DMConversation } from './DMSidebar';
import { Send, Phone, Smile, Trash2, Edit2, X, Image as ImageIcon, Paperclip } from 'lucide-react';
import { useFileUpload } from '@/hooks/useFileUpload';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface DMMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  content: string;
  edited: boolean;
  attachments: any[];
  created_at: string;

}

interface DMReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface Props {
  conversation: DMConversation;
  onStartCall?: (targetUserId: string) => void;
}

const EMOJI_CATEGORIES = [
  { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'] },
  { label: 'Gestures', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄'] },
  { label: 'Hearts', emojis: ['💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍'] },
  { label: 'Misc', emojis: ['🔥', '✨', '⭐', '🌟', '💥', '💯', '💢', '💨', '💦', '💤', '💨', '🕳', '💬', '👁‍🗨', '🗨', '🗯', '💭', '♨️'] },
];

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯', '✨', '🙌'];

const DMChatArea: React.FC<Props> = ({ conversation, onStartCall }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, DMReaction[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();
  const [profiles, setProfiles] = useState<Record<string, { username: string; avatar_url: string | null }>>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = useCallback(async () => {
    const { data: msgData } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (msgData) {
      setMessages(msgData as unknown as DMMessage[]);


      const msgIds = msgData.map(m => m.id);
      if (msgIds.length > 0) {
        const { data: reactData } = await supabase
          .from('dm_message_reactions' as any)
          .select('*')
          .in('message_id', msgIds);

        if (reactData) {
          const reactMap: Record<string, DMReaction[]> = {};
          reactData.forEach((r: any) => {
            if (!reactMap[r.message_id]) reactMap[r.message_id] = [];
            reactMap[r.message_id].push(r);
          });
          setReactions(reactMap);
        }
      }

      const userIds = [...new Set((msgData as unknown as DMMessage[]).map(m => m.user_id))];

      if (userIds.length > 0) {
        const { data: profileData } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
        if (profileData) {
          const map: Record<string, { username: string; avatar_url: string | null }> = {};
          profileData.forEach((p: any) => { map[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
          setProfiles(prev => ({ ...prev, ...map }));
        }
      }
    }
  }, [conversation.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const profilesRef = { current: profiles };
    profilesRef.current = profiles;

    const messageSub = supabase
      .channel(`dm_messages:${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${conversation.id}` }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const msg = payload.new as unknown as DMMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });

          if (!profilesRef.current[msg.user_id]) {
            const { data } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', msg.user_id).single();
            if (data) setProfiles(prev => ({ ...prev, [data.id]: { username: data.username, avatar_url: data.avatar_url } }));
          }
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === (payload.new as unknown as DMMessage).id ? payload.new as unknown as DMMessage : m));
        }

      })
      .subscribe();

    const reactionSub = supabase
      .channel(`dm_reactions:${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_message_reactions' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DMReaction;
          setReactions(prev => ({
            ...prev,
            [r.message_id]: [...(prev[r.message_id] || []), r]
          }));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as DMReaction;
          setReactions(prev => ({
            ...prev,
            [r.message_id]: (prev[r.message_id] || []).filter(x => x.id !== (r as any).id)
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSub);
      supabase.removeChannel(reactionSub);
    };
  }, [conversation.id]);

  const sendMessage = async () => {
    if ((!newMessage.trim() && uploadingFiles.length === 0) || !user) return;
    setSending(true);

    const attachments: any[] = [];
    if (uploadingFiles.length > 0) {
      for (const file of uploadingFiles) {
        const url = await uploadFile(file);
        if (url) {
          attachments.push({
            url,
            name: file.name,
            type: file.type,
            size: file.size
          });
        }
      }
    }

    const { data, error } = await supabase.from('dm_messages').insert({
      conversation_id: conversation.id,
      user_id: user.id,
      content: newMessage.trim(),
      attachments: attachments
    }).select().single();

    if (!error && data) {
      // Create notification for other user
      await supabase.from('notifications' as any).insert({
        user_id: conversation.otherUser.id,
        type: 'dm',
        content: newMessage.trim().substring(0, 100),
        actor_id: user.id,
        is_read: false
      });

      setMessages(prev => {
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, data as unknown as DMMessage];
      });

      setNewMessage('');
      setUploadingFiles([]);
    } else if (error) {
      toast.error("Failed to send message: " + error.message);
    }
    setSending(false);
  };


  const updateMessage = async (id: string) => {
    if (!editContent.trim()) return;
    const { error } = await supabase.from('dm_messages').update({ content: editContent.trim(), edited: true }).eq('id', id);
    if (!error) setEditingId(null);
    else toast.error("Failed to edit message");
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from('dm_messages').delete().eq('id', id);
    if (error) toast.error("Failed to delete message");
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = (reactions[messageId] || []).find(r => r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from('dm_message_reactions' as any).delete().eq('id', existing.id);
    } else {
      await supabase.from('dm_message_reactions' as any).insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const groupedMessages: { date: string; msgs: DMMessage[] }[] = [];
  messages.forEach((msg) => {
    const date = format(new Date(msg.created_at), 'MMMM d, yyyy');
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) last.msgs.push(msg);
    else groupedMessages.push({ date, msgs: [msg] });
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background text-foreground">
      <div className="h-14 px-6 flex items-center border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground font-bold text-sm shadow-sm">
            {conversation.otherUser.avatar_url ? (
              <img src={conversation.otherUser.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              conversation.otherUser.username.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <span className="font-bold text-base block leading-none">{conversation.otherUser.username}</span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
              <span className={`w-2 h-2 rounded-full ${conversation.otherUser.status === 'online' ? 'bg-success' : 'bg-muted-foreground'}`} />
              {conversation.otherUser.status || 'Offline'}
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => onStartCall?.(conversation.otherUser.id)}
            className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
          >
            <Phone className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-6">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider bg-background px-2">{group.date}</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
            {group.msgs.map((msg, i) => {
              const profile = profiles[msg.user_id];
              const isMine = user && msg.user_id === user.id;
              const msgReactions = reactions[msg.id] || [];
              const reactionCounts = msgReactions.reduce((acc, curr) => {
                acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);

              const prevMsg = i > 0 ? group.msgs[i - 1] : null;
              const isConsecutive = prevMsg && prevMsg.user_id === msg.user_id &&
                (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: isMine ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`group flex gap-3 ${isMine ? 'flex-row-reverse' : ''} ${isConsecutive ? 'mt-1' : 'mt-4'}`}
                >
                  {!isConsecutive ? (
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground font-bold text-sm shrink-0 shadow-sm">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        (profile?.username || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                  ) : (
                    <div className="w-10 shrink-0 self-start text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center h-full">
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </div>
                  )}

                  <div className={`max-w-[70%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    {!isConsecutive && (
                      <div className={`flex items-baseline gap-2 mb-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                        <span className="font-bold text-sm text-foreground/90">{profile?.username || 'Unknown'}</span>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), 'HH:mm')}</span>
                      </div>
                    )}

                    <div className={`relative group/bubble flex items-center gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words whitespace-pre-wrap 
                        ${isMine ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-card border border-border rounded-tl-none text-foreground'}`}>
                        {editingId === msg.id ? (
                          <div className="min-w-[200px] flex flex-col gap-2">
                            <Input
                              autoFocus
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') updateMessage(msg.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="bg-background/20 border-white/20 text-inherit"
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingId(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
                              <button onClick={() => updateMessage(msg.id)} className="p-1 hover:bg-white/10 rounded font-bold text-xs">Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.content}
                            {msg.edited && <span className="text-[10px] opacity-70 ml-1.5 italic">(edited)</span>}

                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 flex flex-col gap-2">
                                {msg.attachments.map((att: any, idx: number) => (
                                  <div key={idx} className="max-w-[260px] rounded-lg overflow-hidden border border-white/10 bg-black/20 shadow-sm">
                                    {att.type.startsWith('image/') ? (
                                      <a href={att.url} target="_blank" rel="noopener noreferrer">
                                        <img src={att.url} alt={att.name} className="max-h-[200px] object-contain hover:opacity-80 transition-opacity" />
                                      </a>
                                    ) : (
                                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 hover:bg-white/5 transition-colors">
                                        <Paperclip className="w-4 h-4 text-primary" />
                                        <div className="min-w-0">
                                          <div className="text-[11px] font-medium truncate">{att.name}</div>
                                          <div className="text-[9px] opacity-60">{(att.size / 1024).toFixed(1)} KB</div>
                                        </div>
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                      </div>

                      <div className={`flex opacity-0 group-hover/bubble:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm border border-border rounded-lg p-0.5 shadow-lg absolute -top-8 ${isMine ? 'right-0' : 'left-0'}`}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="p-1.5 hover:bg-accent rounded-md"><Smile className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" /></button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1 grid grid-cols-5 gap-1">
                            {COMMON_EMOJIS.map(e => (
                              <button key={e} onClick={() => toggleReaction(msg.id, e)} className="p-2 hover:bg-accent rounded text-xl leading-none">{e}</button>
                            ))}
                          </PopoverContent>
                        </Popover>

                        {isMine && (
                          <>
                            <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-1.5 hover:bg-accent rounded-md"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                            <button onClick={() => deleteMessage(msg.id)} className="p-1.5 hover:bg-accent rounded-md hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </div>

                    {Object.keys(reactionCounts).length > 0 && (
                      <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                        {Object.entries(reactionCounts).map(([emoji, count]) => {
                          const hasMine = msgReactions.some(r => r.user_id === user?.id && r.emoji === emoji);
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold transition-all
                                ${hasMine ? 'bg-primary/20 border-primary text-primary' : 'bg-card border-border hover:border-muted-foreground'}`}
                            >
                              <span>{emoji}</span>
                              <span>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 pb-6 pt-2 bg-gradient-to-t from-background to-transparent">
        {uploadingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-2">
            {uploadingFiles.map((f, i) => (
              <div key={i} className="relative group px-3 py-1 bg-primary/20 border border-primary/30 rounded-lg text-[10px] flex items-center gap-2">
                <span className="truncate max-w-[120px] font-medium">{f.name}</span>
                <button onClick={() => setUploadingFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative flex items-center bg-card border border-border rounded-2xl p-1 shadow-inner translate-z-0 group-focus-within:border-primary transition-all">
          <input
            type="file"
            multiple
            hidden
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files) {
                setUploadingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground transition-all ml-1"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <Input

            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder={`Message @${conversation.otherUser.username}`}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-sm py-6 px-4"
          />
          <div className="flex items-center gap-1.5 mr-2">
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground transition-all">
                  <Smile className="w-5 h-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-[300px] p-0 bg-card/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl overflow-hidden">
                <div className="p-3 border-b border-border bg-accent/20">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Emojis</h4>
                </div>
                <div className="h-[250px] overflow-y-auto p-2 scrollbar-thin">
                  {EMOJI_CATEGORIES.map(cat => (
                    <div key={cat.label} className="mb-4">
                      <div className="px-2 mb-2 text-[10px] font-bold text-muted-foreground uppercase opacity-70">{cat.label}</div>
                      <div className="grid grid-cols-7 gap-1">
                        {cat.emojis.map(e => (
                          <button
                            key={e}
                            onClick={() => setNewMessage(prev => prev + e)}
                            className="p-1.5 hover:bg-accent rounded-md text-xl transition-all hover:scale-125"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:scale-100"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div >
  );
};

export default DMChatArea;
