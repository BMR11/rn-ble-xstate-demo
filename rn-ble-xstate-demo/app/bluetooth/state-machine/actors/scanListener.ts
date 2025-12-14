import BleManager, { Peripheral } from 'react-native-ble-manager';
import { fromCallback } from 'xstate';
import { BleEvent } from '../ble-machine';

/**
 * Callback actor for scanning - listens for discovered peripherals
 */
export const scanListener = fromCallback<BleEvent>(({ sendBack }) => {
  const listener = BleManager.onDiscoverPeripheral((peripheral: Peripheral) => {
    sendBack({ type: 'DEVICE_DISCOVERED', peripheral });
  });

  return () => {
    listener.remove();
  };
});

