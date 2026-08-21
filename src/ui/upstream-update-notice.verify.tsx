import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopWindowControlButtons } from '../components/DesktopWindowControls';

const moduleUrl = new URL('./UpstreamUpdateNoticeView.tsx', import.meta.url);
const noticeModule = await import(moduleUrl.href).catch(() => null);

assert.ok(noticeModule, 'the app should offer a non-blocking upstream version notice');

const { UpstreamUpdateNoticeView } = noticeModule;
const markup = renderToStaticMarkup(
  <div data-dashboard-chrome>
    <UpstreamUpdateNoticeView
      message="OpenChatCut V0.2.0 is available; current version: V0.1.9. Download and install it directly."
      actionLabel='Download update'
      closeLabel='Close'
      onAction={() => undefined}
      onDismiss={() => undefined}
    />
    <DesktopWindowControlButtons
      onAction={() => undefined}
    />
  </div>,
);

assert.match(markup, /OpenChatCut V0\.2\.0 is available/, 'the update notice must name the official product and version');
assert.match(markup, />Download update<\/button>/, 'the desktop update notice must offer a direct download action');
assert.match(markup, /role="status"/, 'a non-blocking notice should use status semantics');
assert.doesNotMatch(markup, /<a\b/, 'the update entry point must go through controlled desktop IPC, not an arbitrary link');
assert.match(markup, /top:50%/, 'the update notice should be vertically centered on the dashboard');
assert.match(markup, /left:50%/, 'the update notice should be horizontally centered on the dashboard');
assert.match(markup, /z-index:190/, 'the update notice must sit below the settings dialog so it never covers settings actions');
assert.match(markup, /transform:translate\(-50%,\s*-50%\)/, 'the update notice should align its own center with the window center');
assert.match(markup, /aria-label="Window controls"/, 'the desktop window controls must render in the same dashboard chrome as the update notice');
assert.equal((markup.match(/class="cc-window-control /g) ?? []).length, 3, 'the macOS title bar should keep three window control buttons');


console.log('upstream-update-notice.verify: dashboard-only centered upstream update notice OK');
