import { BleContext } from "./ble-machine";

// Selectors for React UI
export const selectDeviceId = (state: { context: BleContext }) => state.context.deviceId;
export const selectDeviceName = (state: { context: BleContext }) => state.context.deviceName;
export const selectButtonState = (state: { context: BleContext }) => state.context.buttonState;
export const selectLedState = (state: { context: BleContext }) => state.context.ledState;
export const selectError = (state: { context: BleContext }) => state.context.error;
export const selectDiscoveredDevices = (state: { context: BleContext }) =>
  state.context.discoveredDevices;

export const selectIsIdle = (state: { value: unknown }) => {
  return state.value === 'idle';
};

export const selectIsInit = (state: { value: unknown }) => {
  return state.value === 'init';
};

export const selectIsWaitingForBluetooth = (state: { value: unknown }) => {
  return state.value === 'waitingForBluetooth';
};

export const selectIsScanning = (state: { value: unknown }) => {
  return state.value === 'scanning';
};

export const selectIsConnecting = (state: { value: unknown }) => {
  return state.value === 'connecting';
};

export const selectIsConnected = (state: { value: unknown }) => {
  if (state.value === 'connected') return true;
  if (typeof state.value === 'object' && state.value !== null) {
    return 'connected' in state.value;
  }
  return false;
};

export const selectIsDisconnecting = (state: { value: unknown }) => {
  if (typeof state.value === 'object' && state.value !== null) {
    const connected = (state.value as Record<string, unknown>).connected;
    return connected === 'disconnecting';
  }
  return false;
};

export const selectCurrentState = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value;
  if (typeof state.value === 'object' && state.value !== null) {
    const keys = Object.keys(state.value);
    return keys[0] || 'unknown';
  }
  return 'unknown';
};