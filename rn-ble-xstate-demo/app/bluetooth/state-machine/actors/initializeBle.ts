import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { fromPromise } from 'xstate';
import { STORAGE_KEY } from '../../constants';

export interface StoredDevice {
  id: string;
  name: string | null;
}

/**
 * Combined init actor - permissions, BLE start, load stored device
 */
export const initializeBle = fromPromise<{ storedDevice: StoredDevice | null }, void>(async () => {
  // Request permissions on Android 12+
  if (Platform.OS === 'android' && Platform.Version >= 31) {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    const hasPermissions =
      granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
      granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED;

    if (!hasPermissions) {
      throw new Error('Bluetooth permissions denied');
    }
  }

  // Start BLE Manager
  await BleManager.start();

  // Check Bluetooth state
  let state = await BleManager.checkState();

  if (state === 'off') {
    if (Platform.OS === 'android') {
      await BleManager.enableBluetooth();
      state = await BleManager.checkState();
    }
  }

  if (state !== 'on') {
    throw new Error(`Bluetooth is ${state}`);
  }

  // Load stored device (JSON with id and name)
  const storedDeviceJson = await AsyncStorage.getItem(STORAGE_KEY);
  let storedDevice: StoredDevice | null = null;

  if (storedDeviceJson) {
    try {
      storedDevice = JSON.parse(storedDeviceJson);
    } catch {
      // If parsing fails, treat as legacy format (just the ID)
      storedDevice = { id: storedDeviceJson, name: null };
    }
  }

  return { storedDevice };
});

