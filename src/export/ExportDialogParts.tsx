import type { ReactNode } from 'react';
import { Icon, type IconName } from '../components/icons';
import type { ExportQaIssue } from './quality';
import type { ExportQaUiState } from './useExportWorkflow';

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cc-export-field">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function InfoCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="cc-export-info">
      <span><Icon name={icon} size={19} /></span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

const QA_ISSUE_LABELS: Record<string, string> = {
  missing_video: 'The export is missing a video stream',
  duration_mismatch: 'The export duration does not match the timeline',
  resolution_mismatch: 'The export resolution does not match the settings',
  fps_mismatch: 'The export frame rate does not match the settings',
  missing_audio: 'The export is missing the expected audio stream',
  black_frames: 'Unexpected black frames detected',
  frozen_frames: 'A long frozen span was detected',
  long_silence: 'A long silent span was detected',
  audio_peak: 'Audio peaks are close to clipping',
  caption_safe_area_horizontal: 'Captions cross the horizontal safe area',
  caption_safe_area_vertical: 'Captions cross the vertical safe area',
};

function qaIssueLabel(issue: ExportQaIssue): string {
  const label = QA_ISSUE_LABELS[issue.code] ?? issue.message;
  if (issue.startSeconds === undefined) return label;
  const end = issue.endSeconds ?? issue.startSeconds;
  return `${label} · ${issue.startSeconds.toFixed(2)}–${end.toFixed(2)}s`;
}

export function ExportQaCard({ qa }: { qa: ExportQaUiState }) {
  if (qa.status === 'running') {
    return <div className="cc-export-qa-card running"><strong>Automatically checking the exported video…</strong></div>;
  }
  if (qa.status === 'error') {
    return (
      <div className="cc-export-qa-card error">
        <strong>Automatic quality check did not finish</strong>
        <p>The video will still download normally; export it again later to recheck it. {qa.message}</p>
      </div>
    );
  }
  const report = qa.report!;
  return (
    <div className={`cc-export-qa-card ${qa.status}`}>
      <div className="cc-export-qa-summary">
        <strong>{qa.status === 'passed' ? 'Automatic quality check passed' : 'Automatic quality check found issues'}</strong>
        <span>{`${report.summary.errors} errors · ${report.summary.warnings} warnings`}</span>
      </div>
      {qa.attempts > 1 && <p>{`Check completed on attempt ${qa.attempts}`}</p>}
      {report.issues.length > 0 && (
        <ul>
          {report.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.startSeconds ?? index}`} className={issue.severity}>
              {qaIssueLabel(issue)}
            </li>
          ))}
        </ul>
      )}
      {qa.evidenceUrl && (
        <details>
          <summary>View before/after edit-point evidence</summary>
          <img src={qa.evidenceUrl} alt="Before/after edit-point frame comparison" />
        </details>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="cc-export-segmented">
      {options.map((option) => (
        <button
          type="button"
          key={String(option.value)}
          className={`cc-export-seg${option.value === value ? ' active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
