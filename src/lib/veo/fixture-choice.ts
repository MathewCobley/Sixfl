/** Shared browser/server offer contract; no server-only dependencies. */
export const VEO_FIXTURE_TERMS = 'veo-fixture-v2';
export type VeoFixtureChoice = 'NONE'|'MATCH'|'ONGOING';
export function parseVeoFixtureChoice(value:unknown):VeoFixtureChoice {
  if(value!=='NONE'&&value!=='MATCH'&&value!=='ONGOING')throw new Error('Choose No thanks, Just this match, or This and future matches.');
  return value;
}
