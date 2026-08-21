export type MediaView = 'grid' | 'list';

export function toggleMediaView(view: MediaView): MediaView {
  return view === 'grid' ? 'list' : 'grid';
}

export function mediaViewToggleLabel(view: MediaView): 'Switch to grid view' | 'Switch to list view' {
  return view === 'grid' ? 'Switch to list view' : 'Switch to grid view';
}
