import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import { Plus, Trash2, Play, CheckCircle, Users, Clock, Minus, Home, UserPlus, X, LogOut, Settings, XCircle, Edit } from 'lucide-react';
import { generateQueue } from '../utils/queueAlgorithm';
import { completeSession, cancelSession } from '../utils/sessionManagement';
import { calculateSessionBreakdown } from '../utils/paymentCalculations';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { userProfile, signOut } = useAuth();
  
  // Session state
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionPlayers, setSessionPlayers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  
  // Game state
  const [currentGames, setCurrentGames] = useState([]);
  const [queuedGames, setQueuedGames] = useState([]);
  const [completedGames, setCompletedGames] = useState([]);
  
  // Settings
  const [courtRentFee, setCourtRentFee] = useState(0);
  const [ballPrice, setBallPrice] = useState(0);
  const [ballsUsed, setBallsUsed] = useState(1);
  
  // UI state
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [showSessionSettings, setShowSessionSettings] = useState(false);
  const [showCustomMatch, setShowCustomMatch] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Custom match state
  const [customTeam1, setCustomTeam1] = useState([]);
  const [customTeam2, setCustomTeam2] = useState([]);
  const [insertPosition, setInsertPosition] = useState(1);

  // Edit game state
  const [editingGame, setEditingGame] = useState(null);
  const [editTeam1, setEditTeam1] = useState([]);
  const [editTeam2, setEditTeam2] = useState([]);

  useEffect(() => {
    if (userProfile) {
      loadData();
    }
  }, [userProfile]);

  const loadData = async () => {
    try {
      if (!userProfile?.id) {
        console.log('Waiting for user profile to load...');
        return;
      }

      // Load all players (master list)
      const { data: playersData, error: playersError } = await supabase
        .from('users')
        .select('*')
        .neq('id', userProfile.id)
        .order('name');
      
      if (playersError) throw playersError;
      setAllPlayers(playersData || []);

      // Load current session
      const { data: sessions, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'in-progress')
        .order('created_at', { ascending: false })
        .limit(1);

      if (sessionError) throw sessionError;

      if (sessions && sessions.length > 0) {
        setCurrentSession(sessions[0]);
        setCourtRentFee(sessions[0].court_fee || 0);
        setBallPrice(sessions[0].shuttlecock_price || 0);
        setBallsUsed(sessions[0].shuttlecocks_used || 1);
        
        // Load session players with status
        const { data: sessionPlayersData, error: spError } = await supabase
          .from('session_players')
          .select('player_id, status')
          .eq('session_id', sessions[0].id);

        if (spError) throw spError;

        // Get full player details for session players
        if (sessionPlayersData && sessionPlayersData.length > 0) {
          const playerIds = sessionPlayersData.map(sp => sp.player_id);
          const activePlayers = playersData.filter(p => playerIds.includes(p.id));
          
          // Add status to each player
          const playersWithStatus = activePlayers.map(p => {
            const sessionPlayer = sessionPlayersData.find(sp => sp.player_id === p.id);
            return {
              ...p,
              sessionStatus: sessionPlayer?.status || 'active'
            };
          });
          
          setSessionPlayers(playersWithStatus);
        } else {
          setSessionPlayers([]);
        }
        
        // Load games for this session
        await loadSessionGames(sessions[0].id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionGames = async (sessionId) => {
    try {
      const { data: games, error } = await supabase
        .from('games')
        .select('*')
        .eq('session_id', sessionId)
        .order('game_number');

      if (error) throw error;

      const playing = games.filter(g => g.status === 'playing');
      const queued = games.filter(g => g.status === 'queued');
      const completed = games.filter(g => g.status === 'completed');

      setCurrentGames(playing);
      setQueuedGames(queued);
      setCompletedGames(completed);
    } catch (error) {
      console.error('Error loading games:', error);
    }
  };

  // Calculate games per player in current session
  const getPlayerSessionGames = (playerId) => {
    const allSessionGames = [...completedGames, ...currentGames, ...queuedGames];
    return allSessionGames.filter(game => 
      game.team1_player1_id === playerId ||
      game.team1_player2_id === playerId ||
      game.team2_player1_id === playerId ||
      game.team2_player2_id === playerId
    ).length;
  };

  const createNewSession = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert([{
          session_date: new Date().toISOString().split('T')[0],
          court_fee: 0,
          shuttlecock_price: 0,
          shuttlecocks_used: 1,
          total_games: 0,
          status: 'in-progress',
          created_by: userProfile.id
        }])
        .select()
        .single();

      if (error) throw error;
      setCurrentSession(data);
      alert('New session created!');
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session');
    }
  };

  const handleCancelSession = async () => {
    if (!currentSession) return;
    
    const confirmCancel = window.confirm(
      'Cancel this session?\n\n' +
      'This will:\n' +
      '- Delete all queued and playing games\n' +
      '- Remove all session data\n\n' +
      (completedGames.length > 0 
        ? '⚠️ WARNING: This session has completed games! You should "End Session" instead to apply charges properly.\n\n'
        : '') +
      'Continue?'
    );
    
    if (!confirmCancel) return;

    try {
      const result = await cancelSession(currentSession.id);
      
      if (!result.success) {
        alert(result.error);
        return;
      }
      
      alert('Session cancelled successfully!');
      setCurrentSession(null);
      setSessionPlayers([]);
      setCurrentGames([]);
      setQueuedGames([]);
      setCompletedGames([]);
      setShowSessionSettings(false);
      await loadData();
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert('Failed to cancel session: ' + error.message);
    }
  };

  const addPlayerToSession = async (playerId) => {
    if (!currentSession) return;

    try {
      const { error } = await supabase
        .from('session_players')
        .insert([{
          session_id: currentSession.id,
          player_id: playerId,
          status: 'active'
        }]);

      if (error) throw error;

      await loadData();
      setShowPlayerSelector(false);
    } catch (error) {
      console.error('Error adding player to session:', error);
      alert('Failed to add player to session');
    }
  };

  const removePlayerFromSession = async (playerId) => {
    if (!currentSession) return;

    try {
      const { error } = await supabase
        .from('session_players')
        .delete()
        .eq('session_id', currentSession.id)
        .eq('player_id', playerId);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error('Error removing player:', error);
      alert('Failed to remove player');
    }
  };

  const togglePlayerStatus = async (playerId, currentStatus) => {
    if (!currentSession) return;

    const newStatus = currentStatus === 'left' ? 'active' : 'left';

    try {
      // Update status
      const { error } = await supabase
        .from('session_players')
        .update({ status: newStatus })
        .eq('session_id', currentSession.id)
        .eq('player_id', playerId);

      if (error) throw error;

      // If player LEFT, DELETE all queued games they're in
      if (newStatus === 'left') {
        const { error: deleteError } = await supabase
          .from('games')
          .delete()
          .eq('session_id', currentSession.id)
          .eq('status', 'queued')
          .or(`team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`);

        if (deleteError) {
          console.error('Error deleting queued games:', deleteError);
          // Don't fail the whole operation, just log it
        }
      }

      await loadData();
    } catch (error) {
      console.error('Error toggling player status:', error);
      alert('Failed to toggle player status');
    }
  };

  const handleGenerateQueue = async () => {
    if (!currentSession) return;
    
    // Get active players (not left)
    const activePlayers = sessionPlayers.filter(p => p.sessionStatus === 'active');
    
    if (activePlayers.length < 4) {
      alert('Need at least 4 active players to generate queue!');
      return;
    }

    try {
      const allGames = [...completedGames, ...currentGames];
      const newMatches = generateQueue(activePlayers, allGames, queuedGames);
      
      if (newMatches.length === 0) {
        alert('Could not generate queue. Need more players or check player availability.');
        return;
      }

      const nextGameNumber = completedGames.length + currentGames.length + queuedGames.length + 1;
      
      const gamesToInsert = newMatches.map((match, idx) => ({
        session_id: currentSession.id,
        game_number: nextGameNumber + idx,
        team1_player1_id: match.team1[0].id,
        team1_player2_id: match.team1[1].id,
        team2_player1_id: match.team2[0].id,
        team2_player2_id: match.team2[1].id,
        status: 'queued',
        is_custom: false
      }));

      const { error } = await supabase
        .from('games')
        .insert(gamesToInsert);

      if (error) throw error;

      await loadSessionGames(currentSession.id);
      alert(`Generated ${newMatches.length} games!`);
    } catch (error) {
      console.error('Error generating queue:', error);
      alert('Failed to generate queue');
    }
  };

  const handleStartGames = async () => {
    if (queuedGames.length === 0) {
      alert('No games in queue!');
      return;
    }

    try {
      const gameToStart = queuedGames[0];
      
      const { error } = await supabase
        .from('games')
        .update({ 
          status: 'playing',
          start_time: new Date().toISOString(),
          court_number: 1
        })
        .eq('id', gameToStart.id);

      if (error) throw error;

      await loadSessionGames(currentSession.id);
      alert('Game started!');
    } catch (error) {
      console.error('Error starting game:', error);
      alert('Failed to start game');
    }
  };

  const handleCompleteGame = async (gameId) => {
    try {
      const { error } = await supabase
        .from('games')
        .update({ 
          status: 'completed',
          end_time: new Date().toISOString()
        })
        .eq('id', gameId);

      if (error) throw error;

      await loadSessionGames(currentSession.id);
    } catch (error) {
      console.error('Error completing game:', error);
      alert('Failed to complete game');
    }
  };

  const handleCompleteSession = async () => {
    if (!currentSession) return;
    
    const confirmEnd = window.confirm(
      'End this session?\n\n' +
      'This will:\n' +
      '- Calculate and apply charges to all players\n' +
      '- Update player balances\n' +
      '- Mark session as completed\n\n' +
      'You cannot undo this!\n\n' +
      'Continue?'
    );
    
    if (!confirmEnd) return;

    try {
      const costs = {
        court_fee: courtRentFee,
        shuttlecock_price: ballPrice,
        shuttlecocks_used: ballsUsed
      };
      
      const result = await completeSession(currentSession.id, costs);
      
      if (!result.success) {
        alert('Failed to complete session: ' + result.error);
        return;
      }
      
      alert('Session completed! Player balances updated.');
      setCurrentSession(null);
      await loadData();
    } catch (error) {
      console.error('Error completing session:', error);
      alert('Failed to complete session: ' + error.message);
    }
  };

  const saveSessionSettings = async () => {
    if (!currentSession) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          court_fee: courtRentFee,
          shuttlecock_price: ballPrice,
          shuttlecocks_used: ballsUsed
        })
        .eq('id', currentSession.id);

      if (error) throw error;

      alert('Settings saved!');
      setShowSessionSettings(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    }
  };

  const togglePlayerInCustomTeam = (playerId, team) => {
    if (team === 1) {
      if (customTeam1.some(p => p.id === playerId)) {
        setCustomTeam1(customTeam1.filter(p => p.id !== playerId));
      } else if (customTeam1.length < 2 && !customTeam2.some(p => p.id === playerId)) {
        const player = sessionPlayers.find(p => p.id === playerId);
        if (player) setCustomTeam1([...customTeam1, player]);
      }
    } else {
      if (customTeam2.some(p => p.id === playerId)) {
        setCustomTeam2(customTeam2.filter(p => p.id !== playerId));
      } else if (customTeam2.length < 2 && !customTeam1.some(p => p.id === playerId)) {
        const player = sessionPlayers.find(p => p.id === playerId);
        if (player) setCustomTeam2([...customTeam2, player]);
      }
    }
  };

  const insertCustomMatch = async () => {
    if (customTeam1.length !== 2 || customTeam2.length !== 2) {
      alert('Please select 2 players for each team');
      return;
    }

    try {
      const nextGameNumber = completedGames.length + currentGames.length + queuedGames.length + 1;
      
      // Create custom game
      const customGame = {
        session_id: currentSession.id,
        game_number: nextGameNumber,
        team1_player1_id: customTeam1[0].id,
        team1_player2_id: customTeam1[1].id,
        team2_player1_id: customTeam2[0].id,
        team2_player2_id: customTeam2[1].id,
        status: 'queued',
        is_custom: true
      };

      const { error } = await supabase
        .from('games')
        .insert([customGame]);

      if (error) throw error;

      // Reload games
      await loadSessionGames(currentSession.id);
      
      // Reset modal
      setShowCustomMatch(false);
      setCustomTeam1([]);
      setCustomTeam2([]);
      setInsertPosition(1);
      
      alert('Custom match added to queue!');
    } catch (error) {
      console.error('Error inserting custom match:', error);
      alert('Failed to insert custom match');
    }
  };

  // Edit game functions
  const handleEditGame = (game) => {
    setEditingGame(game);
    
    // Load current teams
    const team1Player1 = sessionPlayers.find(p => p.id === game.team1_player1_id);
    const team1Player2 = sessionPlayers.find(p => p.id === game.team1_player2_id);
    const team2Player1 = sessionPlayers.find(p => p.id === game.team2_player1_id);
    const team2Player2 = sessionPlayers.find(p => p.id === game.team2_player2_id);
    
    setEditTeam1([team1Player1, team1Player2].filter(Boolean));
    setEditTeam2([team2Player1, team2Player2].filter(Boolean));
  };

  const togglePlayerInEditTeam = (playerId, team) => {
    if (team === 1) {
      if (editTeam1.some(p => p.id === playerId)) {
        setEditTeam1(editTeam1.filter(p => p.id !== playerId));
      } else if (editTeam1.length < 2 && !editTeam2.some(p => p.id === playerId)) {
        const player = sessionPlayers.find(p => p.id === playerId);
        if (player) setEditTeam1([...editTeam1, player]);
      }
    } else {
      if (editTeam2.some(p => p.id === playerId)) {
        setEditTeam2(editTeam2.filter(p => p.id !== playerId));
      } else if (editTeam2.length < 2 && !editTeam1.some(p => p.id === playerId)) {
        const player = sessionPlayers.find(p => p.id === playerId);
        if (player) setEditTeam2([...editTeam2, player]);
      }
    }
  };

  const saveEditedGame = async () => {
    if (editTeam1.length !== 2 || editTeam2.length !== 2) {
      alert('Please select 2 players for each team');
      return;
    }

    try {
      const { error } = await supabase
        .from('games')
        .update({
          team1_player1_id: editTeam1[0].id,
          team1_player2_id: editTeam1[1].id,
          team2_player1_id: editTeam2[0].id,
          team2_player2_id: editTeam2[1].id,
        })
        .eq('id', editingGame.id);

      if (error) throw error;

      await loadSessionGames(currentSession.id);
      setEditingGame(null);
      setEditTeam1([]);
      setEditTeam2([]);
      
      alert('Game updated!');
    } catch (error) {
      console.error('Error updating game:', error);
      alert('Failed to update game');
    }
  };

  const deleteQueuedGame = async (gameId) => {
    if (!window.confirm('Delete this game from queue?')) return;

    try {
      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);

      if (error) throw error;

      await loadSessionGames(currentSession.id);
      alert('Game deleted from queue!');
    } catch (error) {
      console.error('Error deleting game:', error);
      alert('Failed to delete game');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
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

  // Calculate breakdown for display
  const breakdown = currentSession && completedGames.length > 0 
    ? calculateSessionBreakdown(
        { court_fee: courtRentFee, shuttlecock_price: ballPrice, shuttlecocks_used: ballsUsed },
        completedGames
      )
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900">🏸 Admin Dashboard</h1>
              <p className="text-sm text-indigo-700">Welcome, {userProfile?.name}!</p>
            </div>
            <button
              onClick={handleSignOut}
              className="bg-red-100 text-red-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-red-200 flex items-center gap-2"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
          
          {/* Navigation Menu */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => navigate('/')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-gray-200 flex items-center justify-center gap-2"
            >
              <Home size={16} />
              Public View
            </button>
            <button
              onClick={() => navigate('/admin/players')}
              className="bg-blue-100 text-blue-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-blue-200 flex items-center justify-center gap-2"
            >
              <Users size={16} />
              All Players
            </button>
            <button
              onClick={() => navigate('/admin/expenses')}
              className="bg-green-100 text-green-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-green-200 flex items-center justify-center gap-2"
            >
              💰 Expenses
            </button>
            <button
              onClick={() => navigate('/admin/history')}
              className="bg-purple-100 text-purple-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-purple-200 flex items-center justify-center gap-2"
            >
              📅 History
            </button>
          </div>
        </div>

        {/* Session Management */}
        {!currentSession ? (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-4 text-center">
            <div className="text-6xl mb-4">🏸 </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No Active Session</h2>
            <p className="text-gray-600 mb-4">Start a new session to begin queueing games</p>
            <button
              onClick={createNewSession}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold active:bg-indigo-700"
            >
              <Plus size={20} className="inline mr-2" />
              Start New Session
            </button>
          </div>
        ) : (
          <>
            {/* Session Info */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Current Session</h2>
                  <p className="text-sm text-gray-600">
                    {new Date(currentSession.session_date).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setShowSessionSettings(!showSessionSettings)}
                  className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl font-semibold text-sm active:bg-indigo-200 flex items-center gap-2"
                >
                  <Settings size={16} />
                  Settings
                </button>
              </div>

              {/* Action Buttons */}
              {completedGames.length > 0 && (
                <button
                  onClick={handleCompleteSession}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-3 rounded-xl font-bold text-sm active:from-green-600 active:to-green-700 flex items-center justify-center gap-2 mb-3"
                >
                  <CheckCircle size={18} />
                  End Session & Update Balances
                </button>
              )}

              {showSessionSettings && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Court Rent (¥)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={courtRentFee || ''}
                      onChange={(e) => setCourtRentFee(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Shuttlecock Price/Dozen (¥)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ballPrice || ''}
                      onChange={(e) => setBallPrice(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Shuttlecocks Used</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setBallsUsed(Math.max(0, ballsUsed - 1))}
                        className="bg-red-500 text-white w-12 h-12 rounded-xl font-bold text-xl active:bg-red-600"
                      >
                        <Minus size={24} className="mx-auto" />
                      </button>
                      <input
                        type="number"
                        value={ballsUsed}
                        onChange={(e) => setBallsUsed(parseInt(e.target.value) || 0)}
                        className="flex-1 px-4 py-3 text-base border-2 border-gray-300 rounded-xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ fontSize: '16px' }}
                      />
                      <button
                        onClick={() => setBallsUsed(ballsUsed + 1)}
                        className="bg-green-500 text-white w-12 h-12 rounded-xl font-bold text-xl active:bg-green-600"
                      >
                        <Plus size={24} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={saveSessionSettings}
                    className="w-full bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold active:bg-indigo-700"
                  >
                    Save Settings
                  </button>
                  
                  {/* Cancel Session Button - Inside Settings */}
                  <button
                    onClick={handleCancelSession}
                    className="w-full bg-red-100 text-red-700 px-4 py-3 rounded-xl font-semibold active:bg-red-200 flex items-center justify-center gap-2 border-2 border-red-300"
                  >
                    <XCircle size={16} />
                    Cancel Session
                  </button>
                </div>
              )}
            </div>

            {/* Players Management */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users size={20} className="text-indigo-600" />
                  Today's Players ({sessionPlayers.filter(p => p.sessionStatus === 'active').length})
                </h2>
                <button
                  onClick={() => setShowPlayerSelector(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold text-sm active:bg-indigo-700 flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sessionPlayers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No players added yet. Click "Add" to select players for today.
                  </div>
                ) : (
                  sessionPlayers.map(player => {
                    const gamesInSession = getPlayerSessionGames(player.id);
                    const hasLeft = player.sessionStatus === 'left';
                    
                    return (
                      <div 
                        key={player.id} 
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          hasLeft 
                            ? 'bg-gray-200 border-gray-400 opacity-60' 
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {player.name}
                            {hasLeft && <span className="text-lg">🏠</span>}
                          </div>
                          <div className="text-xs text-gray-600">
                            {gamesInSession} {gamesInSession === 1 ? 'game' : 'games'} today
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => togglePlayerStatus(player.id, player.sessionStatus)}
                            className={`${
                              hasLeft 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-orange-100 text-orange-700'
                            } px-3 py-2 rounded-lg text-xs font-semibold active:opacity-60 flex items-center gap-1`}
                          >
                            <Home size={14} />
                            {hasLeft ? 'Return' : 'Left'}
                          </button>
                          <button
                            onClick={() => removePlayerFromSession(player.id)}
                            className="bg-red-100 text-red-700 px-3 py-1 rounded-lg text-xs font-semibold active:bg-red-200"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <h2 className="text-lg font-bold mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleGenerateQueue}
                  className="bg-green-100 text-green-700 px-4 py-3 rounded-xl font-semibold text-sm active:bg-green-200"
                >
                  Generate Queue
                </button>
                <button 
                  onClick={handleStartGames}
                  className="bg-blue-100 text-blue-700 px-4 py-3 rounded-xl font-semibold text-sm active:bg-blue-200"
                >
                  Start Games
                </button>
                <button 
                  onClick={() => setShowCustomMatch(true)}
                  className="col-span-2 bg-purple-100 text-purple-700 px-4 py-3 rounded-xl font-semibold text-sm active:bg-purple-200 flex items-center justify-center gap-2"
                >
                  <UserPlus size={16} />
                  ⭐ Custom Match
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <h2 className="text-lg font-bold mb-3">Session Stats</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 p-3 rounded-xl text-center">
                  <div className="text-2xl font-bold text-green-600">{currentGames.length}</div>
                  <div className="text-xs text-gray-600">Playing</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl text-center">
                  <div className="text-2xl font-bold text-blue-600">{queuedGames.length}</div>
                  <div className="text-xs text-gray-600">Queued</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl text-center">
                  <div className="text-2xl font-bold text-gray-600">{completedGames.length}</div>
                  <div className="text-xs text-gray-600">Done</div>
                </div>
              </div>
            </div>

            {/* Currently Playing */}
            {currentGames.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Play size={20} className="text-green-600" />
                  Currently Playing
                </h2>
                <div className="space-y-3">
                  {currentGames.map(game => {
                    const getPlayerName = (playerId) => {
                      const player = allPlayers.find(p => p.id === playerId);
                      return player?.name || 'Unknown';
                    };
                    
                    return (
                      <div key={game.id} className="border-2 border-green-400 bg-green-50 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-3">
                          <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                            Court {game.court_number}
                          </span>
                          <button
                            onClick={() => handleCompleteGame(game.id)}
                            className="bg-green-600 text-white px-3 py-1 rounded-xl text-xs font-semibold active:bg-green-700"
                          >
                            <CheckCircle size={14} className="inline mr-1" />
                            Finish
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div className="bg-white p-2 rounded-xl border-l-4 border-blue-500">
                            <div className="font-bold text-blue-700 text-xs mb-1">Team 1</div>
                            <div className="text-sm">{getPlayerName(game.team1_player1_id)}</div>
                            <div className="text-sm">{getPlayerName(game.team1_player2_id)}</div>
                          </div>
                          <div className="bg-white p-2 rounded-xl border-l-4 border-red-500">
                            <div className="font-bold text-red-700 text-xs mb-1">Team 2</div>
                            <div className="text-sm">{getPlayerName(game.team2_player1_id)}</div>
                            <div className="text-sm">{getPlayerName(game.team2_player2_id)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Queue */}
            {queuedGames.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Clock size={20} className="text-indigo-600" />
                  Queue ({queuedGames.length})
                </h2>
                <div className="space-y-3">
                  {queuedGames.map(game => {
                    const getPlayerName = (playerId) => {
                      const player = allPlayers.find(p => p.id === playerId);
                      return player?.name || 'Unknown';
                    };
                    
                    return (
                      <div key={game.id} className={`border-2 rounded-xl p-3 ${
                        game.is_custom ? 'border-purple-400 bg-purple-50' : 'border-gray-300'
                      }`}>
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-semibold text-sm text-gray-700">
                            Game {game.game_number} {game.is_custom && '⭐'}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditGame(game);
                              }}
                              className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-semibold active:bg-indigo-200 flex items-center gap-1"
                            >
                              <Edit size={12} />
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteQueuedGame(game.id);
                              }}
                              className="bg-red-100 text-red-700 px-3 py-1 rounded-lg text-xs font-semibold active:bg-red-200 flex items-center gap-1"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
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
                    );
                  })}
                </div>
              </div>
            )}

            {/* Payment Summary */}
            {breakdown && (
              <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                <h2 className="text-lg font-bold mb-3">💰 Payment Summary</h2>
                
                {/* Total Costs */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between p-3 bg-blue-50 rounded-xl">
                    <span className="text-sm font-medium">Court Rent</span>
                    <span className="font-bold">¥{courtRentFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-green-50 rounded-xl">
                    <span className="text-sm font-medium">Shuttlecocks ({ballsUsed})</span>
                    <span className="font-bold">¥{((ballsUsed / 12) * ballPrice).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200">
                    <span className="font-bold">Total Cost</span>
                    <span className="text-xl font-bold text-indigo-600">
                      ¥{breakdown.totalCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium">Cost per Game</span>
                    <span className="font-bold">¥{breakdown.costPerGame.toFixed(2)}</span>
                  </div>
                </div>

                {/* Player Breakdown */}
                <div className="border-t pt-3">
                  <h3 className="font-bold text-sm mb-2 text-gray-700">Player Breakdown</h3>
                  <div className="space-y-2">
                    {Object.entries(breakdown.playerCharges)
                      .sort(([, a], [, b]) => b.gamesPlayed - a.gamesPlayed)
                      .map(([playerId, { gamesPlayed, amountOwed }]) => {
                        const player = allPlayers.find(p => p.id === playerId);
                        return (
                          <div key={playerId} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                            <div>
                              <div className="font-semibold text-sm">{player?.name || 'Unknown'}</div>
                              <div className="text-xs text-gray-600">{gamesPlayed} games</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-indigo-600">¥{amountOwed.toFixed(2)}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Completed Games */}
            {completedGames.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <CheckCircle size={20} className="text-gray-600" />
                  Completed Games ({completedGames.length})
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {completedGames.map(game => {
                    const getPlayerName = (playerId) => {
                      const player = allPlayers.find(p => p.id === playerId);
                      return player?.name || 'Unknown';
                    };
                    
                    return (
                      <div key={game.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-semibold text-sm text-gray-700">
                            Game {game.game_number} {game.is_custom && '⭐'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {game.start_time && new Date(game.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                            {game.end_time && new Date(game.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
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
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Player Selector Modal */}
      {showPlayerSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Select Players</h3>
              <button onClick={() => setShowPlayerSelector(false)} className="p-2">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Choose players for today's session from the master list
            </p>
            <div className="space-y-2">
              {allPlayers
                .filter(p => !sessionPlayers.find(sp => sp.id === p.id))
                .map(player => (
                  <button
                    key={player.id}
                    onClick={() => addPlayerToSession(player.id)}
                    className="w-full p-3 bg-gray-50 hover:bg-indigo-50 active:bg-indigo-100 rounded-xl border-2 border-gray-200 hover:border-indigo-300 text-left transition-colors"
                  >
                    <div className="font-semibold">{player.name}</div>
                    <div className="text-xs text-gray-600">
                      {player.total_games_played} total games
                    </div>
                  </button>
                ))}
              {allPlayers.filter(p => !sessionPlayers.find(sp => sp.id === p.id)).length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  All players already added!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Match Modal */}
      {showCustomMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">⭐ Custom Match</h3>
              <button 
                onClick={() => { 
                  setShowCustomMatch(false); 
                  setCustomTeam1([]); 
                  setCustomTeam2([]); 
                  setInsertPosition(1);
                }} 
                className="p-2"
              >
                <X size={28} />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-3">Select 2 players per team:</p>
            
            {/* Team Display */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="border-2 border-blue-400 rounded-xl p-3 bg-blue-50">
                <h4 className="font-bold text-blue-700 text-sm mb-2">
                  Team 1 ({customTeam1.length}/2)
                </h4>
                <div className="space-y-1 min-h-[50px]">
                  {customTeam1.map(p => (
                    <div key={p.id} className="text-sm font-medium">{p.name}</div>
                  ))}
                </div>
              </div>
              <div className="border-2 border-red-400 rounded-xl p-3 bg-red-50">
                <h4 className="font-bold text-red-700 text-sm mb-2">
                  Team 2 ({customTeam2.length}/2)
                </h4>
                <div className="space-y-1 min-h-[50px]">
                  {customTeam2.map(p => (
                    <div key={p.id} className="text-sm font-medium">{p.name}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Player Selection (Active players only) */}
            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
              {sessionPlayers
                .filter(p => p.sessionStatus === 'active')
                .map(player => {
                  const inTeam1 = customTeam1.some(p => p.id === player.id);
                  const inTeam2 = customTeam2.some(p => p.id === player.id);
                  
                  return (
                    <div key={player.id} className="flex gap-2">
                      <button
                        onClick={() => togglePlayerInCustomTeam(player.id, 1)}
                        disabled={inTeam2 || (customTeam1.length >= 2 && !inTeam1)}
                        className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium ${
                          inTeam1
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-100 text-blue-700 active:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-400'
                        }`}
                      >
                        {player.name}
                      </button>
                      <button
                        onClick={() => togglePlayerInCustomTeam(player.id, 2)}
                        disabled={inTeam1 || (customTeam2.length >= 2 && !inTeam2)}
                        className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium ${
                          inTeam2
                            ? 'bg-red-600 text-white'
                            : 'bg-red-100 text-red-700 active:bg-red-200 disabled:bg-gray-200 disabled:text-gray-400'
                        }`}
                      >
                        {player.name}
                      </button>
                    </div>
                  );
                })}
            </div>

            {/* Position Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Insert at position:</label>
              <input
                type="number"
                min="1"
                max={Math.max(1, queuedGames.length + 1)}
                value={insertPosition || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setInsertPosition('');
                  } else {
                    const num = parseInt(val);
                    if (!isNaN(num)) {
                      setInsertPosition(Math.max(1, Math.min(num, queuedGames.length + 1)));
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '' || insertPosition === '') {
                    setInsertPosition(1);
                  }
                }}
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ fontSize: '16px' }}
              />
              <p className="text-xs text-gray-500 mt-1">
                1 = next · {queuedGames.length + 1} = end of queue
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { 
                  setShowCustomMatch(false); 
                  setCustomTeam1([]); 
                  setCustomTeam2([]); 
                  setInsertPosition(1);
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={insertCustomMatch}
                disabled={customTeam1.length !== 2 || customTeam2.length !== 2}
                className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl font-semibold disabled:bg-gray-300 active:bg-purple-700"
              >
                Insert Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      {editingGame && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">✏️ Edit Game {editingGame.game_number}</h3>
              <button 
                onClick={() => { 
                  setEditingGame(null); 
                  setEditTeam1([]); 
                  setEditTeam2([]); 
                }} 
                className="p-2"
              >
                <X size={28} />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-3">Update teams:</p>
            
            {/* Team Display */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="border-2 border-blue-400 rounded-xl p-3 bg-blue-50">
                <h4 className="font-bold text-blue-700 text-sm mb-2">
                  Team 1 ({editTeam1.length}/2)
                </h4>
                <div className="space-y-1 min-h-[50px]">
                  {editTeam1.map(p => (
                    <div key={p.id} className="text-sm font-medium">{p.name}</div>
                  ))}
                </div>
              </div>
              <div className="border-2 border-red-400 rounded-xl p-3 bg-red-50">
                <h4 className="font-bold text-red-700 text-sm mb-2">
                  Team 2 ({editTeam2.length}/2)
                </h4>
                <div className="space-y-1 min-h-[50px]">
                  {editTeam2.map(p => (
                    <div key={p.id} className="text-sm font-medium">{p.name}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Player Selection */}
            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
              {sessionPlayers
                .filter(p => p.sessionStatus === 'active')
                .map(player => {
                  const inTeam1 = editTeam1.some(p => p.id === player.id);
                  const inTeam2 = editTeam2.some(p => p.id === player.id);
                  
                  return (
                    <div key={player.id} className="flex gap-2">
                      <button
                        onClick={() => togglePlayerInEditTeam(player.id, 1)}
                        disabled={inTeam2 || (editTeam1.length >= 2 && !inTeam1)}
                        className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium ${
                          inTeam1
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-100 text-blue-700 active:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-400'
                        }`}
                      >
                        {player.name}
                      </button>
                      <button
                        onClick={() => togglePlayerInEditTeam(player.id, 2)}
                        disabled={inTeam1 || (editTeam2.length >= 2 && !inTeam2)}
                        className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium ${
                          inTeam2
                            ? 'bg-red-600 text-white'
                            : 'bg-red-100 text-red-700 active:bg-red-200 disabled:bg-gray-200 disabled:text-gray-400'
                        }`}
                      >
                        {player.name}
                      </button>
                    </div>
                  );
                })}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { 
                  setEditingGame(null); 
                  setEditTeam1([]); 
                  setEditTeam2([]); 
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedGame}
                disabled={editTeam1.length !== 2 || editTeam2.length !== 2}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold disabled:bg-gray-300 active:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}