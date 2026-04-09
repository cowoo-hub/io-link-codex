import {
  createContext,
  useContext,
} from 'react'

import type { MonitoringWorkspace } from '../hooks/useMonitoringWorkspace'

export const MonitoringWorkspaceContext = createContext<MonitoringWorkspace | null>(null)

export function useMonitoringWorkspaceContext() {
  const workspace = useContext(MonitoringWorkspaceContext)

  if (!workspace) {
    throw new Error(
      'useMonitoringWorkspaceContext must be used within MonitoringWorkspaceProvider',
    )
  }

  return workspace
}
