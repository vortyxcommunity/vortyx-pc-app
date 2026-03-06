import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import vortyxLogo from '@/assets/vortyx-logo.png';

const AuthPage: React.FC = () => {
  const { user, loading, signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </motion.div>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else if (mode === 'signup') {
        if (!username.trim()) { setError('Username is required'); setSubmitting(false); return; }
        const { error } = await signUp(email, password, username);
        if (error) setError(error.message);
        else setMessage('Check your email to confirm your account!');
      } else {
        const { error } = await resetPassword(email);
        if (error) setError(error.message);
        else setMessage('Password reset email sent!');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/[0.03] blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-primary/[0.02] blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <img src={vortyxLogo} alt="Vortyx" className="w-10 h-10 rounded-xl" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Vortyx Community</h1>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {mode === 'login' ? 'Sign in to continue to Vortyx' : mode === 'signup' ? 'Get started with a free account' : 'Enter your email to reset'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === 'signup' && (
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="pl-10 bg-background border-border" />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-10 bg-background border-border" />
                </div>
                {mode !== 'forgot' && (
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-10 pr-10 bg-background border-border" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {error && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-destructive text-sm">{error}</motion.p>}
                  {message && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-success text-sm">{message}</motion.p>}
                </AnimatePresence>

                <Button type="submit" disabled={submitting} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-10 gap-2">
                  {submitting ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : (
                    <>{mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}<ArrowRight className="w-4 h-4" /></>
                  )}
                </Button>
              </form>
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 pt-5 border-t border-border text-center space-y-2">
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('forgot'); setError(''); setMessage(''); }} className="text-sm text-muted-foreground hover:text-foreground transition-colors block w-full">Forgot password?</button>
                <p className="text-sm text-muted-foreground">Don't have an account?{' '}<button onClick={() => { setMode('signup'); setError(''); setMessage(''); }} className="text-primary hover:underline font-medium">Sign up</button></p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-sm text-muted-foreground">Already have an account?{' '}<button onClick={() => { setMode('login'); setError(''); setMessage(''); }} className="text-primary hover:underline font-medium">Sign in</button></p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => { setMode('login'); setError(''); setMessage(''); }} className="text-sm text-primary hover:underline font-medium">Back to login</button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
