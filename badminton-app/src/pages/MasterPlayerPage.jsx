import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import { Plus, Trash2, ArrowLeft, DollarSign, TrendingUp, TrendingDown, ArrowRightLeft, X } from 'lucide-react';

export default function MasterPlayerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isAdmin = !!user;
  
  const [players, setPlayers] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [fundAmount, setFundAmount] = useState('');
  const [loading, setLoading] = useState(true);

  // Transfer balance state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferToPlayer, setTransferToPlayer] = useState(null);
  const [transferFromPlayer, setTransferFromPlayer] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMode, setTransferMode] = useState('full'); // 'full' or 'custom'

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      let query = supabase.from('users').select('*').order('name');
      
      // If admin, exclude self. If public, show all players.
      if (userProfile?.id) {
        query = query.neq('id', userProfile.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPlayers(data || []);
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  };

  const addPlayer = async () => {
    if (!newPlayerName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{
          name: newPlayerName.trim(),
          current_balance: 0,
          total_games_played: 0
        }])
        .select();

      if (error) throw error;

      await loadPlayers();
      setNewPlayerName('');
      setShowAddModal(false);
      alert('Player added successfully!');
    } catch (error) {
      console.error('Error adding player:', error);
      alert('Failed to add player');
    }
  };

  const deletePlayer = async (playerId, playerName) => {
    if (!window.confirm(`Delete ${playerName}? This cannot be undone!`)) return;

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', playerId);

      if (error) throw error;

      await loadPlayers();
      alert('Player deleted!');
    } catch (error) {
      console.error('Error deleting player:', error);
      alert('Failed to delete player');
    }
  };

  const openAddFundsModal = (player) => {
    setSelectedPlayer(player);
    setFundAmount('');
    setShowAddFundsModal(true);
  };

  const addFunds = async () => {
    if (!selectedPlayer || !fundAmount) return;

    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount === 0) {
      alert('Please enter a valid amount (can be negative)');
      return;
    }

    try {
      // Update player balance
      const newBalance = (selectedPlayer.current_balance || 0) + amount;
      const { error: updateError } = await supabase
        .from('users')
        .update({ current_balance: newBalance })
        .eq('id', selectedPlayer.id);

      if (updateError) throw updateError;

      // Create transaction record
      const { error: transError } = await supabase
        .from('transactions')
        .insert([{
          user_id: selectedPlayer.id,
          amount: amount,
          type: amount > 0 ? 'payment' : 'game_charge',
          description: amount > 0 ? `Manual payment added` : `Starting balance adjustment`
        }]);

      if (transError) throw transError;

      await loadPlayers();
      setShowAddFundsModal(false);
      setSelectedPlayer(null);
      setFundAmount('');
      alert('Balance updated successfully!');
    } catch (error) {
      console.error('Error updating balance:', error);
      alert('Failed to update balance');
    }
  };

  const openTransferModal = (toPlayer) => {
    setTransferToPlayer(toPlayer);
    setTransferFromPlayer(null);
    setTransferAmount('');
    setTransferMode('full');
    setShowTransferModal(true);
  };

  const executeTransfer = async () => {
    if (!transferToPlayer || !transferFromPlayer) {
      alert('Please select a player to transfer from');
      return;
    }

    if (transferToPlayer.id === transferFromPlayer.id) {
      alert('Cannot transfer to the same player!');
      return;
    }

    let amountToTransfer = 0;

    if (transferMode === 'full') {
      // Transfer full balance (can be positive or negative)
      amountToTransfer = transferFromPlayer.current_balance;
    } else {
      // Custom amount - user enters absolute value
      const customAmount = parseFloat(transferAmount);
      if (isNaN(customAmount) || customAmount <= 0) {
        alert('Please enter a valid amount');
        return;
      }
      // If FROM owes (negative), transfer as negative
      // If FROM has credit (positive), transfer as positive
      amountToTransfer = transferFromPlayer.current_balance < 0 ? -customAmount : customAmount;
    }

    if (amountToTransfer === 0) {
      alert('No balance to transfer!');
      return;
    }

    // Simple math:
    // FROM always becomes 0
    const newFromBalance = 0;
    // TO receives FROM's balance (addition)
    const newToBalance = transferToPlayer.current_balance + amountToTransfer;

    const confirmMsg = `Transfer from ${transferFromPlayer.name} to ${transferToPlayer.name}?\n\n${transferFromPlayer.name}: ¥${transferFromPlayer.current_balance.toFixed(2)} → ¥0.00\n${transferToPlayer.name}: ¥${transferToPlayer.current_balance.toFixed(2)} → ¥${newToBalance.toFixed(2)}`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      // Update FROM player - always 0
      const { error: fromError } = await supabase
        .from('users')
        .update({ current_balance: newFromBalance })
        .eq('id', transferFromPlayer.id);

      if (fromError) throw fromError;

      // Update TO player - receives FROM's balance
      const { error: toError } = await supabase
        .from('users')
        .update({ current_balance: newToBalance })
        .eq('id', transferToPlayer.id);

      if (toError) throw toError;

      // Create transaction records
      const transactions = [
        {
          user_id: transferFromPlayer.id,
          amount: amountToTransfer,
          type: 'payment',
          description: `Balance transferred to ${transferToPlayer.name}`
        },
        {
          user_id: transferToPlayer.id,
          amount: -amountToTransfer,
          type: 'game_charge',
          description: `Balance transferred from ${transferFromPlayer.name}`
        }
      ];

      const { error: transError } = await supabase
        .from('transactions')
        .insert(transactions);

      if (transError) throw transError;

      await loadPlayers();
      setShowTransferModal(false);
      setTransferToPlayer(null);
      setTransferFromPlayer(null);
      setTransferAmount('');
      alert('Balance transferred successfully!');
    } catch (error) {
      console.error('Error transferring balance:', error);
      alert('Failed to transfer balance: ' + error.message);
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
          <h1 className="text-2xl font-bold text-indigo-900 mb-1">👥 All Players</h1>
          <p className="text-sm text-indigo-700">
            {isAdmin ? 'All registered players' : 'View player stats'}
          </p>
        </div>

        {isAdmin && (
          <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold active:bg-indigo-700 flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Add New Player
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-4">
          <h2 className="text-lg font-bold mb-3">Players ({players.length})</h2>
          <div className="space-y-3">
            {players.map(player => (
              <div key={player.id} className="p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{player.name}</h3>
                    <div className="text-sm text-gray-600 mt-1">
                      {player.total_games_played} total games
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${
                      player.current_balance < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {player.current_balance < 0 ? (
                        <span className="flex items-center gap-1">
                          <TrendingDown size={20} />
                          ¥{Math.abs(player.current_balance).toFixed(0)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <TrendingUp size={20} />
                          ¥{player.current_balance.toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {player.current_balance < 0 ? 'Owes' : 'Credit'}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => openAddFundsModal(player)}
                      className="flex-1 bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-semibold active:bg-green-200 flex items-center justify-center gap-1"
                    >
                      <DollarSign size={14} />
                      Adjust Balance
                    </button>
                    <button
                      onClick={() => openTransferModal(player)}
                      className="flex-1 bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-semibold active:bg-blue-200 flex items-center justify-center gap-1"
                    >
                      <ArrowRightLeft size={14} />
                      Transfer
                    </button>
                    <button
                      onClick={() => deletePlayer(player.id, player.name)}
                      className="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm font-semibold active:bg-red-200"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {players.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No players yet. Add your first player!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Player Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Add New Player</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2">
                <X size={24} />
              </button>
            </div>
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
              placeholder="Enter player name"
              className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              style={{ fontSize: '16px' }}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={addPlayer}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold active:bg-indigo-700"
              >
                Add Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Funds Modal */}
      {showAddFundsModal && selectedPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">💰 Adjust Balance</h3>
              <button onClick={() => setShowAddFundsModal(false)} className="p-2">
                <X size={24} />
              </button>
            </div>
            <p className="text-gray-600 mb-4">
              Adjusting balance for <strong>{selectedPlayer.name}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-2">
              Current balance: <span className={selectedPlayer.current_balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                ¥{selectedPlayer.current_balance.toFixed(2)}
              </span>
            </p>
            <input
              type="text"
              inputMode="decimal"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder="Enter amount (positive or negative)"
              className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
              style={{ fontSize: '16px' }}
              autoFocus
            />
            <p className="text-xs text-gray-500 mb-4">
              💡 Tip: Use <strong>negative</strong> values to set starting debt (e.g., -1314)
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddFundsModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={addFunds}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold active:bg-green-700"
              >
                Update Balance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Balance Modal */}
      {showTransferModal && transferToPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">💰 Transfer Balance</h3>
              <button onClick={() => setShowTransferModal(false)} className="p-2">
                <X size={24} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 rounded-xl">
              <p className="text-sm text-gray-600 mb-1">Transfer TO:</p>
              <p className="font-bold text-lg">{transferToPlayer.name}</p>
              <p className="text-sm text-gray-600">
                Current: <span className={transferToPlayer.current_balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                  ¥{transferToPlayer.current_balance.toFixed(2)}
                </span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Transfer FROM:</label>
              <select
                value={transferFromPlayer?.id || ''}
                onChange={(e) => {
                  const player = players.find(p => p.id === e.target.value);
                  setTransferFromPlayer(player);
                }}
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              >
                <option value="">Select player...</option>
                {players
                  .filter(p => p.id !== transferToPlayer.id)
                  .map(player => (
                    <option key={player.id} value={player.id}>
                      {player.name} (¥{player.current_balance.toFixed(2)})
                    </option>
                  ))}
              </select>
            </div>

            {transferFromPlayer && (
              <>
                <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-600 mb-1">From: {transferFromPlayer.name}</p>
                  <p className="text-sm">
                    Balance: <span className={transferFromPlayer.current_balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                      ¥{transferFromPlayer.current_balance.toFixed(2)}
                    </span>
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Transfer Mode:</label>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setTransferMode('full')}
                      className={`flex-1 px-4 py-2 rounded-xl font-semibold ${
                        transferMode === 'full'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                      }`}
                    >
                      Full Balance
                    </button>
                    <button
                      onClick={() => setTransferMode('custom')}
                      className={`flex-1 px-4 py-2 rounded-xl font-semibold ${
                        transferMode === 'custom'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                      }`}
                    >
                      Custom Amount
                    </button>
                  </div>

                  {transferMode === 'full' && (
                    <div className="p-3 bg-green-50 rounded-xl text-center">
                      <p className="text-sm text-gray-600">Will transfer:</p>
                      <p className="text-2xl font-bold text-green-600">
                        ¥{transferFromPlayer.current_balance.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {transferFromPlayer.name} → ¥0.00
                      </p>
                      <p className="text-xs text-gray-500">
                        {transferToPlayer.name} → ¥{(transferToPlayer.current_balance + transferFromPlayer.current_balance).toFixed(2)}
                      </p>
                    </div>
                  )}

                  {transferMode === 'custom' && (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="Enter amount (¥)"
                      className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ fontSize: '16px' }}
                    />
                  )}
                </div>

                <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                  <p className="text-xs text-gray-700">
                    <strong>Note:</strong> {transferFromPlayer.name}'s balance will be transferred to {transferToPlayer.name}. 
                    {transferFromPlayer.name} will become ¥0.00.
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={executeTransfer}
                disabled={!transferFromPlayer}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:bg-gray-300 active:bg-blue-700"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}