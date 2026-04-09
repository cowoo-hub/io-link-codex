import type { PropsWithChildren } from 'react'

import { useMonitoringWorkspace } from '../hooks/useMonitoringWorkspace'
import { MonitoringWorkspaceContext } from './MonitoringWorkspaceContext'

export function MonitoringWorkspaceProvider({ children }: PropsWithChildren) {
  const workspace = useMonitoringWorkspace()

  return (
    <MonitoringWorkspaceContext.Provider value={workspace}>
      {children}
    </MonitoringWorkspaceContext.Provider>
  )
}
