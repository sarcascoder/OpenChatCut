import { Icon } from '../components/icons';
import { runAssetDestinationAction, type AssetDestinationActions } from './assetDestination';

interface AssetMenuDestinationsProps {
  assetName: string;
  onAddTimeline: () => void;
  onAddChat: () => void;
}

export function AssetMenuDestinations({
  assetName,
  onAddTimeline,
  onAddChat,
}: AssetMenuDestinationsProps) {
  const actions: AssetDestinationActions = {
    timeline: onAddTimeline,
    chat: onAddChat,
  };

  return (
    <div className="cc-asset-menu-destinations">
      <span>Add to:</span>
      <div className="cc-asset-menu-destination-buttons">
        <button
          type="button"
          className="cc-media-menu-item"
          role="menuitem"
          aria-label={`Add ${assetName} to AI chat`}
          onClick={() => runAssetDestinationAction('chat', actions)}
        >
          <span className="cc-media-menu-item-icon" aria-hidden="true"><Icon name="sparkles" size={15} /></span>
          <span className="cc-media-menu-item-label">AI chat</span>
        </button>
        <button
          type="button"
          className="cc-media-menu-item"
          role="menuitem"
          aria-label={`Add ${assetName} to timeline`}
          onClick={() => runAssetDestinationAction('timeline', actions)}
        >
          <span className="cc-media-menu-item-icon" aria-hidden="true"><Icon name="film" size={15} /></span>
          <span className="cc-media-menu-item-label">Timeline</span>
        </button>
      </div>
    </div>
  );
}
