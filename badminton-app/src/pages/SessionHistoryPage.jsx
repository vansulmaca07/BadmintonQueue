import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import { ArrowLeft, Calendar, Edit, CheckCircle, X, Trash2 } from 'lucide-react';
import { calculateCostDifference } from '../utils/paymentCalculations';
import { adjustSessionCharges } from '../utils/playerBalanceUpdates';
import { deleteSession, getSessionDeletionImpact } from '../utils/sessionManagement';

export default function SessionHistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isAdmin = !!user;
  
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletionImpact, setDeletionImpact] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'completed')
        .order('session_date', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId) => {
    try {
      // Load games
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('session_id', sessionId)
        .order('game_number');

      if (gamesError) throw gamesError;
      setGames(gamesData || []);

      // Load player names
      const playerIds = new Set();
      gamesData.forEach(game => {
        [game.team1_player1_id, game.team1_player2_id,
         game.team2_player1_id, game.team2_player2_id].forEach(id => {
          if (id) playerIds.add(id);
        });
      });

      if (playerIds.size > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', Array.from(playerIds));

        if (playersError) throw playersError;

        const playerMap = {};
        playersData.forEach(p => { playerMap[p.id] = p.name; });
        setPlayers(playerMap);
      }
    } catch (error) {
      console.error('Error loading session details:', error);
    }
  };

  const openSession = (session) => {
    setSelectedSession(session);
    setEditData({
      court_fee: session.court_fee,
      shuttlecock_price: session.shuttlecock_price,
      shuttlecocks_used: session.shuttlecocks_used
    });
    loadSessionDetails(session.id);
  };

  const saveEdit = async () => {
    if (!window.confirm(
      'Recalculate player balances with new costs?\n\n' +
      'This will:\n' +
      '1. Reverse old charges\n' +
      '2. Apply new charges\n' +
      '3. Update all player balances\n\n' +
      'Continue?'
    )) return;

    try {
      const completedGames = games.filter(g => g.status === 'completed');
      
      // Calculate differences
      const diffResult = calculateCostDifference(
        selectedSession,
        editData,
        completedGames
      );
      
      // Apply adjustments
      const adjustResult = await adjustSessionCharges(
        diffResult.differences,
        selectedSession.id,
        selectedSession.session_date
      );
      
      if (!adjustResult.success) {
        throw new Error(adjustResult.error);
      }
      
      // Update session
      const { error: sessionError } = await supabase
        .from('sessions')
        .update({
          court_fee: editData.court_fee,
          shuttlecock_price: editData.shuttlecock_price,
          shuttlecocks_used: editData.shuttlecocks_used,
          cost_per_game: diffResult.newCostPerGame
        })
        .eq('id', selectedSession.id);

      if (sessionError) throw sessionError;

      alert('Session updated! Player balances recalculated.');
      setEditMode(false);
      await loadSessions();
      setSelectedSession({...selectedSession, ...editData, cost_per_game: diffResult.newCostPerGame});
    } catch (error) {
      console.error('Error updating session:', error);
      alert('Failed to update session: ' + error.message);
    }
  };

  const handleDeleteClick = async () => {
    if (!selectedSession) return;
    
    // Get deletion impact
    const impactResult = await getSessionDeletionImpact(selectedSession.id);
    
    if (!impactResult.success) {
      alert('Failed to calculate deletion impact: ' + impactResult.error);
      return;
    }
    
    setDeletionImpact(impactResult.impact);
    setDeleteStep(1);
    setDeleteConfirmText('');
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (!selectedSession) return;
    
    try {
      const result = await deleteSession(selectedSession.id);
      
      if (!result.success) {
        alert('Failed to delete session: ' + result.error);
        return;
      }
      
      alert(
        'Session deleted successfully!\n\n' +
        `${result.impact.playersAffected} players affected\n` +
        `${result.impact.gamesDeleted} games removed\n` +
        (result.impact.chargesReversed ? 'Charges reversed' : 'No charges to reverse')
      );
      
      setShowDeleteConfirm(false);
      setSelectedSession(null);
      await loadSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Failed to delete session: ' + error.message);
    }
  };

  const getPlayerName = (playerId) => players[playerId] || 'Unknown';

  const calculatePlayerGames = () => {
    const playerGames = {};
    games.filter(g => g.status === 'completed').forEach(game => {
      [game.team1_player1_id, game.team1_player2_id,
       game.team2_player1_id, game.team2_player2_id].forEach(playerId => {
        if (playerId) {
          playerGames[playerId] = (playerGames[playerId] || 0) + 1;
        }
      });
    });
    return playerGames;
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

  if (selectedSession) {
    const playerGames = calculatePlayerGames();
    const totalCost = (editMode ? editData.court_fee : selectedSession.court_fee) + 
                     ((editMode ? editData.shuttlecocks_used : selectedSession.shuttlecocks_used) / 12) * 
                     (editMode ? editData.shuttlecock_price : selectedSession.shuttlecock_price);
    const costPerGame = selectedSession.total_games > 0 ? totalCost / selectedSession.total_games : 0;
    const costPerPlayerPerGame = costPerGame / 4;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 pb-20">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => { setSelectedSession(null); setEditMode(false); }}
            className="mb-4 flex items-center gap-2 text-indigo-600 font-semibold"
          >
            <ArrowLeft size={20} />
            Back to Sessions
          </button>

          {/* Session Header */}
          <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h1 className="text-2xl font-bold text-indigo-900">
                  {new Date(selectedSession.session_date).toLocaleDateString()}
                </h1>
                <p className="text-sm text-gray-600">{selectedSession.total_games} games played</p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  {!editMode ? (
                    <>
                      <button
                        onClick={() => setEditMode(true)}
                        className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-indigo-200 flex items-center gap-2"
                      >
                        <Edit size={16} />
                        Edit
                      </button>
                      <button
                        onClick={handleDeleteClick}
                        className="bg-red-100 text-red-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-red-200 flex items-center gap-2"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditMode(false)}
                        className="bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-sm active:bg-gray-200"
                      >
                        <X size={16} />
                      </button>
                      <button
                        onClick={saveEdit}
                        className="bg-green-100 text-green-700 px-3 py-2 rounded-xl text-sm active:bg-green-200 flex items-center gap-1"
                      >
                        <CheckCircle size={16} />
                        Save
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Costs */}
            <div className="space-y-2">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Court Rent:</span>
                {editMode && isAdmin ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editData.court_fee}
                    onChange={(e) => setEditData({...editData, court_fee: parseFloat(e.target.value) || 0})}
                    className="w-24 px-2 py-1 border rounded text-right"
                    style={{ fontSize: '14px' }}
                  />
                ) : (
                  <span className="font-bold">¥{selectedSession.court_fee?.toFixed(2)}</span>
                )}
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Shuttlecock Price:</span>
                {editMode && isAdmin ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editData.shuttlecock_price}
                    onChange={(e) => setEditData({...editData, shuttlecock_price: parseFloat(e.target.value) || 0})}
                    className="w-24 px-2 py-1 border rounded text-right"
                    style={{ fontSize: '14px' }}
                  />
                ) : (
                  <span className="font-bold">¥{selectedSession.shuttlecock_price?.toFixed(2)}</span>
                )}
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Shuttlecocks Used:</span>
                {editMode && isAdmin ? (
                  <input
                    type="number"
                    value={editData.shuttlecocks_used}
                    onChange={(e) => setEditData({...editData, shuttlecocks_used: parseInt(e.target.value) || 0})}
                    className="w-24 px-2 py-1 border rounded text-right"
                  />
                ) : (
                  <span className="font-bold">{selectedSession.shuttlecocks_used}</span>
                )}
              </div>
              <div className="flex justify-between p-3 bg-indigo-50 rounded-xl border-2 border-indigo-200">
                <span className="font-bold">Total Cost:</span>
                <span className="font-bold text-indigo-600 text-lg">¥{totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Player Breakdown */}
          <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
            <h2 className="text-lg font-bold mb-3">Player Breakdown</h2>
            <div className="space-y-2">
              {Object.entries(playerGames).map(([playerId, gamesPlayed]) => (
                <div key={playerId} className="flex justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-semibold">{getPlayerName(playerId)}</div>
                    <div className="text-sm text-gray-600">{gamesPlayed} games</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-indigo-600">
                      ¥{(gamesPlayed * costPerPlayerPerGame).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Games List */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <h2 className="text-lg font-bold mb-3">Games ({games.length})</h2>
            <div className="space-y-2">
              {games.map(game => (
                <div key={game.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="font-semibold text-sm mb-2">Game {game.game_number}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-blue-50 p-2 rounded">
                      <div className="font-bold text-blue-700 mb-1">Team 1</div>
                      <div>{getPlayerName(game.team1_player1_id)}</div>
                      <div>{getPlayerName(game.team1_player2_id)}</div>
                    </div>
                    <div className="bg-red-50 p-2 rounded">
                      <div className="font-bold text-red-700 mb-1">Team 2</div>
                      <div>{getPlayerName(game.team2_player1_id)}</div>
                      <div>{getPlayerName(game.team2_player2_id)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && deletionImpact && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl w-full max-w-md p-6">
              {deleteStep === 1 && (
                <>
                  <h3 className="text-xl font-bold text-red-600 mb-4">⚠️ Delete Session</h3>
                  <p className="text-gray-700 mb-4">
                    Are you sure you want to delete this session?
                  </p>
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
                    <h4 className="font-bold text-red-800 mb-2">Impact:</h4>
                    <ul className="space-y-1 text-sm text-gray-700">
                      <li>• <strong>{deletionImpact.playersAffected}</strong> players will be affected</li>
                      <li>• <strong>{deletionImpact.totalGames}</strong> games will be deleted</li>
                      <li>• <strong>¥{deletionImpact.totalCharges.toFixed(2)}</strong> in charges will be reversed</li>
                    </ul>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    This action cannot be undone. Player balances will be adjusted automatically.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setDeleteStep(2)}
                      className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold active:bg-red-700"
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}

              {deleteStep === 2 && (
                <>
                  <h3 className="text-xl font-bold text-red-600 mb-4">⚠️ Final Confirmation</h3>
                  <p className="text-gray-700 mb-4">
                    Type <strong className="font-mono bg-gray-100 px-2 py-1 rounded">DELETE</strong> to confirm deletion:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
                    style={{ fontSize: '16px' }}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteStep(1)}
                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
                    >
                      Back
                    </button>
                    <button
                      onClick={executeDelete}
                      disabled={deleteConfirmText !== 'DELETE'}
                      className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed active:bg-red-700"
                    >
                      Delete Session
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 pb-20">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate(isAdminRoute ? '/admin' : '/')}
          className="mb-4 flex items-center gap-2 text-indigo-600 font-semibold"
        >
          <ArrowLeft size={20} />
          Back to {isAdminRoute ? 'Dashboard' : 'Queue'}
        </button>

        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <h1 className="text-2xl font-bold text-indigo-900 mb-1">📅 Session History</h1>
          <p className="text-sm text-indigo-700">
            {isAdmin ? 'View and edit past sessions' : 'View past sessions'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-4">
          <h2 className="text-lg font-bold mb-3">Past Sessions ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No completed sessions yet</div>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => openSession(session)}
                  className="p-4 bg-gray-50 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-indigo-300 active:bg-gray-100"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={16} className="text-indigo-600" />
                        <span className="font-bold">{new Date(session.session_date).toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {session.total_games} games · ¥{session.cost_per_game?.toFixed(0)}/game
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-indigo-600">
                        ¥{(session.court_fee + (session.shuttlecocks_used / 12) * session.shuttlecock_price).toFixed(0)}
                      </div>
                      <div className="text-xs text-gray-500">Total Cost</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}