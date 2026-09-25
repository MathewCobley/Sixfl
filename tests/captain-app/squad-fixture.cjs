// Synthetic people only; never a copy of a production squad.
const names = ['Chris Morgan', 'Alex Taylor', 'Jordan Evans', 'Sam Walker', 'Jamie Reed', 'Taylor Brooks', 'Charlie Ellis', 'Robin Clarke', 'Drew Parker'];
const members = names.map((name, i) => ({
  id: `member-${i + 1}`, name, email: i === 6 ? null : `player${i + 1}@example.invalid`,
  phone: i === 0 ? '07700 900123' : null, squadNumber: i === 1 ? null : i + 1,
  role: i === 0 ? 'CAPTAIN' : i === 1 ? 'VICE_CAPTAIN' : i === 8 ? 'BACKUP_PLAYER' : 'PLAYER',
  roleLabel: i === 0 ? 'Captain' : i === 1 ? 'Vice captain' : i === 8 ? 'Backup player' : 'Player',
  isRegular: i < 3, whatsAppUrl: i === 0 ? 'https://wa.me/447700900123' : null,
  addedLabel: '10 Sept 2026', goals: i + 1, assists: i % 3, playerOfMatchAwards: i % 2,
  profile: i === 0 ? [{ label: 'Position', value: 'Defender' }] : [],
  availabilityNotes: i === 0 ? 'Usually available on Tuesdays.' : null,
}));
module.exports = { members };
