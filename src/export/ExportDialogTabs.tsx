import type { TimelineState } from '../editor/types';
import { trackAlias } from '../editor/types';
import {
  MAX_VIDEO_BITRATE_MBPS,
  MIN_VIDEO_BITRATE_MBPS,
} from './bitrate';
import { ExportBitrateControl } from './ExportBitrateControl';
import { ExportQaCard, InfoCard, Row, Segmented } from './ExportDialogParts';
import {
  EXPORT_FPS,
  EXPORT_RESOLUTION_OPTIONS,
  type ExportSubtitleSettings,
  type ExportVideoSettings,
} from './useExportDialogModel';
import type { ExportQaUiState, ExportTab } from './useExportWorkflow';
import { fcpxmlBackgroundFillCount } from './fcpxml';

const resolutionLabel = (value: string): string => value === '4k' ? '4K' : value;
const clampBitrate = (value: number): number => Math.max(
  MIN_VIDEO_BITRATE_MBPS,
  Math.min(MAX_VIDEO_BITRATE_MBPS, value),
);

interface VideoSettingsProps {
  video: ExportVideoSettings;
  busy: boolean;
  qualityMode: 'balanced' | 'master';
  setQualityMode: (mode: 'balanced' | 'master') => void;
}

function VideoSettings({ video, busy, qualityMode, setQualityMode }: VideoSettingsProps) {
  return (
    <>
      <Row label="Quality policy">
        <Segmented
          options={[
            { value: 'balanced', label: 'Balanced' },
            { value: 'master', label: 'Master quality' },
          ]}
          value={qualityMode}
          onChange={setQualityMode}
        />
      </Row>
      <p className="cc-export-footnote">
        {qualityMode === 'master'
          ? 'High-quality preview first; export defaults to high bitrate and never optimizes imports for size.'
          : 'Balance smoothness and size; preview may use lightweight copies and export uses automatic bitrate.'}
      </p>
      <Row label="Format / codec">
        <select
          className="cc-export-select"
          value={video.codec}
          onChange={(event) => video.setCodec(event.target.value as 'h264' | 'vp8' | 'prores')}
          disabled={busy}
        >
          <option value="h264">MP4 (H.264)</option>
          <option value="vp8">WebM (VP8)</option>
          <option value="prores">ProRes 422 HQ mezzanine (.mov)</option>
        </select>
      </Row>
      {video.codec === 'prores' && (
        <p className="cc-export-footnote">
          ProRes mezzanine files are large and server-rendered only. Use them for grading or Resolve handoff; use H.264 for web delivery.
        </p>
      )}
      <Row label="Resolution">
        <Segmented options={EXPORT_RESOLUTION_OPTIONS.map((value) => ({ value, label: resolutionLabel(value) }))} value={video.resolution} onChange={video.setResolution} />
      </Row>
      <Row label="Frame rate">
        <Segmented options={EXPORT_FPS.map((value) => ({ value, label: `${value} fps` }))} value={video.fps} onChange={video.setFps} />
      </Row>
      {video.codec !== 'prores' && (
        <Row label="Bitrate">
          <ExportBitrateControl
            mode={video.bitrateMode}
            customMbps={video.customBitrateMbps}
            resolvedBps={video.resolvedBitrate}
            disabled={busy}
            onModeChange={video.setBitrateMode}
            onCustomMbpsChange={(value) => video.setCustomBitrateMbps(clampBitrate(value))}
          />
        </Row>
      )}
    </>
  );
}

interface QaSettingsProps {
  enabled: boolean;
  busy: boolean;
  qa: ExportQaUiState | null;
  onToggle: (enabled: boolean) => void;
}

function QaSettings({ enabled, busy, qa, onToggle }: QaSettingsProps) {
  return (
    <>
      <label className="cc-export-toggle cc-export-qa-toggle">
        <span>
          <strong>Automatically quality-check after export</strong>
          <small>Checks video, audio, edit points, and caption safe areas; transient failures are retried up to three times.</small>
        </span>
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} disabled={busy} />
      </label>
      {qa && <ExportQaCard qa={qa} />}
    </>
  );
}

interface VideoTabProps extends VideoSettingsProps, QaSettingsProps {}

