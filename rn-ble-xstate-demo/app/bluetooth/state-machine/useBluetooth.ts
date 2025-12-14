import { useSelector } from '@xstate/react';
import { createActor } from 'xstate';
import {
  bleMachine,

} from './ble-machine';
import { selectButtonState, selectCurrentState, selectDeviceId, selectDeviceName, selectDiscoveredDevices, selectError, selectIsConnected, selectIsConnecting, selectIsIdle, selectIsScanning, selectLedState } from './selectors';

// Create a singleton actor for the BLE state machine
const bleActor = createActor(bleMachine);
bleActor.start();

export function useBluetooth() {
  const send = bleActor.send;

  // BLE event listeners are now handled internally by the state machine
  // using fromCallback actors (scanListener, connectedListener)

  return {
    // Actions
    start: () => send({ type: 'START' }),
    scan: () => send({ type: 'SCAN' }),
    selectDevice: (deviceId: string, deviceName?: string) =>
      send({ type: 'SELECT_DEVICE', deviceId, deviceName }),
    disconnect: () => send({ type: 'DISCONNECT' }),
    toggleLed: () => send({ type: 'TOGGLE_LED' }),
    readButton: () => send({ type: 'READ_BUTTON' }),
    clearStoredDevice: () => send({ type: 'CLEAR_STORED_DEVICE' }),

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
