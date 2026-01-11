import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';

export default function PlayerStatsPage() {
  const navigate = useNavigate();
  const { playerName } = useParams();
  const [player, setPlayer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayerData();
  }, [playerName]);

  const loadPlayerData = async () => {
    try {
      // Find player by name
      const { data: playerData, error: playerError } = await supabase
        .from('users')
        .select('*')
        .ilike('name', playerName)
        .single();

      if (playerError) throw playerError;
      setPlayer(playerData);

      // Load transactions
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', playerData.id)
        .order('created_at', { ascending: false });

      if (transError) throw transError;
      setTransactions(transData || []);

      // Load sessions player participated in
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('session_id')
        .or(`team1_player1_id.eq.${playerData.id},team1_player2_id.eq.${playerData.id},team2_player1_id.eq.${playerData.id},team2_player2_id.eq.${playerData.id}`)
        .eq('status', 'completed');

      if (gamesError) throw gamesError;

      const sessionIds = [...new Set(gamesData.map(g => g.session_id))];
      
      if (sessionIds.length > 0) {
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select('*')
          .in('id', sessionIds)
          .order('session_date', { ascending: false });

        if (sessionsError) throw sessionsError;
        setSessions(sessionsData || []);
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setLoading(false);
    }
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

  if (!player) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="mb-4 flex items-center gap-2 text-indigo-600 font-semibold"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Player Not Found</h2>
            <p className="text-gray-600">Could not find player "{playerName}"</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <button
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-2 text-indigo-600 font-semibold"
        >
          <ArrowLeft size={20} />
          Back to Queue
        </button>

        {/* Player Info */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
          <h1 className="text-3xl font-bold text-indigo-900 mb-4">{player.name}</h1>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-xl text-center">
              <div className="text-3xl font-bold text-blue-600">{player.total_games_played || 0}</div>
              <div className="text-sm text-gray-600">Total Games</div>
            </div>
            <div className={`p-4 rounded-xl text-center ${
              (player.current_balance || 0) < 0 ? 'bg-red-50' : 'bg-green-50'
            }`}>
              <div className={`text-3xl font-bold flex items-center justify-center ${
                (player.current_balance || 0) < 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                {(player.current_balance || 0) < 0 ? (
                  <TrendingDown className="mr-2" size={28} />
                ) : (
                  <TrendingUp className="mr-2" size={28} />
                )}
                ¥{Math.abs(player.current_balance || 0).toFixed(0)}
              </div>
              <div className="text-sm text-gray-600">
                {(player.current_balance || 0) < 0 ? 'You Owe' : 'Credit'}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Calendar size={20} className="text-indigo-600" />
              Recent Sessions ({sessions.length})
            </h2>
            <div className="space-y-2">
              {sessions.slice(0, 5).map(session => (
                <div key={session.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-sm">
                        {new Date(session.session_date).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-600">
                        {session.total_games} games · ¥{session.cost_per_game?.toFixed(0) || 0}/game
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">{session.status}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction History */}
        {transactions.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-4">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <DollarSign size={20} className="text-indigo-600" />
              Transaction History
            </h2>
            <div className="space-y-2">
              {transactions.map(trans => (
                <div key={trans.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {trans.type === 'payment' ? '💰 Payment' : '🏸 Game Charge'}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {trans.description || 'No description'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(trans.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className={`font-bold text-lg ${
                      trans.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {trans.amount > 0 ? '+' : ''}¥{trans.amount.toFixed(0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}