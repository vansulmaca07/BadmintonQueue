/**
 * Player Balance Updates Utility
 * 
 * Handles all player balance operations:
 * - Single player updates
 * - Bulk balance updates
 * - Transaction creation
 * - Balance reversals
 */

import { supabase } from '../services/supabaseClient';

/**
 * Update a single player's balance
 * @param {string} playerId - Player ID
 * @param {number} balanceChange - Amount to add/subtract (negative for charges)
 * @param {number} gamesPlayed - Number of games to add to total (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export const updatePlayerBalance = async (playerId, balanceChange, gamesPlayed = 0) => {
  try {
    // Get current player data
    const { data: player, error: fetchError } = await supabase
      .from('users')
      .select('current_balance, total_games_played')
      .eq('id', playerId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Calculate new values
    const newBalance = (player.current_balance || 0) + balanceChange;
    const newTotalGames = (player.total_games_played || 0) + gamesPlayed;
    
    // Update player
    const updateData = { current_balance: newBalance };
    if (gamesPlayed !== 0) {
      updateData.total_games_played = newTotalGames;
    }
    
    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', playerId);
    
    if (updateError) throw updateError;
    
    return { success: true, newBalance, newTotalGames };
  } catch (error) {
    console.error('Error updating player balance:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Create a transaction record
 * @param {string} userId - User ID
 * @param {number} amount - Transaction amount (positive = credit, negative = charge)
 * @param {string} type - Transaction type ('payment' or 'game_charge')
 * @param {string} description - Transaction description
 * @param {string} sessionId - Session ID (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export const createTransaction = async (userId, amount, type, description, sessionId = null) => {
  try {
    const transactionData = {
      user_id: userId,
      amount,
      type,
      description
    };
    
    if (sessionId) {
      transactionData.session_id = sessionId;
    }
    
    const { error } = await supabase
      .from('transactions')
      .insert(transactionData);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error) {
    console.error('Error creating transaction:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Apply session charges to multiple players
 * @param {Object} playerCharges - Object with playerId as key and { gamesPlayed, amountOwed } as value
 * @param {string} sessionId - Session ID
 * @param {string} sessionDate - Session date for description
 * @returns {Promise<Object>} Result object with success status and details
 */
export const applySessionCharges = async (playerCharges, sessionId, sessionDate) => {
  try {
    const updates = [];
    
    for (const [playerId, { gamesPlayed, amountOwed }] of Object.entries(playerCharges)) {
      // Update balance (negative because it's a charge)
      const balanceResult = await updatePlayerBalance(playerId, -amountOwed, gamesPlayed);
      if (!balanceResult.success) {
        throw new Error(`Failed to update balance for player ${playerId}`);
      }
      
      // Create transaction
      const transactionResult = await createTransaction(
        playerId,
        -amountOwed,
        'game_charge',
        `${gamesPlayed} games played - Session ${new Date(sessionDate).toLocaleDateString()}`,
        sessionId
      );
      if (!transactionResult.success) {
        throw new Error(`Failed to create transaction for player ${playerId}`);
      }
      
      updates.push({
        playerId,
        gamesPlayed,
        amountOwed,
        newBalance: balanceResult.newBalance
      });
    }
    
    return { success: true, updates };
  } catch (error) {
    console.error('Error applying session charges:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Reverse session charges (used when deleting/editing sessions)
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Result object with success status
 */
export const reverseSessionCharges = async (sessionId) => {
  try {
    // Get all transactions for this session
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'game_charge');
    
    if (transError) throw transError;
    
    if (!transactions || transactions.length === 0) {
      return { success: true, message: 'No charges to reverse' };
    }
    
    // Reverse each transaction
    for (const trans of transactions) {
      // Reverse the balance change (add back what was subtracted)
      const reverseAmount = -trans.amount; // Flip the sign
      await updatePlayerBalance(trans.user_id, reverseAmount, 0);
      
      // Create reversal transaction
      await createTransaction(
        trans.user_id,
        reverseAmount,
        'game_charge',
        `Reversal: ${trans.description}`,
        sessionId
      );
    }
    
    return { success: true, reversedCount: transactions.length };
  } catch (error) {
    console.error('Error reversing session charges:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Adjust player balances when session costs change
 * Used when editing completed sessions
 * @param {Object} differences - Difference object from calculateCostDifference
 * @param {string} sessionId - Session ID
 * @param {string} sessionDate - Session date for description
 * @returns {Promise<Object>} Result object with success status
 */
export const adjustSessionCharges = async (differences, sessionId, sessionDate) => {
  try {
    const adjustments = [];
    
    for (const [playerId, diffData] of Object.entries(differences)) {
      // Skip if difference is negligible
      if (Math.abs(diffData.difference) < 0.01) continue;
      
      // Apply the difference (negative if charges increased)
      const balanceResult = await updatePlayerBalance(playerId, -diffData.difference, 0);
      if (!balanceResult.success) {
        throw new Error(`Failed to adjust balance for player ${playerId}`);
      }
      
      // Create adjustment transaction
      const transactionResult = await createTransaction(
        playerId,
        -diffData.difference,
        'game_charge',
        `Session cost adjustment - ${new Date(sessionDate).toLocaleDateString()}`,
        sessionId
      );
      if (!transactionResult.success) {
        throw new Error(`Failed to create adjustment transaction for player ${playerId}`);
      }
      
      adjustments.push({
        playerId,
        difference: diffData.difference,
        newBalance: balanceResult.newBalance
      });
    }
    
    return { success: true, adjustments };
  } catch (error) {
    console.error('Error adjusting session charges:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Subtract games from players' total count
 * Used when deleting sessions
 * @param {Object} playerGames - Object with playerId as key and game count as value
 * @returns {Promise<Object>} Result object with success status
 */
export const subtractPlayerGames = async (playerGames) => {
  try {
    for (const [playerId, gamesCount] of Object.entries(playerGames)) {
      // Get current total
      const { data: player, error: fetchError } = await supabase
        .from('users')
        .select('total_games_played')
        .eq('id', playerId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Subtract games
      const newTotal = Math.max(0, (player.total_games_played || 0) - gamesCount);
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ total_games_played: newTotal })
        .eq('id', playerId);
      
      if (updateError) throw updateError;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error subtracting player games:', error);
    return { success: false, error: error.message };
  }
};