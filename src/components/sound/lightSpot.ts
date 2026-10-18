// src/components/sound/lightSpot.ts
//
// WHERE THE INTRO'S LIGHT IS RIGHT NOW, so its sound can follow it.
// EdgeLight.tsx writes the front of the light's position every frame it
// draws (0 to 1 across and down the screen); engine.ts reads it while the
// "lap" sound plays, and moves the sound left / right with it (brighter at
// the top of the screen, darker at the bottom).

export const lightSpot = { x: 0.5, y: 0.5, at: 0 };
