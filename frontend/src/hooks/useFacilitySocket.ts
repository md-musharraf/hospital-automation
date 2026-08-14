import { useEffect } from 'react';
import { socket } from '../App';

/**
 * Registers this portal with the realtime layer.
 *
 * Every dashboard used to sit in one global `queue:global` room, so a lab result
 * in facility A woke every dashboard in facility B and no portal could tell one
 * kind of change from another. Registering with a role + facility puts the
 * socket in `hospital:<id>` and `role:<role>:<id>`, which is what lets the server
 * address events precisely (`lab-updated` to the lab, `stock-alert` to the
 * pharmacy and reception, `lab-result-ready` to one doctor).
 *
 * Re-registers automatically after a reconnect — rooms do not survive a dropped
 * socket, and a dashboard that silently stopped receiving updates is worse than
 * one that never worked.
 */
export default function useFacilitySocket(role: any, hospital: any, doctorId?: any) {
  useEffect(() => {
    if (!hospital) return undefined;

    const register = () => socket.emit('register', { role, hospital, doctorId });

    // Never assume the shared socket is alive. If it gave up earlier (the
    // backend was down when the tab was first opened, for instance) a portal
    // mounting now must revive it, or this dashboard renders forever-stale data
    // while looking perfectly healthy.
    if (!socket.connected) socket.connect();
    if (socket.connected) register();

    socket.on('connect', register);
    return () => {
      socket.off('connect', register);
    };
  }, [role, hospital, doctorId]);
}
