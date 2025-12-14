import { useEffect } from 'react';
import { Peripheral } from 'react-native-ble-manager';
import BleManager from 'react-native-ble-manager';
import { useSelector } from '@xstate/react';
import { createActor } from 'xstate';
import {
  bleMachine,
  selectButtonState,
  selectCurrentState,
  selectDeviceId,
  selectDeviceName,
  selectDiscoveredDevices,
  selectError,
  selectIsConnected,
  selectIsConnecting,
  selectIsIdle,
  selectIsScanning,
  selectLedState,
} from './ble-machine';

// Create a singleton actor for the BLE state machine
const bleActor = createActor(bleMachine);
bleActor.start();

export function useBleMachine() {
  const state = bleActor.getSnapshot();
  const send = bleActor.send;

  // Set up BLE event listeners to send events to the state machine
  useEffect(() => {
    const discoverListener = BleManager.onDiscoverPeripheral((peripheral: Peripheral) => {
      send({ type: 'DEVICE_DISCOVERED', peripheral });
    });

    const updateValueListener = BleManager.onDidUpdateValueForCharacteristic(
      (args: { characteristic: string; value: number[]; peripheral: string; service: string }) => {
        const buttonCharUuid = '00001524-1212-EFDE-1523-785FEABCD123';
        if (args.characteristic.toLowerCase() === buttonCharUuid.toLowerCase()) {
          const buttonPressed = args.value[0] !== 0;
          send({ type: 'BUTTON_STATE_CHANGED', value: buttonPressed });
        }
      }
    );

    const disconnectListener = BleManager.onDisconnectPeripheral(() => {
      // If we get an unexpected disconnection, trigger disconnect handling
      if (selectIsConnected(bleActor.getSnapshot())) {
        send({ type: 'DISCONNECT' });
      }
    });

    return () => {
      discoverListener.remove();
      updateValueListener.remove();
      disconnectListener.remove();
    };
  }, [send]);

  return {
    state,
    send,

    // Actions
    start: () => send({ type: 'START' }),
    scan: () => send({ type: 'SCAN' }),
    stopScan: () => send({ type: 'STOP_SCAN' }),
    selectDevice: (deviceId: string, deviceName?: string) =>
      send({ type: 'SELECT_DEVICE', deviceId, deviceName }),
    disconnect: () => send({ type: 'DISCONNECT' }),
    toggleLed: () => send({ type: 'TOGGLE_LED' }),
    readButton: () => send({ type: 'READ_BUTTON' }),
    clearStoredDevice: () => send({ type: 'CLEAR_STORED_DEVICE' }),
    retry: () => send({ type: 'RETRY' }),

    // Selectors
    deviceId: useSelector(bleActor, selectDeviceId),
    deviceName: useSelector(bleActor, selectDeviceName),
    buttonState: useSelector(bleActor, selectButtonState),
    ledState: useSelector(bleActor, selectLedState),
    error: useSelector(bleActor, selectError),
    discoveredDevices: useSelector(bleActor, selectDiscoveredDevices),
    isIdle: useSelector(bleActor, selectIsIdle),
    isScanning: useSelector(bleActor, selectIsScanning),
    isConnecting: useSelector(bleActor, selectIsConnecting),
    isConnected: useSelector(bleActor, selectIsConnected),
    currentState: useSelector(bleActor, selectCurrentState),
  };
}

// Export the singleton actor for direct access if needed
export { bleActor };

