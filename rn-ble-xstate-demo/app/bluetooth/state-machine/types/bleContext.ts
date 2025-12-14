import { Peripheral } from 'react-native-ble-manager';

/**
 * BLE machine context - holds all state data
 */
export interface BleContext {
  deviceId: string | null;
  deviceName: string | null;
  buttonState: boolean | null;
  ledState: boolean;
  error: string | null;
  discoveredDevices: Peripheral[];
}

