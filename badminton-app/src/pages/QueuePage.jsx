import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Play, Clock, Users, Lock } from 'lucide-react';

export default function QueuePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState(null);
  const [currentGames, setCurrentGames] = useState([]);
  const [queuedGames, setQueuedGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionData();
    
    // Subscribe to real-time updates for games
    const gamesChannel = supabase
      .channel('public_games_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'games' 
      }, () => {
        loadSessionData();
      })
      .subscribe();

    // Subscribe to real-time updates for sessions
    const sessionsChannel = supabase
      .channel('public_sessions_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'sessions' 
      }, () => {
        loadSessionData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(gamesChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  const loadSessionData = async () => {
    try {
      // Get current active session
      const { data: sessions, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'in-progress')
        .order('created_at', { ascending: false })
        .limit(1);

      if (sessionError) throw sessionError;

      if (sessions && sessions.length > 0) {
        setCurrentSession(sessions[0]);

        // Get games for this session
        const { data: games, error: gamesError } = await supabase
          .from('games')
          .select('*')
          .eq('session_id', sessions[0].id)
          .order('game_number', { ascending: true });

        if (gamesError) throw gamesError;

        // Separate playing and queued games
        const playing = games.filter(g => g.status === 'playing');
        const queued = games.filter(g => g.status === 'queued');

        setCurrentGames(playing);
        setQueuedGames(queued);

        // Get unique player IDs from games
        const playerIds = new Set();
        games.forEach(game => {
          [game.team1_player1_id, game.team1_player2_id, 
           game.team2_player1_id, game.team2_player2_id].forEach(id => {
            if (id) playerIds.add(id);
          });
        });

        // Fetch player details
        if (playerIds.size > 0) {
          const { data: playersData, error: playersError } = await supabase
            .from('users')
            .select('id, name')
            .in('id', Array.from(playerIds));

          if (playersError) throw playersError;

          // Create player map
          const playerMap = {};
          playersData.forEach(p => {
            playerMap[p.id] = p.name;
          });
          setPlayers(playerMap);
        }
      } else {
        setCurrentSession(null);
        setCurrentGames([]);
        setQueuedGames([]);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (playerId) => {
    return players[playerId] || 'Unknown';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏸</div>
          <div className="text-xl text-indigo-900 font-semibold">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900">🏸 Badminton Queue</h1>
              <p className="text-sm text-indigo-700">Live game tracker</p>
            </div>
            {user ? (
              <button
                onClick={() => navigate('/admin')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold text-sm active:bg-indigo-700 flex items-center gap-2"
              >
                <Lock size={16} />
                Admin
              </button>
            ) : (
              <button
                onClick={() => navigate('/admin/login')}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-gray-300 flex items-center gap-2"
              >
                <Lock size={16} />
                Admin
              </button>
            )}
          </div>

          {/* Public Navigation */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => navigate('/public/expenses')}
              className="bg-green-100 text-green-700 px-3 py-2 rounded-xl font-semibold text-xs active:bg-green-200"
            >
              💰 Funds
            </button>
            <button
              onClick={() => navigate('/public/history')}
              className="bg-purple-100 text-purple-700 px-3 py-2 rounded-xl font-semibold text-xs active:bg-purple-200"
            >
              📅 History
            </button>
            <button
              onClick={() => navigate('/public/players')}
              className="bg-blue-100 text-blue-700 px-3 py-2 rounded-xl font-semibold text-xs active:bg-blue-200"
            >
              👥 Players
            </button>
          </div>
        </div>

        {!currentSession ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🏸</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Session</h2>
            <p className="text-gray-600 mb-4">
              There are no games running right now.
            </p>
            {!user && (
              <p className="text-sm text-gray-500">
                Admin needs to start a session first.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Session Info */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">
                    Today's Session
                  </h2>
                  <p className="text-sm text-gray-600">
                    {new Date(currentSession.session_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-indigo-600">
                    {currentGames.length + queuedGames.length}
                  </div>
                  <div className="text-xs text-gray-600">Total Games</div>
                </div>
              </div>
            </div>

            {/* Currently Playing */}
            {currentGames.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Play size={20} className="text-green-600" />
                  Currently Playing ({currentGames.length})
                </h2>
                <div className="space-y-3">
                  {currentGames.map(game => (
                    <div key={game.id} className="border-2 border-green-400 bg-green-50 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                          Court {game.court_number}
                        </span>
                        <div className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock size={12} />
                          {game.start_time ? new Date(game.start_time).toLocaleTimeString() : 'Started'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="bg-white p-3 rounded-xl border-l-4 border-blue-500">
                          <div className="font-bold text-blue-700 text-sm mb-1">Team 1</div>
                          <div className="text-sm">{getPlayerName(game.team1_player1_id)}</div>
                          <div className="text-sm">{getPlayerName(game.team1_player2_id)}</div>
                        </div>
                        <div className="bg-white p-3 rounded-xl border-l-4 border-red-500">
                          <div className="font-bold text-red-700 text-sm mb-1">Team 2</div>
                          <div className="text-sm">{getPlayerName(game.team2_player1_id)}</div>
                          <div className="text-sm">{getPlayerName(game.team2_player2_id)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Queue */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Clock size={20} className="text-indigo-600" />
                Queue ({queuedGames.length})
              </h2>
              {queuedGames.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  Queue is empty
                </div>
              ) : (
                <div className="space-y-3">
                  {queuedGames.map((game) => (
                    <div key={game.id} className="border-2 border-gray-300 rounded-xl p-3">
                      <div className="font-semibold text-sm mb-2 text-gray-700">
                        Game {game.game_number} {game.is_custom && '⭐'}
                      </div>
                      <div className="space-y-2">
                        <div className="bg-blue-50 p-2 rounded border-l-4 border-blue-500">
                          <div className="font-bold text-blue-700 text-xs mb-1">Team 1</div>
                          <div className="text-sm">{getPlayerName(game.team1_player1_id)}</div>
                          <div className="text-sm">{getPlayerName(game.team1_player2_id)}</div>
                        </div>
                        <div className="bg-red-50 p-2 rounded border-l-4 border-red-500">
                          <div className="font-bold text-red-700 text-xs mb-1">Team 2</div>
                          <div className="text-sm">{getPlayerName(game.team2_player1_id)}</div>
                          <div className="text-sm">{getPlayerName(game.team2_player2_id)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}