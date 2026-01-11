/**
 * Payment Calculations Utility
 * 
 * Handles all financial calculations for badminton sessions:
 * - Session costs (court + shuttlecocks)
 * - Per-game costs
 * - Per-player charges
 * - Player game counts
 */

/**
 * Calculate total session costs
 * @param {number} courtFee - Court rental fee
 * @param {number} shuttlecockPrice - Price per dozen shuttlecocks
 * @param {number} shuttlecocksUsed - Number of shuttlecocks used
 * @returns {number} Total session cost
 */
export const calculateTotalCost = (courtFee, shuttlecockPrice, shuttlecocksUsed) => {
  const courtCost = courtFee || 0;
  const shuttlecockCost = ((shuttlecocksUsed || 0) / 12) * (shuttlecockPrice || 0);
  return courtCost + shuttlecockCost;
};

/**
 * Calculate cost per game
 * @param {number} totalCost - Total session cost
 * @param {number} totalGames - Number of games played
 * @returns {number} Cost per game
 */
export const calculateCostPerGame = (totalCost, totalGames) => {
  if (totalGames === 0) return 0;
  return totalCost / totalGames;
};

/**
 * Calculate cost per player per game
 * Each game has 4 players
 * @param {number} costPerGame - Cost per game
 * @returns {number} Cost per player per game
 */
export const calculateCostPerPlayer = (costPerGame) => {
  return costPerGame / 4;
};

/**
 * Get player IDs from a game
 * @param {Object} game - Game object with team player IDs
 * @returns {Array<string>} Array of player IDs
 */
export const getPlayerIdsFromGame = (game) => {
  return [
    game.team1_player1_id,
    game.team1_player2_id,
    game.team2_player1_id,
    game.team2_player2_id
  ].filter(id => id !== null && id !== undefined);
};

/**
 * Count games played per player
 * @param {Array<Object>} games - Array of completed games
 * @returns {Object} Object with playerId as key and game count as value
 */
export const getPlayerGameCounts = (games) => {
  const playerGames = {};
  
  games.forEach(game => {
    const playerIds = getPlayerIdsFromGame(game);
    playerIds.forEach(playerId => {
      playerGames[playerId] = (playerGames[playerId] || 0) + 1;
    });
  });
  
  return playerGames;
};

/**
 * Calculate charges for all players in a session
 * @param {Array<Object>} games - Array of completed games
 * @param {number} costPerPlayerPerGame - Cost per player per game
 * @returns {Object} Object with playerId as key and { gamesPlayed, amountOwed } as value
 */
export const calculatePlayerCharges = (games, costPerPlayerPerGame) => {
  const playerGames = getPlayerGameCounts(games);
  const playerCharges = {};
  
  Object.entries(playerGames).forEach(([playerId, gamesPlayed]) => {
    playerCharges[playerId] = {
      gamesPlayed,
      amountOwed: gamesPlayed * costPerPlayerPerGame
    };
  });
  
  return playerCharges;
};

/**
 * Calculate full session breakdown
 * @param {Object} session - Session object
 * @param {Array<Object>} completedGames - Array of completed games
 * @returns {Object} Complete session financial breakdown
 */
export const calculateSessionBreakdown = (session, completedGames) => {
  const totalCost = calculateTotalCost(
    session.court_fee,
    session.shuttlecock_price,
    session.shuttlecocks_used
  );
  
  const costPerGame = calculateCostPerGame(totalCost, completedGames.length);
  const costPerPlayerPerGame = calculateCostPerPlayer(costPerGame);
  const playerCharges = calculatePlayerCharges(completedGames, costPerPlayerPerGame);
  
  return {
    totalCost,
    costPerGame,
    costPerPlayerPerGame,
    totalGames: completedGames.length,
    playerCharges
  };
};

/**
 * Calculate difference when session costs change
 * Used for editing session costs after completion
 * @param {Object} oldSession - Original session data
 * @param {Object} newCosts - New cost values
 * @param {Array<Object>} games - Array of completed games
 * @returns {Object} Charge differences per player
 */
export const calculateCostDifference = (oldSession, newCosts, games) => {
  // Old costs
  const oldTotalCost = calculateTotalCost(
    oldSession.court_fee,
    oldSession.shuttlecock_price,
    oldSession.shuttlecocks_used
  );
  const oldCostPerGame = calculateCostPerGame(oldTotalCost, games.length);
  const oldCostPerPlayer = calculateCostPerPlayer(oldCostPerGame);
  
  // New costs
  const newTotalCost = calculateTotalCost(
    newCosts.court_fee,
    newCosts.shuttlecock_price,
    newCosts.shuttlecocks_used
  );
  const newCostPerGame = calculateCostPerGame(newTotalCost, games.length);
  const newCostPerPlayer = calculateCostPerPlayer(newCostPerGame);
  
  // Calculate differences
  const playerGames = getPlayerGameCounts(games);
  const differences = {};
  
  Object.entries(playerGames).forEach(([playerId, gamesPlayed]) => {
    const oldCharge = gamesPlayed * oldCostPerPlayer;
    const newCharge = gamesPlayed * newCostPerPlayer;
    differences[playerId] = {
      gamesPlayed,
      oldCharge,
      newCharge,
      difference: newCharge - oldCharge
    };
  });
  
  return {
    oldTotalCost,
    newTotalCost,
    newCostPerGame,
    differences
  };
};