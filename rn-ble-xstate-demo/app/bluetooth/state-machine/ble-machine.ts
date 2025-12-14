import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';
import { assign, fromPromise, setup } from 'xstate';

// LBS (LED Button Service) GATT UUIDs
const LBS_SERVICE_UUID = '00001523-1212-EFDE-1523-785FEABCD123';
const BUTTON_CHARACTERISTIC_UUID = '00001524-1212-EFDE-1523-785FEABCD123';
const LED_CHARACTERISTIC_UUID = '00001525-1212-EFDE-1523-785FEABCD123';

const STORAGE_KEY = 'ble_device_id';

// Types
export interface BleContext {
  deviceId: string | null;
  deviceName: string | null;
  buttonState: boolean | null;
  ledState: boolean;
  error: string | null;
  discoveredDevices: Peripheral[];
}

export type BleEvent =
  | { type: 'START' }
  | { type: 'SCAN' }
  | { type: 'STOP_SCAN' }
  | { type: 'SELECT_DEVICE'; deviceId: string; deviceName?: string }
  | { type: 'DISCONNECT' }
  | { type: 'RETRY' }
  | { type: 'DEVICE_DISCOVERED'; peripheral: Peripheral }
  | { type: 'BUTTON_STATE_CHANGED'; value: boolean }
  | { type: 'TOGGLE_LED' }
  | { type: 'READ_BUTTON' }
  | { type: 'CLEAR_STORED_DEVICE' };

// Actors (fromPromise)
const checkBleAndPermissions = fromPromise<{ hasPermissions: boolean; bleState: string }, void>(
  async () => {
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
      // Try to enable Bluetooth (Android only)
      if (Platform.OS === 'android') {
        await BleManager.enableBluetooth();
        state = await BleManager.checkState();
      }
    }

    if (state !== 'on') {
      throw new Error(`Bluetooth is ${state}`);
    }

    return { hasPermissions: true, bleState: state };
  }
);

const loadStoredDeviceId = fromPromise<string | null, void>(async () => {
  const deviceId = await AsyncStorage.getItem(STORAGE_KEY);
  return deviceId;
});

const saveDeviceId = fromPromise<void, { deviceId: string }>(async ({ input }) => {
  await AsyncStorage.setItem(STORAGE_KEY, input.deviceId);
});

const clearStoredDeviceId = fromPromise<void, void>(async () => {
  await AsyncStorage.removeItem(STORAGE_KEY);
});

const scanForDevices = fromPromise<void, void>(async () => {
  await BleManager.scan({
    serviceUUIDs: [LBS_SERVICE_UUID],
    seconds: 10,
    allowDuplicates: false,
  });
});

const stopScanning = fromPromise<void, void>(async () => {
  await BleManager.stopScan();
});

const connectToDevice = fromPromise<void, { deviceId: string }>(async ({ input }) => {
  await BleManager.connect(input.deviceId);
});

const disconnectFromDevice = fromPromise<void, { deviceId: string }>(async ({ input }) => {
  try {
    await BleManager.disconnect(input.deviceId);
  } catch {
    // Ignore disconnect errors
  }
});

const discoverServicesAndSetup = fromPromise<{ buttonState: boolean }, { deviceId: string }>(
  async ({ input }) => {
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
  }
);

const writeLedState = fromPromise<void, { deviceId: string; ledState: boolean }>(
  async ({ input }) => {
    await BleManager.write(input.deviceId, LBS_SERVICE_UUID, LED_CHARACTERISTIC_UUID, [
      input.ledState ? 1 : 0,
    ]);
  }
);

const readButtonState = fromPromise<boolean, { deviceId: string }>(async ({ input }) => {
  const data = await BleManager.read(input.deviceId, LBS_SERVICE_UUID, BUTTON_CHARACTERISTIC_UUID);
  return data[0] !== 0;
});

