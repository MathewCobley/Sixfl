// ========================================
// File: src/lib/fixtures/generateRoundRobin.ts
// ========================================

export type RoundRobinMatch = {
    homeTeamId: string
    awayTeamId: string
    round: number
  }
  
  export default function generateRoundRobin(teamIds: string[]): RoundRobinMatch[] {
    const teams = [...teamIds]
  
    if (teams.length < 2) {
      return []
    }
  
    const hasBye = teams.length % 2 !== 0
    if (hasBye) {
      teams.push("__BYE__")
    }
  
    const totalTeams = teams.length
    const rounds = totalTeams - 1
    const matchesPerRound = totalTeams / 2
  
    const rotation = [...teams]
    const fixtures: RoundRobinMatch[] = []
  
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < matchesPerRound; i++) {
        const home = rotation[i]
        const away = rotation[totalTeams - 1 - i]
  
        if (home !== "__BYE__" && away !== "__BYE__") {
          fixtures.push({
            homeTeamId: round % 2 === 0 ? home : away,
            awayTeamId: round % 2 === 0 ? away : home,
            round: round + 1,
          })
        }
      }
  
      const fixed = rotation[0]
      const rest = rotation.slice(1)
  
      rest.unshift(rest.pop() as string)
      rotation.splice(0, rotation.length, fixed, ...rest)
    }
  
    return fixtures
  }