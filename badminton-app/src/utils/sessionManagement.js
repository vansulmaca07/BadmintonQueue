/**
 * Session Management Utility
 * 
 * Handles high-level session operations:
 * - Complete session (end and apply charges)
 * - Cancel session (delete if no games played)
 * - Delete session (with full reversal)
 */

import { supabase } from '../services/supabaseClient';
import { calculateSessionBreakdown } from './paymentCalculations';
import { 
  applySessionCharges, 
  reverseSessionCharges, 
  subtractPlayerGames 
} from './playerBalanceUpdates';
import { getPlayerGameCounts } from './paymentCalculations';

/**
 * Complete a session and apply charges to all players
 * @param {string} sessionId - Session ID
 * @param {Object} costs - Object with court_fee, shuttlecock_price, shuttlecocks_used
 * @returns {Promise<Object>} Result object with success status
 */
export const completeSession = async (sessionId, costs) => {
  try {
    // Get all completed games for this session
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'completed');
    
    if (gamesError) throw gamesError;
    
    if (!games || games.length === 0) {
      throw new Error('No completed games in this session');
    }
    
    // Get session data for date
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('session_date')
      .eq('id', sessionId)
      .single();
    
    if (sessionError) throw sessionError;
    
    // Calculate charges
    const breakdown = calculateSessionBreakdown(
      { ...costs, ...session },
      games
    );
    
    // Apply charges to players
    const chargesResult = await applySessionCharges(
      breakdown.playerCharges,
      sessionId,
      session.session_date
    );
    
    if (!chargesResult.success) {
      throw new Error(chargesResult.error);
    }
    
    // Update session status
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        court_fee: costs.court_fee,
        shuttlecock_price: costs.shuttlecock_price,
        shuttlecocks_used: costs.shuttlecocks_used,
        total_games: games.length,
        cost_per_game: breakdown.costPerGame
      })
      .eq('id', sessionId);
    
    if (updateError) throw updateError;
    
    return { 
      success: true, 
      breakdown,
      updates: chargesResult.updates
    };
  } catch (error) {
    console.error('Error completing session:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Cancel an in-progress session
 * Only works if no games have been completed yet
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Result object with success status
 */
export const cancelSession = async (sessionId) => {
  try {
    // Check if any games have been completed
    const { data: completedGames, error: gamesError } = await supabase
      .from('games')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'completed');
    
    if (gamesError) throw gamesError;
    
    if (completedGames && completedGames.length > 0) {
      return { 
        success: false, 
        error: 'Cannot cancel session with completed games. Use "End Session" instead.' 
      };
    }
    
    // Delete all games (queued and playing)
    const { error: deleteGamesError } = await supabase
      .from('games')
      .delete()
      .eq('session_id', sessionId);
    
    if (deleteGamesError) throw deleteGamesError;
    
    // Delete session_players
    const { error: deletePlayersError } = await supabase
      .from('session_players')
      .delete()
      .eq('session_id', sessionId);
    
    if (deletePlayersError) throw deletePlayersError;
    
    // Delete session
    const { error: deleteSessionError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);
    
    if (deleteSessionError) throw deleteSessionError;
    
    return { success: true, message: 'Session cancelled successfully' };
  } catch (error) {
    console.error('Error cancelling session:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete a completed session with full balance reversal
 * This is a destructive operation that requires multiple confirmations
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Result object with success status and impact details
 */
export const deleteSession = async (sessionId) => {
  try {
    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sessionError) throw sessionError;
    
    // Get all games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('session_id', sessionId);
    
    if (gamesError) throw gamesError;
    
    // Calculate impact
    const completedGames = games.filter(g => g.status === 'completed');
    const playerGames = getPlayerGameCounts(completedGames);
    const playerCount = Object.keys(playerGames).length;
    
    // Step 1: Reverse all charges
    if (session.status === 'completed') {
      const reverseResult = await reverseSessionCharges(sessionId);
      if (!reverseResult.success) {
        throw new Error('Failed to reverse charges: ' + reverseResult.error);
      }
    }
    
    // Step 2: Subtract games from player totals
    const subtractResult = await subtractPlayerGames(playerGames);
    if (!subtractResult.success) {
      throw new Error('Failed to subtract games: ' + subtractResult.error);
    }
    
    // Step 3: Delete all related transactions (including reversals we just created)
    const { error: deleteTransError } = await supabase
      .from('transactions')
      .delete()
      .eq('session_id', sessionId);
    
    if (deleteTransError) throw deleteTransError;
    
    // Step 4: Delete all games
    const { error: deleteGamesError } = await supabase
      .from('games')
      .delete()
      .eq('session_id', sessionId);
    
    if (deleteGamesError) throw deleteGamesError;
    
    // Step 5: Delete session_players
    const { error: deletePlayersError } = await supabase
      .from('session_players')
      .delete()
      .eq('session_id', sessionId);
    
    if (deletePlayersError) throw deletePlayersError;
    
    // Step 6: Delete session
    const { error: deleteSessionError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);
    
    if (deleteSessionError) throw deleteSessionError;
    
    return { 
      success: true, 
      impact: {
        playersAffected: playerCount,
        gamesDeleted: games.length,
        chargesReversed: session.status === 'completed'
      }
    };
  } catch (error) {
    console.error('Error deleting session:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get session deletion impact (for showing warnings)
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Impact details
 */
export const getSessionDeletionImpact = async (sessionId) => {
  try {
    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sessionError) throw sessionError;
    
    // Get games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('session_id', sessionId);
    
    if (gamesError) throw gamesError;
    
    // Calculate impact
    const completedGames = games.filter(g => g.status === 'completed');
    const playerGames = getPlayerGameCounts(completedGames);
    
    // Calculate total charges if session is completed
    let totalCharges = 0;
    if (session.status === 'completed') {
      totalCharges = session.court_fee + (session.shuttlecocks_used / 12) * session.shuttlecock_price;
    }
    
    return {
      success: true,
      impact: {
        sessionDate: session.session_date,
        status: session.status,
        playersAffected: Object.keys(playerGames).length,
        totalGames: games.length,
        completedGames: completedGames.length,
        totalCharges,
        playerGames
      }
    };
  } catch (error) {
    console.error('Error getting deletion impact:', error);
    return { success: false, error: error.message };
  }
};