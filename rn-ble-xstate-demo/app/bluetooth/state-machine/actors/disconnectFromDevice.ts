import BleManager from 'react-native-ble-manager';
import { fromPromise } from 'xstate';

/**
 * Disconnect actor - disconnects from device
 */
export const disconnectFromDevice = fromPromise<void, { deviceId: string }>(async ({ input }) => {
  try {
    await BleManager.disconnect(input.deviceId);
  } catch {
    // Ignore disconnect errors
  }
});

