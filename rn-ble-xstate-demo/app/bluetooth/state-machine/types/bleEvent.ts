import { Peripheral } from 'react-native-ble-manager';

/**
 * BLE machine events - all possible events the machine can receive
 */
export type BleEvent =
  | { type: 'START' }
  | { type: 'SCAN' }
  | { type: 'SELECT_DEVICE'; deviceId: string; deviceName?: string }
  | { type: 'DISCONNECT' }
  | { type: 'CONNECTION_LOST'; reason?: string }
  | { type: 'DEVICE_DISCOVERED'; peripheral: Peripheral }
  | { type: 'BUTTON_STATE_CHANGED'; value: boolean }
  | { type: 'TOGGLE_LED' }
  | { type: 'READ_BUTTON' }
  | { type: 'CLEAR_STORED_DEVICE' };

