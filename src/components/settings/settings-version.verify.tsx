import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

const moduleUrl = new URL('./SettingsVersionControl.tsx', import.meta.url);
const versionModule = await import(moduleUrl.href).catch(() => null);

assert.ok(versionModule, 'the settings title bar should provide a standalone version and check-for-updates control');

const { SettingsVersionControl } = versionModule;
let requested = false;
const markup = renderToStaticMarkup(
  <SettingsVersionControl
    versionLabel="Current version: V0.1.9"
    actionLabel='Download update'
    disabled={false}
    onAction={() => { requested = true; }}
  />,
);

assert.match(markup, /Current version: V0\.1\.9/, 'the settings title bar must show the version from package.json');
assert.match(markup, />Download update<\/button>/, 'the desktop build must offer a direct download entry once a new version is found');
assert.doesNotMatch(markup, /auto update/i, 'the download must keep user confirmation and must not become a silent auto-update');

const element = SettingsVersionControl({
  versionLabel: 'Current version: V0.1.9',
  actionLabel: 'Download update',
  disabled: false,
  onAction: () => { requested = true; },
});
const button = element.props.children[1];
button.props.onClick();
assert.equal(requested, true, 'clicking download update must trigger the controlled update action');

console.log('settings-version.verify: current version and manual check control OK');
