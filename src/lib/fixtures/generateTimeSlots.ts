// ========================================
// File: src/lib/fixtures/generateTimeSlots.ts
// ========================================

export function generateTimeSlots(
    start = "18:30",
    matchDuration = 40,
    matchesPerRound = 3
  ) {
    const [h, m] = start.split(":").map(Number);
    const base = new Date();
    base.setHours(h, m, 0, 0);
  
    const slots: Date[] = [];
  
    for (let i = 0; i < matchesPerRound; i++) {
      const slot = new Date(base);
      slot.setMinutes(base.getMinutes() + i * matchDuration);
      slots.push(slot);
    }
  
    return slots;
  }