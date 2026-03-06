import React, { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Gamepad2 } from 'lucide-react';

const InvitePage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [server, setServer] = useState<any>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchInvite = async () => {
      if (!code) return;
      const { data } = await supabase.from('invites').select('*').eq('code', code).single();
      if (!data) { setError('Invalid or expired invite'); setFetching(false); return; }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { setError('This invite has expired'); setFetching(false); return; }
      setInvite(data);
      const { data: srv } = await supabase.from('servers').select('*').eq('id', data.server_id).single();
      setServer(srv);
      setFetching(false);
    };
    fetchInvite();
  }, [code]);

  if (loading || fetching) {
    return <div className="flex h-full items-center justify-center bg-background"><div className="animate-pulse text-primary neon-text text-xl">Loading...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  const joinServer = async () => {
    if (!invite || !user) return;
    setJoining(true);
    const { error } = await supabase.from('server_members').insert({ server_id: invite.server_id, user_id: user.id });
    if (error && error.code === '23505') {
      // Already a member
      navigate('/');
    } else if (error) {
      setError(error.message);
    } else {
      navigate('/');
    }
    setJoining(false);
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <div className="glass-strong rounded-2xl p-8 w-full max-w-md animate-fade-in text-center">
        <Gamepad2 className="w-12 h-12 text-primary mx-auto mb-4" />
        {error ? (
          <>
            <h2 className="text-xl font-bold text-foreground mb-2">Oops!</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => navigate('/')} className="bg-primary text-primary-foreground">Go Home</Button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-foreground mb-2">You've been invited to join</h2>
            <p className="text-2xl font-bold text-primary neon-text mb-6">{server?.name || 'a server'}</p>
            <Button onClick={joinServer} disabled={joining} className="w-full bg-primary text-primary-foreground neon-glow">
              {joining ? 'Joining...' : 'Accept Invite'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default InvitePage;
