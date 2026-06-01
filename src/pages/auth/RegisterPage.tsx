import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button, Input, Select, Alert } from '../../components/ui';
import { GraduationCap, Mail, Lock, Eye, EyeOff, ArrowLeft, User, Building } from 'lucide-react';
import type { UserRole } from '../../types';

export function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [institution, setInstitution] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    const result = await signUp(email, password, fullName, role, institution);

    if (result.error) {
      setError(result.error.message || 'Registration failed');
      setIsLoading(false);
      return;
    }

    if (result.pendingApproval) {
      navigate('/login', { state: { pendingApproval: true } });
      return;
    }

    navigate('/dashboard');
  };

  const roleOptions = [
    { value: 'student', label: 'Student' },
    { value: 'faculty', label: 'Faculty / Teacher' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card-hover border border-slate-200 dark:border-slate-700 p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-button-hover mb-4">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Create Account</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Join ExamForge AI and start creating exams
            </p>
          </div>

          {error && (
            <Alert variant="error" className="mb-6">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              leftIcon={<User className="w-5 h-5" />}
              required
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="w-5 h-5" />}
              required
            />

            <Select
              label="I am a"
              options={roleOptions}
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              required
            />

            <Input
              label="Institution (Optional)"
              type="text"
              placeholder="Your school or organization"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              leftIcon={<Building className="w-5 h-5" />}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="w-5 h-5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
              required
            />

            <Input
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="w-5 h-5" />}
              required
            />

            <div className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 rounded border-slate-300 text-primary-600 focus:ring-primary-500/20" required />
              <span className="text-slate-600 dark:text-slate-400">
                I agree to the{' '}
                <Link to="/terms" className="text-primary-600 hover:underline dark:text-primary-400">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-primary-600 hover:underline dark:text-primary-400">
                  Privacy Policy
                </Link>
              </span>
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
