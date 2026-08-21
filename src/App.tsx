
import {
  useAgentBackendSync,
  useAppRoute,
  useLocalAsrWarmup,
  useProjects,
} from './app/appShell';
import { AppSplash, DashboardRoute, EditorRoute } from './app/AppViews';
import { useUiScaleShortcuts } from './hooks/useUiScaleShortcuts';

export default function App() {
  const route = useAppRoute();
  useAgentBackendSync();
  useLocalAsrWarmup(route.name);
  useUiScaleShortcuts();
  const { projects, refresh } = useProjects();

  if (!projects) return <AppSplash text="Loading…" />;
  if (route.name === 'editor') {
    return <EditorRoute route={route} projects={projects} refresh={refresh} />;
  }
  return <DashboardRoute projects={projects} refresh={refresh} />;
}
