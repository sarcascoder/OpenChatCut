import type { CapabilityKey } from '../../agent/capabilities';
import { currentCaps } from '../../agent/capabilities';

/**
 * Capabilities whose absence blocks common creative tasks (captions,
 * generation). Search/sandbox/web gaps stay silent: they do not block the
 * user-facing workflow this banner exists to unblock.
 */
const BANNER_CAPS: readonly CapabilityKey[] = ['transcription', 'image', 'voice', 'video', 'music', 'sound'];

/** Display labels for the capabilities this banner can report as missing. */
export const CAPABILITY_LABELS: Partial<Record<CapabilityKey, string>> = {
  transcription: 'Transcription',
  image: 'Image generation',
  voice: 'Voice',
  video: 'Video generation',
  music: 'Music',
  sound: 'Sound effects',
};

export function missingCreativeCaps(): readonly CapabilityKey[] {
  const caps = currentCaps();
  return BANNER_CAPS.filter((key) => caps[key] !== true);
}
