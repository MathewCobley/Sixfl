// ========================================
// File: src/lib/fixtures/generateRoundRobin.ts
// ========================================

export type RoundRobinPairing = {
    home: string;
    away: string;
  };
  
  export type RoundRobinRound = {
    round: number;
    matches: RoundRobinPairing[];
  };
  
  export default function generateRoundRobin(teamIds: string[]): RoundRobinRound[] {
    const teams = [...teamIds];
  
    if (teams.length < 2) {
      return [];
    }
  
    const hasBye = teams.length % 2 !== 0;
  
    if (hasBye) {
      teams.push("__BYE__");
    }
  
    const totalTeams = teams.length;
    const totalRounds = totalTeams - 1;
    const matchesPerRound = totalTeams / 2;
  
    const rotation = [...teams];
    const rounds: RoundRobinRound[] = [];
  
    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
      const matches: RoundRobinPairing[] = [];
  
      for (let i = 0; i < matchesPerRound; i++) {
        const home = rotation[i];
        const away = rotation[totalTeams - 1 - i];
  
        if (home !== "__BYE__" && away !== "__BYE__") {
          matches.push({
            home: roundIndex % 2 === 0 ? home : away,
            away: roundIndex % 2 === 0 ? away : home,
          });
        }
      }
  
      rounds.push({
        round: roundIndex + 1,
        matches,
      });
  
      const fixed = rotation[0];
      const rest = rotation.slice(1);
  
      rest.unshift(rest.pop() as string);
      rotation.splice(0, rotation.length, fixed, ...rest);
    }
  
    return rounds;
  }