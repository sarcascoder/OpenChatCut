import type { IconName } from '../icons';

interface ProjectStarter {
  readonly label: string;
  readonly description: string;
  readonly prompt: string;
  readonly icon: IconName;
}

interface QuickAction {
  readonly label: string;
  readonly prompt: string;
}

export const EMPTY_PROJECT_STARTERS: readonly ProjectStarter[] = [
  { label: 'Clean talking-head edit', description: 'Remove pauses and filler, then sync captions', prompt: 'Polish the current talking-head video: remove dead air and filler, then generate synced captions', icon: 'scissors' },
  { label: 'Motion package', description: 'Titles, info cards, and transitions', prompt: 'Design a motion package for the current content, including titles, info cards, and transitions', icon: 'film' },
  { label: 'Long-form highlights', description: 'Find highlights and reshape them as shorts', prompt: 'Find highlights in the current long video and reshape them into publish-ready shorts', icon: 'video' },
  { label: 'Product story', description: 'Build the script and shots around key benefits', prompt: 'Build a script and shot sequence around the product benefits, then create a promo', icon: 'sparkles' },
  { label: 'AI visual', description: 'Develop shots and sound from a concept', prompt: 'Plan an AI visual from my concept, developing the shots, sound, and pacing', icon: 'image' },
  { label: 'Knowledge video', description: 'Turn a topic into a clear explanation', prompt: 'Turn the topic into a structured explainer with captions and visual cues', icon: 'play' },
];

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { label: 'Remove filler words', prompt: 'Remove filler words from the current talking-head edit while keeping captions and video in sync' },
  { label: 'Remove silence', prompt: 'Remove silent pauses from the current timeline and close the gaps' },
  { label: 'Jump cut', prompt: 'Turn the current talking-head edit into a tightly paced jump-cut version' },
  { label: 'Generate captions', prompt: 'Generate and apply synchronized captions for the current talking-head edit' },
  { label: 'Normalize loudness', prompt: 'Normalize dialogue loudness on the current timeline' },
  { label: 'Landscape to portrait', prompt: 'Convert the current project to 9:16 portrait and reframe the main visuals' },
];

