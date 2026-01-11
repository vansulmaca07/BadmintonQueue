import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { ArrowLeft, Lock } from 'lucide-react';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Get the admin user (the one with is_admin = true or specific ID)
      const { data: adminUsers, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('is_admin', true)
        .limit(1);

      if (fetchError) throw fetchError;

      if (!adminUsers || adminUsers.length === 0) {
        setError('Admin user not found');
        setLoading(false);
        return;
      }

      const adminUser = adminUsers[0];

      // Check password using Supabase Auth
      // Try to sign in with email + password
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: adminUser.email,
        password: password,
      });

      if (signInError) {
        setError('Incorrect password');
        setLoading(false);
        return;
      }

      // Success! Navigate to admin dashboard
      navigate('/admin');
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-2 text-indigo-600 font-semibold"
        >
          <ArrowLeft size={20} />
          Back to Queue
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Lock size={32} className="text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-indigo-900 mb-2">Admin Login</h1>
            <p className="text-gray-600">Enter password to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                style={{ fontSize: '16px' }}
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              🏸 Badminton Queue Management System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}