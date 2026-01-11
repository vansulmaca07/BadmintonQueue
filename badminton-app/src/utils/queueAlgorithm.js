// Queue generation algorithm from original BadmintonQueue.js

export const getPlayerPairingHistory = (p1, p2, games) => {
  let teammates = 0;
  let opponents = 0;
  
  games.forEach(game => {
    const p1InTeam1 = game.team1_player1_id === p1 || game.team1_player2_id === p1;
    const p1InTeam2 = game.team2_player1_id === p1 || game.team2_player2_id === p1;
    const p2InTeam1 = game.team1_player1_id === p2 || game.team1_player2_id === p2;
    const p2InTeam2 = game.team2_player1_id === p2 || game.team2_player2_id === p2;
    
    // Check if they were teammates
    if ((p1InTeam1 && p2InTeam1) || (p1InTeam2 && p2InTeam2)) {
      teammates++;
    }
    // Check if they were opponents
    else if ((p1InTeam1 && p2InTeam2) || (p1InTeam2 && p2InTeam1)) {
      opponents++;
    }
  });
  
  return { teammates, opponents };
};

export const getPlayerInteractionScore = (p1, p2, recentGames) => {
  let score = 0;
  const maxGamesToCheck = 10;
  recentGames.slice(-maxGamesToCheck).forEach((game, idx) => {
    const distance = recentGames.length - idx;
    const isP1InGame = 
      game.team1_player1_id === p1 || game.team1_player2_id === p1 ||
      game.team2_player1_id === p1 || game.team2_player2_id === p1;
    const isP2InGame = 
      game.team1_player1_id === p2 || game.team1_player2_id === p2 ||
      game.team2_player1_id === p2 || game.team2_player2_id === p2;
    if (isP1InGame && isP2InGame) score += (maxGamesToCheck - distance + 1) * 2;
  });
  return score;
};

export const generateQueue = (availablePlayers, allGames, queuedGames) => {
  if (availablePlayers.length < 4) return [];
  
  const newQueue = [];
  
  // Track how many times each player appears in the new queue
  const queueCount = {};
  availablePlayers.forEach(p => queueCount[p.id] = 0);
  
  // MAXIMUM 3 GAMES in queue only!
  const maxQueueGames = 3;
  
  for (let gameNum = 0; gameNum < maxQueueGames; gameNum++) {
    let bestMatch = null;
    let bestScore = Infinity;
    
    // Find current min/max to prioritize balance
    const counts = Object.values(queueCount);
    const currentMinCount = Math.min(...counts);
    
    // Get players with minimum count (these MUST be prioritized)
    const playersWithMinCount = availablePlayers.filter(p => queueCount[p.id] === currentMinCount);
    
    for (let i = 0; i < availablePlayers.length - 3; i++) {
      for (let j = i + 1; j < availablePlayers.length - 2; j++) {
        for (let k = j + 1; k < availablePlayers.length - 1; k++) {
          for (let l = k + 1; l < availablePlayers.length; l++) {
            const fourPlayers = [availablePlayers[i], availablePlayers[j], availablePlayers[k], availablePlayers[l]];
            
            // Count how many players with min count are in this group
            const minCountPlayersInGroup = fourPlayers.filter(p => queueCount[p.id] === currentMinCount).length;
            
            // SKIP if this group doesn't include enough players with min count
            if (playersWithMinCount.length >= 4 && minCountPlayersInGroup < 3) {
              continue;
            }
            
            // Try all possible team combinations for these 4 players
            const possibleTeams = [
              { team1: [fourPlayers[0], fourPlayers[1]], team2: [fourPlayers[2], fourPlayers[3]] },
              { team1: [fourPlayers[0], fourPlayers[2]], team2: [fourPlayers[1], fourPlayers[3]] },
              { team1: [fourPlayers[0], fourPlayers[3]], team2: [fourPlayers[1], fourPlayers[2]] }
            ];
            
            possibleTeams.forEach(teams => {
              const allPlayersInMatch = [...teams.team1, ...teams.team2];
              let totalScore = 0;
              
              // SUPER PRIORITY: Include players with MINIMUM count
              const playersWithMinInMatch = allPlayersInMatch.filter(p => queueCount[p.id] === currentMinCount).length;
              totalScore -= playersWithMinInMatch * 1000000;
              
              // PRIORITY 1: Balance games in queue
              const playerCounts = allPlayersInMatch.map(p => queueCount[p.id]);
              const minInGroup = Math.min(...playerCounts);
              const maxInGroup = Math.max(...playerCounts);
              const groupGap = maxInGroup - minInGroup;
              totalScore += groupGap * 100000;
              
              // PRIORITY 2: Favor players with fewer games in queue
              const totalQueueGames = allPlayersInMatch.reduce((sum, p) => sum + queueCount[p.id], 0);
              totalScore += totalQueueGames * 10000;
              
              // PRIORITY 3: VARIETY - Avoid repeated pairings (TEAMMATES)
              const allGamesIncludingQueue = [...allGames, ...queuedGames, ...newQueue];
              let teammateRepeatScore = 0;
              
              const team1History = getPlayerPairingHistory(teams.team1[0].id, teams.team1[1].id, allGamesIncludingQueue);
              teammateRepeatScore += team1History.teammates * 5000;
              
              const team2History = getPlayerPairingHistory(teams.team2[0].id, teams.team2[1].id, allGamesIncludingQueue);
              teammateRepeatScore += team2History.teammates * 5000;
              
              totalScore += teammateRepeatScore;
              
              // PRIORITY 4: VARIETY - Avoid repeated opponents
              let opponentRepeatScore = 0;
              teams.team1.forEach(p1 => {
                teams.team2.forEach(p2 => {
                  const oppHistory = getPlayerPairingHistory(p1.id, p2.id, allGamesIncludingQueue);
                  opponentRepeatScore += oppHistory.opponents * 3000;
                });
              });
              
              totalScore += opponentRepeatScore;
              
              // PRIORITY 5: Balance total historical games played
              const totalGamesPlayed = allPlayersInMatch.reduce((sum, p) => sum + p.total_games_played, 0);
              totalScore += totalGamesPlayed * 100;
              
              // PRIORITY 6: Avoid very recent interactions
              for (let a = 0; a < 4; a++) {
                for (let b = a + 1; b < 4; b++) {
                  totalScore += getPlayerInteractionScore(allPlayersInMatch[a].id, allPlayersInMatch[b].id, allGamesIncludingQueue) * 10;
                }
              }
              
              if (totalScore < bestScore) {
                bestScore = totalScore;
                bestMatch = { 
                  team1: teams.team1, 
                  team2: teams.team2
                };
              }
            });
          }
        }
      }
    }
    
    if (bestMatch) {
      newQueue.push(bestMatch);
      // Update queue counts
      [...bestMatch.team1, ...bestMatch.team2].forEach(p => queueCount[p.id]++);
    } else {
      break;
    }
  }
  
  return newQueue;
};