function VideoTab({ video, busy, qualityMode, setQualityMode, enabled, qa, onToggle }: VideoTabProps) {
  return (
    <>
      <VideoSettings video={video} busy={busy} qualityMode={qualityMode} setQualityMode={setQualityMode} />
      <QaSettings enabled={enabled} busy={busy} qa={qa} onToggle={onToggle} />
    </>
  );
}

function AudioTab() {
  return <InfoCard icon="music" title="MP3 audio mix" text="Extracts the complete timeline mix without writing video frames." />;
}

function MotionGraphicsTab({ count }: { count: number }) {
  return (
    <InfoCard
      icon="sparkles"
      title={count ? `${count} motion layers` : 'No motion layers to export'}
      text={count
        ? 'Creates an alpha ProRes 4444 MOV for each layer so it can be reused in other projects.'
        : 'Add motion graphics to the timeline before creating transparent assets.'}
    />
  );
}

function SubtitlesTab({ state, subtitles }: { state: TimelineState; subtitles: ExportSubtitleSettings }) {
  return (
    <>
      {!subtitles.tracks.length && (
        <InfoCard icon="captions" title="Caption track is off" text="Turn captions on and confirm the content before downloading the caption file." />
      )}
      <Row label="Caption track">
        <select className="cc-export-select" value={subtitles.trackId} disabled={!subtitles.tracks.length} onChange={(event) => subtitles.setTrackId(event.target.value)}>
          {!subtitles.tracks.length && <option value="">—</option>}
          {subtitles.tracks.map((entry) => <option key={entry.id} value={entry.id}>{trackAlias(state, entry.id)}</option>)}
        </select>
      </Row>
      <Row label="Format">
        <Segmented
          options={[{ value: 'srt', label: 'SubRip (.srt)' }, { value: 'txt', label: 'Plain text (.txt)' }] as const}
          value={subtitles.format}
          onChange={subtitles.setFormat}
        />
      </Row>
    </>
  );
}

interface XmlTabProps {
  state: TimelineState;
  nleFormat: 'fcp_xml' | 'fcp_xml_resolve';
  includeMg: boolean;
  mgCount: number;
  setNleFormat: (format: 'fcp_xml' | 'fcp_xml_resolve') => void;
  setIncludeMg: (include: boolean) => void;
}

function XmlTab({ state, nleFormat, includeMg, mgCount, setNleFormat, setIncludeMg }: XmlTabProps) {
  const backgroundFillCount = fcpxmlBackgroundFillCount(state);
  return (
    <>
      <InfoCard icon="clipboard" title="Editable project" text="Creates FCPXML with tracks and media references for continued work in Premiere Pro or DaVinci Resolve." />
      {backgroundFillCount > 0 && (
        <InfoCard
          icon="film"
          title="FCPXML preserves background parameters but does not generate the layer"
          text={`OpenChatCut writes the background-fill toggle and percentage for ${backgroundFillCount} clip(s) into FCPXML metadata, but the destination editor will not reconstruct the blurred layer from it. Export a video master as well for an exact visual match.`}
        />
      )}
      <Row label="Target app">
        <Segmented
          options={[{ value: 'fcp_xml', label: 'Premiere Pro' }, { value: 'fcp_xml_resolve', label: 'DaVinci Resolve' }] as const}
          value={nleFormat}
          onChange={setNleFormat}
        />
      </Row>
      <label className="cc-export-toggle">
        <span><strong>Bundle motion layers</strong><small>Also creates alpha ProRes 4444 MOV files.</small></span>
        <input type="checkbox" checked={includeMg} onChange={(event) => setIncludeMg(event.target.checked)} disabled={mgCount === 0} />
      </label>
      <p className="cc-export-footnote">After importing, point your NLE at the original media folder to relink offline clips.</p>
    </>
  );
}

export interface ExportTabContentProps extends VideoTabProps, XmlTabProps {
  tab: ExportTab;
  state: TimelineState;
  subtitles: ExportSubtitleSettings;
  mgCount: number;
}

export function ExportTabContent(props: ExportTabContentProps) {
  if (props.tab === 'video') return <VideoTab {...props} />;
  if (props.tab === 'audio') return <AudioTab />;
  if (props.tab === 'mg') return <MotionGraphicsTab count={props.mgCount} />;
  if (props.tab === 'subtitles') return <SubtitlesTab state={props.state} subtitles={props.subtitles} />;
  return <XmlTab {...props} />;
}
