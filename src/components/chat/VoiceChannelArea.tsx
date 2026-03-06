import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Mic, MicOff, Volume2, PhoneOff, Signal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { voiceSounds } from '@/utils/sounds';


interface Props {
    channel: any;
    onLeave: () => void;
}

interface VoiceMember {
    user_id: string;
    username: string;
    avatar_url: string | null;
    is_muted: boolean;
    is_speaking: boolean;
}

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const VoiceChannelArea: React.FC<Props> = ({ channel, onLeave }) => {
    const { user } = useAuth();
    const [members, setMembers] = useState<VoiceMember[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [connected, setConnected] = useState(false);
    const [userRole, setUserRole] = useState<string>('member');

    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Record<string, RTCPeerConnection>>({});
    const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
    const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

    const voiceStatesSubRef = useRef<any>(null);
    const signalChannelRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analysersRef = useRef<Record<string, AnalyserNode>>({});
    const animationFrameRef = useRef<number | null>(null);

    const cleanupPeers = () => {
        Object.values(peersRef.current).forEach(pc => pc.close());
        peersRef.current = {};
        Object.values(audioElementsRef.current).forEach(el => {
            el.pause();
            el.srcObject = null;
            el.remove();
        });
        audioElementsRef.current = {};
        remoteStreamsRef.current = {};
    };

    const createPeerConnection = (targetUserId: string, isInitiator: boolean) => {
        if (peersRef.current[targetUserId]) {
            peersRef.current[targetUserId].close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peersRef.current[targetUserId] = pc;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current!);
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && signalChannelRef.current) {
                signalChannelRef.current.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: {
                        from: user?.id,
                        to: targetUserId,
                        ice: event.candidate,
                    },
                });
            }
        };

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            remoteStreamsRef.current[targetUserId] = stream;

            if (!audioElementsRef.current[targetUserId]) {
                const audio = new Audio();
                audio.autoplay = true;
                audio.srcObject = stream;
                audioElementsRef.current[targetUserId] = audio;

                // Setup audio analysis for green border
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }
                const ctx = audioContextRef.current;
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                analysersRef.current[targetUserId] = analyser;
            } else {
                audioElementsRef.current[targetUserId].srcObject = stream;
            }
        };

        if (isInitiator) {
            pc.createOffer().then(offer => {
                pc.setLocalDescription(offer);
                signalChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: {
                        from: user?.id,
                        to: targetUserId,
                        sdp: offer,
                    },
                });
            });
        }

        return pc;
    };

    useEffect(() => {
        if (!user) return;

        const startVoice = async () => {
            try {
                // Robust check for mediaDevices existence to avoid runtime errors
                if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
                    throw new Error("Voice chat is not supported in this browser or requires a secure connection (HTTPS / localhost).");
                }

                if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
                    throw new Error("Your browser does not support microphone access in this context.");
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
                    console.error("Microphone access error:", err);
                    throw new Error(err.name === 'NotAllowedError' ? "Microphone access denied. Please check your browser settings." : `Microphone error: ${err.message}`);
                });

                localStreamRef.current = stream;
                stream.getAudioTracks().forEach(t => t.enabled = !isMuted);

                const { error: joinErr } = await supabase
                    .from('server_voice_states' as any)
                    .upsert({
                        server_id: channel.server_id,
                        channel_id: channel.id,
                        user_id: user.id,
                        is_muted: isMuted
                    }, { onConflict: 'user_id' });

                if (joinErr) {
                    console.error('Supabase join error:', joinErr);
                    throw new Error(`Database error: ${joinErr.message}`);
                }

                // Local speaking detection
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }
                const source = audioContextRef.current.createMediaStreamSource(stream);
                const analyser = audioContextRef.current.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                analysersRef.current['local'] = analyser;

                setConnected(true);
                voiceSounds.join();

                signalChannelRef.current = supabase.channel(`voice_signal_${channel.id}`);

                signalChannelRef.current
                    .on('broadcast', { event: 'signal' }, (payload: any) => {
                        const { from, to, sdp, ice } = payload.payload;
                        if (to !== user.id) return;

                        let pc = peersRef.current[from];
                        if (!pc) pc = createPeerConnection(from, false);

                        if (sdp) {
                            pc.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
                                if (sdp.type === 'offer') {
                                    pc.createAnswer().then(answer => {
                                        pc.setLocalDescription(answer);
                                        signalChannelRef.current.send({
                                            type: 'broadcast',
                                            event: 'signal',
                                            payload: { from: user.id, to: from, sdp: answer },
                                        });
                                    });
                                }
                            });
                        } else if (ice) {
                            pc.addIceCandidate(new RTCIceCandidate(ice)).catch(e => console.error(e));
                        }
                    })
                    .on('presence', { event: 'join' }, ({ newPresences }: any) => {
                        newPresences.forEach((p: any) => {
                            if (p.user_id && p.user_id !== user.id) {
                                voiceSounds.join();
                                createPeerConnection(p.user_id, true);
                            }
                        });
                    })
                    .on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
                        leftPresences.forEach((p: any) => {
                            if (p.user_id && p.user_id !== user.id) {
                                voiceSounds.leave();
                            }
                        });
                    })
                    .subscribe(async (status: string) => {

                        if (status === 'SUBSCRIBED') {
                            await signalChannelRef.current.track({ user_id: user.id });
                        }
                    });

            } catch (err: any) {
                console.error('Core Voice Error:', err);
                toast.error(`Failed to join: ${err.message || 'Unknown error'}`);
                onLeave();
            }
        };

        const detectSpeaking = () => {
            if (analysersRef.current) {
                const newSpeakingMap: Record<string, boolean> = {};
                if (localStreamRef.current && analysersRef.current['local'] && !isMuted) {
                    const dataArray = new Uint8Array(analysersRef.current['local'].frequencyBinCount);
                    analysersRef.current['local'].getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                    newSpeakingMap[user?.id || ''] = average > 10; // Lowered from 25 for better sensitivity
                }

                Object.entries(analysersRef.current).forEach(([uid, analyser]) => {
                    if (uid === 'local') return;
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                    newSpeakingMap[uid] = average > 10; // Lowered from 25
                });

                setMembers(prev => prev.map(m => ({
                    ...m,
                    is_speaking: !!newSpeakingMap[m.user_id]
                })));
            }
            animationFrameRef.current = requestAnimationFrame(detectSpeaking);
        };

        startVoice();
        animationFrameRef.current = requestAnimationFrame(detectSpeaking);

        const fetchMembers = async () => {
            const { data: states } = await supabase
                .from('server_voice_states' as any)
                .select('user_id, is_muted')
                .eq('channel_id', channel.id);

            if (states) {
                const userIds = states.map((s: any) => s.user_id);
                const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
                const profileMap: Record<string, any> = {};
                profiles?.forEach(p => profileMap[p.id] = p);

                setMembers(states.map((s: any) => ({
                    user_id: s.user_id,
                    username: profileMap[s.user_id]?.username || 'Unknown',
                    avatar_url: profileMap[s.user_id]?.avatar_url || null,
                    is_muted: s.is_muted,
                    is_speaking: false
                })));
            }
        };

        fetchMembers();
        voiceStatesSubRef.current = supabase.channel(`voice_db_${channel.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'server_voice_states', filter: `channel_id=eq.${channel.id}` }, fetchMembers)
            .subscribe();

        const fetchUserRole = async () => {
            if (!user) return;
            const { data } = await supabase.from('server_members').select('role').eq('server_id', channel.server_id).eq('user_id', user.id).single();
            if (data) setUserRole((data as any).role);
        };
        fetchUserRole();

        return () => {
            if (voiceStatesSubRef.current) supabase.removeChannel(voiceStatesSubRef.current);
            if (signalChannelRef.current) supabase.removeChannel(signalChannelRef.current);
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
            cleanupPeers();
            voiceSounds.leave();
        };

    }, [user, channel.id]);

    const roleOrder = ['member', 'moderator', 'admin', 'owner'];
    const canSpeak = (() => {
        if (!channel.send_role || channel.send_role === 'member') return true;
        const userRoleIdx = roleOrder.indexOf(userRole);
        const requiredRoleIdx = roleOrder.indexOf(channel.send_role);
        return userRoleIdx >= requiredRoleIdx || userRole === 'owner';
    })();

    const toggleMute = async () => {
        if (!canSpeak) {
            toast.error("You don't have permission to speak in this channel");
            return;
        }
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        if (newMuted) voiceSounds.mute(); else voiceSounds.unmute();
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newMuted);

        if (user) await supabase.from('server_voice_states' as any).update({ is_muted: newMuted }).eq('user_id', user.id);
    };

    return (
        <div className="flex-1 flex flex-col bg-background/30 backdrop-blur-md overflow-hidden animate-in fade-in duration-500">
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-lg text-primary"><Volume2 className="w-5 h-5" /></div>
                    <div>
                        <h2 className="font-bold text-foreground text-sm">{channel.name}</h2>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                                {connected ? 'Voice Connected' : 'Connecting...'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleMute}
                        className={!canSpeak ? "opacity-20 cursor-not-allowed" : (isMuted ? "text-destructive" : "text-muted-foreground")}
                        disabled={!canSpeak}
                    >
                        {!canSpeak ? <MicOff className="w-5 h-5" /> : (isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />)}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={onLeave} className="gap-2 px-4 shadow-lg shadow-destructive/20 h-8 text-xs font-bold uppercase">
                        <PhoneOff className="w-3.5 h-3.5" /> Disconnect
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 flex flex-wrap content-start justify-center gap-6">
                <AnimatePresence>
                    {members.map((m) => (
                        <motion.div key={m.user_id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative group">
                            <div className={`w-32 h-32 rounded-[2rem] overflow-hidden border-4 transition-all duration-300 ${m.is_speaking ? 'border-success ring-[12px] ring-success/20 scale-105' : 'border-white/5 bg-card/50'}`}>
                                {m.avatar_url ? (
                                    <img src={m.avatar_url} alt={m.username} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-secondary flex items-center justify-center text-3xl font-bold opacity-20">
                                        {m.username.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                {m.is_muted && (
                                    <div className="absolute top-2 right-2 bg-destructive text-white p-1.5 rounded-xl shadow-lg ring-2 ring-black/20">
                                        <MicOff className="w-3.5 h-3.5" />
                                    </div>
                                )}
                            </div>
                            <p className="mt-3 text-sm font-bold text-center text-foreground/80 truncate w-32 tracking-tight">{m.username}</p>
                            {m.user_id === user?.id && <p className="text-[10px] text-center text-primary font-bold uppercase tracking-widest mt-0.5 opacity-60">You</p>}
                        </motion.div>
                    ))}
                </AnimatePresence>
                {members.length === 0 && <div className="flex-1 flex flex-col items-center justify-center opacity-40 py-20"><Volume2 className="w-16 h-16 mb-4" /><p className="font-medium">Channel is empty</p></div>}
            </div>

            <div className="px-6 py-3 bg-black/10 border-t border-white/5 flex items-center gap-4 text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                <div className="flex items-center gap-1.5"><Signal className="w-3.5 h-3.5 text-success" /><span>RTC Mesh Active</span></div>
                <span className="opacity-20">|</span>
                <span>Optimized Voice Stream</span>
            </div>
        </div>
    );
};

export default VoiceChannelArea;
