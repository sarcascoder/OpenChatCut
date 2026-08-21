// The playful film-crew "thinking…" phrases shown while the agent runs
// We cycle one
// per running turn instead of a plain "Thinking about...".
export const THINKING_PHRASES: string[] = [
  'Pulling focus', 'Pushing the dolly', 'Checking the gate', 'Clapping the slate', 'Rolling sound', 'Blocking the scene',
  'Action!', 'Hitting the beat', 'Rigging lights', 'Finding the vibe', 'Take two', 'Scouting locations',
  'Panning over', 'Pushing in', 'Tracking along', 'Whip panning', 'Going handheld', 'Craning up',
  'Pulling wide', 'Going wide', 'Punching in', 'Jump cutting', 'Hard cutting', 'Cross dissolving',
  'Match cutting', 'Cross cutting', 'Montage time', 'Rolling an L-cut', 'Splicing film',
];

/** deterministic pick so a given turn keeps one phrase (index varies by seed). */
export function thinkingPhrase(seed: number): string {
  return THINKING_PHRASES[Math.abs(seed) % THINKING_PHRASES.length];
}