// State Machine
export const bleMachine = setup({
  types: {
    context: {} as BleContext,
    events: {} as BleEvent,
  },
  actors: {
    checkBleAndPermissions,
    loadStoredDeviceId,
    saveDeviceId,
    clearStoredDeviceId,
    scanForDevices,
    stopScanning,
    connectToDevice,
    disconnectFromDevice,
    discoverServicesAndSetup,
    writeLedState,
    readButtonState,
  },
  actions: {
    clearError: assign({ error: null }),
    setError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
    setDeviceId: assign({
      deviceId: (_, params: { deviceId: string; deviceName?: string }) => params.deviceId,
      deviceName: (_, params: { deviceId: string; deviceName?: string }) => params.deviceName || null,
    }),
    clearDeviceId: assign({
      deviceId: null,
      deviceName: null,
    }),
    setButtonState: assign({
      buttonState: (_, params: { value: boolean }) => params.value,
    }),
    toggleLedState: assign({
      ledState: ({ context }) => !context.ledState,
    }),
    setLedState: assign({
      ledState: (_, params: { value: boolean }) => params.value,
    }),
    addDiscoveredDevice: assign({
      discoveredDevices: ({ context }, params: { peripheral: Peripheral }) => {
        const exists = context.discoveredDevices.find((d) => d.id === params.peripheral.id);
        if (exists) {
          return context.discoveredDevices.map((d) =>
            d.id === params.peripheral.id ? params.peripheral : d
          );
        }
        return [...context.discoveredDevices, params.peripheral];
      },
    }),
    clearDiscoveredDevices: assign({
      discoveredDevices: [],
    }),
    resetForRetry: assign({
      error: null,
      buttonState: null,
    }),
  },
  guards: {
    hasStoredDeviceId: ({ context }) => context.deviceId !== null,
  },
}).createMachine({
  id: 'bleMachine',
  initial: 'idle',
  context: {
    deviceId: null,
    deviceName: null,
    buttonState: null,
    ledState: false,
    error: null,
    discoveredDevices: [],
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'init',
          actions: ['clearError'],
        },
      },
    },

    init: {
      initial: 'checkingBle',
      states: {
        checkingBle: {
          invoke: {
            src: 'checkBleAndPermissions',
            onDone: {
              target: 'loadingStoredDevice',
            },
            onError: {
              target: '#bleMachine.idle',
              actions: [
                {
                  type: 'setError',
                  params: ({ event }) => ({
                    message: (event.error as Error)?.message || 'BLE initialization failed',
                  }),
                },
              ],
            },
          },
        },
        loadingStoredDevice: {
          invoke: {
            src: 'loadStoredDeviceId',
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: '#bleMachine.connecting',
                actions: [
                  {
                    type: 'setDeviceId',
                    params: ({ event }) => ({ deviceId: event.output as string }),
                  },
                ],
              },
              {
                target: '#bleMachine.scanning',
              },
            ],
            onError: {
              target: '#bleMachine.scanning',
            },
          },
        },
      },
    },

    scanning: {
      entry: ['clearDiscoveredDevices'],
      invoke: {
        src: 'scanForDevices',
        onError: {
          target: 'idle',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: (event.error as Error)?.message || 'Scan failed',
              }),
            },
          ],
        },
      },
      on: {
        DEVICE_DISCOVERED: {
          actions: [
            {
              type: 'addDiscoveredDevice',
              params: ({ event }) => ({ peripheral: event.peripheral }),
            },
          ],
        },
        SELECT_DEVICE: {
          target: 'connecting',
          actions: [
            {
              type: 'setDeviceId',
              params: ({ event }) => ({
                deviceId: event.deviceId,
                deviceName: event.deviceName,
              }),
            },
          ],
        },
        STOP_SCAN: {
          actions: [],
        },
        SCAN: {
          target: 'scanning',
          reenter: true,
        },
      },
    },

    connecting: {
      initial: 'stoppingPreviousScan',
      states: {
        stoppingPreviousScan: {
          invoke: {
            src: 'stopScanning',
            onDone: 'connectingToDevice',
            onError: 'connectingToDevice',
          },
        },
        connectingToDevice: {
          invoke: {
            src: 'connectToDevice',
            input: ({ context }) => ({ deviceId: context.deviceId! }),
            onDone: 'savingDeviceId',
            onError: {
              target: '#bleMachine.idle',
              actions: [
                'clearDeviceId',
                {
                  type: 'setError',
                  params: ({ event }) => ({
                    message: (event.error as Error)?.message || 'Connection failed',
                  }),
                },
              ],
            },
          },
        },
        savingDeviceId: {
          invoke: {
            src: 'saveDeviceId',
            input: ({ context }) => ({ deviceId: context.deviceId! }),
            onDone: '#bleMachine.connected',
            onError: '#bleMachine.connected', // Continue even if save fails
          },
        },
      },
    },

    connected: {
      initial: 'discoveringServices',
      states: {
        discoveringServices: {
          invoke: {
            src: 'discoverServicesAndSetup',
            input: ({ context }) => ({ deviceId: context.deviceId! }),
            onDone: {
              target: 'ready',
              actions: [
                {
                  type: 'setButtonState',
                  params: ({ event }) => ({ value: event.output.buttonState }),
                },
              ],
            },
            onError: {
              target: '#bleMachine.disconnecting',
              actions: [
                {
                  type: 'setError',
                  params: ({ event }) => ({
                    message: (event.error as Error)?.message || 'Service discovery failed',
                  }),
                },
              ],
            },
          },
        },
        ready: {
          on: {
            BUTTON_STATE_CHANGED: {
              actions: [
                {
                  type: 'setButtonState',
                  params: ({ event }) => ({ value: event.value }),
                },
              ],
            },
            TOGGLE_LED: {
              target: 'togglingLed',
            },
            READ_BUTTON: {
              target: 'readingButton',
            },
            DISCONNECT: {
              target: '#bleMachine.disconnecting',
            },
          },
        },
        togglingLed: {
          entry: ['toggleLedState'],
          invoke: {
            src: 'writeLedState',
            input: ({ context }) => ({
              deviceId: context.deviceId!,
              ledState: context.ledState,
            }),
            onDone: 'ready',
            onError: {
              target: 'ready',
              actions: [
                'toggleLedState', // Revert on error
                {
                  type: 'setError',
                  params: ({ event }) => ({
                    message: (event.error as Error)?.message || 'LED toggle failed',
                  }),
                },
              ],
            },
          },
        },
        readingButton: {
          invoke: {
            src: 'readButtonState',
            input: ({ context }) => ({ deviceId: context.deviceId! }),
            onDone: {
              target: 'ready',
              actions: [
                {
                  type: 'setButtonState',
                  params: ({ event }) => ({ value: event.output }),
                },
              ],
            },
            onError: {
              target: 'ready',
              actions: [
                {
                  type: 'setError',
                  params: ({ event }) => ({
                    message: (event.error as Error)?.message || 'Read button failed',
                  }),
                },
              ],
            },
          },
        },
      },
      on: {
        DISCONNECT: {
          target: 'disconnecting',
        },
      },
    },

    disconnecting: {
      invoke: {
        src: 'disconnectFromDevice',
        input: ({ context }) => ({ deviceId: context.deviceId! }),
        onDone: {
          target: 'idle',
          actions: ['clearDeviceId', 'resetForRetry'],
        },
        onError: {
          target: 'idle',
          actions: ['clearDeviceId', 'resetForRetry'],
        },
      },
    },
  },
  on: {
    CLEAR_STORED_DEVICE: {
      actions: [
        'clearDeviceId',
        () => {
          AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        },
      ],
    },
  },
});

// Selectors for React UI
export const selectDeviceId = (state: { context: BleContext }) => state.context.deviceId;
export const selectDeviceName = (state: { context: BleContext }) => state.context.deviceName;
export const selectButtonState = (state: { context: BleContext }) => state.context.buttonState;
export const selectLedState = (state: { context: BleContext }) => state.context.ledState;
export const selectError = (state: { context: BleContext }) => state.context.error;
export const selectDiscoveredDevices = (state: { context: BleContext }) =>
  state.context.discoveredDevices;

export const selectIsIdle = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value === 'idle';
  return false;
};

export const selectIsInit = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value === 'init';
  if (typeof state.value === 'object' && state.value !== null) return 'init' in state.value;
  return false;
};

export const selectIsScanning = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value === 'scanning';
  return false;
};

export const selectIsConnecting = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value === 'connecting';
  if (typeof state.value === 'object' && state.value !== null) return 'connecting' in state.value;
  return false;
};

export const selectIsConnected = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value === 'connected';
  if (typeof state.value === 'object' && state.value !== null) return 'connected' in state.value;
  return false;
};

export const selectIsDisconnecting = (state: { value: unknown }) => {
  if (typeof state.value === 'string') return state.value === 'disconnecting';
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

