import BleManager from 'react-native-ble-manager';
import { fromPromise } from 'xstate';
import { LED_CHARACTERISTIC_UUID, LBS_SERVICE_UUID } from '../../constants';

/**
 * Write LED actor - writes LED state to device
 */
export const writeLedState = fromPromise<void, { deviceId: string; ledState: boolean }>(
  async ({ input }) => {
    await BleManager.write(input.deviceId, LBS_SERVICE_UUID, LED_CHARACTERISTIC_UUID, [
      input.ledState ? 1 : 0,
    ]);
  }
);

