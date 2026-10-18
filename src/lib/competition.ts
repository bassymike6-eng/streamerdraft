// src/lib/competition.ts
//
// WHAT THIS IS
// The competition's key dates and numbers, as code, for anything that needs
// to work them out (the admin dashboard's "days left" and "how many a day
// you need to hit 300").
//
// KEEP IN STEP WITH THE RULES
// The rules people agreed to are the words in src/components/page/Rules.tsx
// ("When it closes"). If the date ever changes there, change it here too.

// 23:59 UK time on Monday 16 November 2026. The UK's on GMT in November, so
// UK time is the same as UTC (the Z).
export const CLOSES_AT = "2026-11-16T23:59:59Z";
