import BleManager from 'react-native-ble-manager';
import { fromCallback } from 'xstate';
import { BUTTON_CHARACTERISTIC_UUID } from '../../constants';
import { BleEvent } from '../ble-machine';

/**
 * Callback actor for connected state - listens for button notifications and disconnections
 */
export const connectedListener = fromCallback<BleEvent>(({ sendBack }) => {
  const updateValueListener = BleManager.onDidUpdateValueForCharacteristic(
    (args: { characteristic: string; value: number[]; peripheral: string; service: string }) => {
      if (args.characteristic.toLowerCase() === BUTTON_CHARACTERISTIC_UUID.toLowerCase()) {
        const buttonPressed = args.value[0] !== 0;
        sendBack({ type: 'BUTTON_STATE_CHANGED', value: buttonPressed });
      }
    }
  );

  const disconnectListener = BleManager.onDisconnectPeripheral((data) => {
    sendBack({ 
      type: 'CONNECTION_LOST', 
      reason: data?.peripheral ? 'Device disconnected unexpectedly' : 'Connection lost' 
    });
  });

  return () => {
    updateValueListener.remove();
    disconnectListener.remove();
  };
});

