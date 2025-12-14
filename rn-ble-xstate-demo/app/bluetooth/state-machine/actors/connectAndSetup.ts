import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';
import { fromPromise } from 'xstate';
import { BUTTON_CHARACTERISTIC_UUID, LBS_SERVICE_UUID, STORAGE_KEY } from '../../constants';
import { StoredDevice } from './initializeBle';

/**
 * Combined connect actor - stop scan, connect, save ID, discover services, setup notifications
 */
export const connectAndSetup = fromPromise<
  { buttonState: boolean },
  { deviceId: string; deviceName: string | null }
>(async ({ input }) => {
  // Stop any ongoing scan
  try {
    await BleManager.stopScan();
  } catch {
    // Ignore
  }

  // Connect
  await BleManager.connect(input.deviceId);

  // Save device as JSON (id and name)
  const storedDevice: StoredDevice = { id: input.deviceId, name: input.deviceName };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedDevice)).catch(() => {});

  // Discover services
  const peripheralInfo = await BleManager.retrieveServices(input.deviceId);

  // Check for LBS service
  const hasLBS = peripheralInfo.services?.some(
    (s) => s.uuid.toLowerCase() === LBS_SERVICE_UUID.toLowerCase()
  );

  if (!hasLBS) {
    throw new Error('LBS Service not found on device');
  }

  // Register for button notifications
  await BleManager.startNotification(input.deviceId, LBS_SERVICE_UUID, BUTTON_CHARACTERISTIC_UUID);

  // Read initial button state
  const buttonData = await BleManager.read(
    input.deviceId,
    LBS_SERVICE_UUID,
    BUTTON_CHARACTERISTIC_UUID
  );
  const buttonState = buttonData[0] !== 0;

  return { buttonState };
});

