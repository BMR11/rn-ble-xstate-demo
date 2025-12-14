import BleManager from 'react-native-ble-manager';
import { fromPromise } from 'xstate';
import { LBS_SERVICE_UUID } from '../../constants';

/**
 * Scan actor - scans for LBS devices
 */
export const scanForDevices = fromPromise<void, void>(async () => {
  await BleManager.scan({
    serviceUUIDs: [LBS_SERVICE_UUID],
    seconds: 10,
    allowDuplicates: false,
  });
});

