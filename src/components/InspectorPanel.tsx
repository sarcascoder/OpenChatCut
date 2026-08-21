import { useEffect, useState, type RefObject } from 'react';
import type { PlayerRef } from '@remotion/player';
import { Icon } from './icons';
import { HistoryGestureProvider } from './inspector/InspectorKeyframeControls';
import { InspectorContent, type InspectorTab } from './inspector/InspectorContent';
import type { InspectorPanelProps } from './inspector/InspectorTypes';
import { CaptionInspectorControls } from './inspector/CaptionInspectorControls';

function useInspectorPlayhead(getPlayhead: () => number, playerRef: RefObject<PlayerRef | null>): number {
  const [playhead, setPlayhead] = useState(getPlayhead);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const apply = (frame: number) => {
      lastUpdate = performance.now();
      setPlayhead((current) => current === frame ? current : frame);
    };
    const onFrame = (event: { detail: { frame: number } }) => {
      const wait = 100 - (performance.now() - lastUpdate);
      if (wait <= 0) {
        apply(event.detail.frame);
        return;
      }
      clearTimeout(trailing);
      trailing = setTimeout(() => apply(event.detail.frame), wait);
    };
    apply(player.getCurrentFrame());
    player.addEventListener('frameupdate', onFrame);
    return () => {
      clearTimeout(trailing);
      player.removeEventListener('frameupdate', onFrame);
    };
  }, [playerRef]);
  return playhead;
}

function InspectorHeader({ panel }: { panel: InspectorPanelProps }) {
  const item = panel.selectedItem;
  const caption = panel.selectedCaption;
  const count = panel.selectedItems.length;
  return (
    <button
      type="button"
      onClick={() => panel.onCollapsedChange(!panel.collapsed)}
      title={panel.collapsed ? 'Expand properties' : 'Collapse properties'}
      className="cc-insp-header"
    >
      <span className={`cc-insp-chevron${panel.collapsed ? ' closed' : ''}`}><Icon name="chevronDown" size={12} /></span>
      <span className="cc-insp-heading">
        <span className="cc-insp-title">{caption ? 'Caption properties' : 'Clip properties'}</span>
        {caption ? <span className="cc-insp-title-name" title={caption.target.cue.text}>{caption.target.cue.text}</span>
          : item && <span className="cc-insp-title-name" title={item.name}>{count > 1 ? `${count} clips` : item.name}</span>}
      </span>
      {item?.denoisedSrc && <span className="cc-insp-pill">Voice Isolation</span>}
    </button>
  );
}

export function InspectorPanel(panel: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('basic');
  const playhead = useInspectorPlayhead(panel.getPlayhead, panel.playerRef);
  const item = panel.selectedItem;
  const schema = item ? panel.templates.find((template) => template.id === item.templateId)?.propSchema ?? [] : [];
  const rawLocalFrame = item ? Math.round(playhead) - item.startFrame : 0;
  const playheadLocal = {
    localFrame: item ? Math.max(0, Math.min(item.durationInFrames - 1, rawLocalFrame)) : 0,
    inRange: !!item && rawLocalFrame >= 0 && rawLocalFrame < item.durationInFrames,
  };
  return (
    <HistoryGestureProvider value={panel.historyGesture}>
      <section
        className={`cc-inspector${panel.collapsed ? ' collapsed' : ''}`}
        data-cc-shortcut-surface="inspector"
        tabIndex={-1}
        onPointerDownCapture={(event) => {
          if (!(event.target as HTMLElement).closest('button, input, select, textarea, [contenteditable="true"]')) {
            event.currentTarget.focus({ preventScroll: true });
          }
        }}
      >
        <InspectorHeader panel={panel} />
        {!panel.collapsed && (panel.selectedCaption && panel.onCaptionUpdate
          ? <CaptionInspectorControls selection={panel.selectedCaption} onUpdate={panel.onCaptionUpdate} />
          : item ? <InspectorContent panel={panel} item={item} schema={schema} playheadLocal={playheadLocal} activeTab={activeTab} onTabChange={setActiveTab} />
          : <div className="cc-insp-body"><div className="cc-insp-muted">Select a clip on the timeline to edit its properties.</div></div>)}
      </section>
    </HistoryGestureProvider>
  );
}
