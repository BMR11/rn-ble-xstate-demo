import BleManager from 'react-native-ble-manager';
import { fromPromise } from 'xstate';
import { BUTTON_CHARACTERISTIC_UUID, LBS_SERVICE_UUID } from '../../constants';

/**
 * Read button actor - reads button state from device
 */
export const readButtonState = fromPromise<boolean, { deviceId: string }>(async ({ input }) => {
  const data = await BleManager.read(input.deviceId, LBS_SERVICE_UUID, BUTTON_CHARACTERISTIC_UUID);
  return data[0] !== 0;
});

