import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { audioService } from '@/lib/audio';

interface CallData {
    id: string;
    caller_id: string;
    receiver_id: string;
    conversation_id: string;
    status: 'ringing' | 'active' | 'ended' | 'declined';
    otherUser: { username: string; avatar_url: string | null };
}

interface Props {
    user: any;
    activeCall: CallData | null;
    onEnd: () => void;
    showToast: (title: string, description: string, type: 'message' | 'call' | 'info' | 'success' | 'error') => void;
}

const VoiceCallOverlay: React.FC<Props> = ({ user, activeCall, onEnd, showToast }) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [duration, setDuration] = useState(0);
    const [isOtherSpeaking, setIsOtherSpeaking] = useState(false);

    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const channelRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const hasInitializedRef = useRef<string | null>(null);

    // Looping ringtone for incoming calls
    useEffect(() => {
        if (activeCall?.status === 'ringing' && activeCall.receiver_id === user.id) {
            audioService.play('INCOMING_CALL', true);
        }
        return () => {
            audioService.stop('INCOMING_CALL');
        };
    }, [activeCall?.status, activeCall?.id, activeCall?.receiver_id, user.id]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (activeCall?.status === 'active') {
            timer = setInterval(() => setDuration(d => d + 1), 1000);
        } else {
            setDuration(0);
        }
        return () => clearInterval(timer);
    }, [activeCall?.status]);

    const setupWebRTC = async () => {
        if (!activeCall || !user) return;
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Voice call requires a secure connection (HTTPS) or localhost.");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionRef.current = pc;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];

                if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                const source = audioContextRef.current.createMediaStreamSource(event.streams[0]);
                const analyser = audioContextRef.current.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                remoteAnalyserRef.current = analyser;
            };

            const channel = supabase.channel(`call_signaling_${activeCall.id}`);
            channelRef.current = channel;
            pc.onicecandidate = (event) => {
                if (event.candidate) channel.send({ type: 'broadcast', event: 'candidate', payload: { candidate: event.candidate, from: user.id } });
            };

            channel
                .on('broadcast', { event: 'offer' }, async ({ payload }) => {
                    if (payload.from !== user.id) {
                        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        channel.send({ type: 'broadcast', event: 'answer', payload: { answer, from: user.id } });
                    }
                })
                .on('broadcast', { event: 'answer' }, async ({ payload }) => {
                    if (payload.from !== user.id) await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
                })
                .on('broadcast', { event: 'candidate' }, async ({ payload }) => {
                    if (payload.from !== user.id) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED' && activeCall.caller_id === user.id) {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        channel.send({ type: 'broadcast', event: 'offer', payload: { offer, from: user.id } });
                    }
                });
        } catch (err: any) {
            showToast('Connection Failed', 'Could not access microphone.', 'error');
            endCall();
        }
    };

    const detectSpeaking = () => {
        if (remoteAnalyserRef.current) {
            const dataArray = new Uint8Array(remoteAnalyserRef.current.frequencyBinCount);
            remoteAnalyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            setIsOtherSpeaking(average > 25);
        }
        animationFrameRef.current = requestAnimationFrame(detectSpeaking);
    };

    useEffect(() => {
        if (activeCall?.status === 'active' && hasInitializedRef.current !== activeCall.id) {
            hasInitializedRef.current = activeCall.id;
            setupWebRTC();
            animationFrameRef.current = requestAnimationFrame(detectSpeaking);
        }
        return () => {
            if (!activeCall || activeCall.status === 'ended') {
                hasInitializedRef.current = null;
                localStreamRef.current?.getTracks().forEach(t => t.stop());
                peerConnectionRef.current?.close();
                if (channelRef.current) supabase.removeChannel(channelRef.current);
                if (audioContextRef.current) audioContextRef.current.close();
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [activeCall?.status, activeCall?.id]);

    const toggleMute = () => {
        if (localStreamRef.current) {
            const newState = !isMuted;
            localStreamRef.current.getAudioTracks().forEach(track => track.enabled = !newState);
            setIsMuted(newState);
        }
    };

    const endCall = async () => {
        if (activeCall) await supabase.from('dm_calls' as any).update({ status: 'ended' }).eq('id', activeCall.id);
        onEnd();
    };

    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

    if (!activeCall) return null;

    return (
        <AnimatePresence>
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] w-[360px]">
                <div className="bg-card/95 backdrop-blur-2xl border border-primary/30 shadow-2xl rounded-[32px] p-6 relative overflow-hidden">
                    <div className="flex items-center gap-5 relative z-10">
                        <div className={`w-20 h-20 rounded-3xl bg-secondary flex items-center justify-center overflow-hidden ring-4 transition-all duration-300 ${isOtherSpeaking ? 'ring-success ring-offset-4 ring-offset-card' : 'ring-primary/20'}`}>
                            {activeCall.otherUser.avatar_url ? (
                                <img src={activeCall.otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-3xl font-bold opacity-20">{activeCall.otherUser.username.charAt(0)}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-xl truncate">{activeCall.otherUser.username}</h3>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{activeCall.status === 'active' ? formatTime(duration) : 'Calling...'}</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-4 mt-8">
                        {activeCall.status === 'ringing' && activeCall.receiver_id === user.id ? (
                            <Button onClick={() => supabase.from('dm_calls' as any).update({ status: 'active' }).eq('id', activeCall.id)} className="w-14 h-14 rounded-full bg-success hover:scale-110 transition-transform"><Phone className="w-7 h-7 fill-current" /></Button>
                        ) : null}
                        <Button onClick={toggleMute} variant="secondary" className={`w-12 h-12 rounded-full ${isMuted ? 'bg-destructive text-white' : ''}`}><Mic className="w-5 h-5" /></Button>
                        <Button onClick={() => setIsDeafened(!isDeafened)} variant="secondary" className={`w-12 h-12 rounded-full ${isDeafened ? 'bg-destructive text-white' : ''}`}><VolumeX className="w-5 h-5" /></Button>
                        <Button onClick={endCall} variant="destructive" className="w-14 h-14 rounded-full hover:scale-110 transition-transform ml-2"><PhoneOff className="w-7 h-7 fill-current" /></Button>
                    </div>
                </div>
                <audio ref={remoteAudioRef} autoPlay />
            </motion.div>
        </AnimatePresence>
    );
};

export default VoiceCallOverlay;
