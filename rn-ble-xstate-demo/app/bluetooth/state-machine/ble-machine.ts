import AsyncStorage from '@react-native-async-storage/async-storage';
import { Peripheral } from 'react-native-ble-manager';
import { assign, setup } from 'xstate';
import { STORAGE_KEY } from '../constants';
import {
  connectAndSetup,
  connectedListener,
  disconnectFromDevice,
  initializeBle,
  readButtonState,
  scanForDevices,
  scanListener,
  writeLedState,
} from './actors';
import { BleContext, BleEvent } from './types';

export type { BleContext, BleEvent };



// State Machine - Only 4 states: init, scanning, connecting, connected
export const bleMachine = setup({
  types: {
    context: {} as BleContext,
    events: {} as BleEvent,
  },
  actors: {
    initializeBle,
    scanForDevices,
    scanListener,
    connectAndSetup,
    connectedListener,
    writeLedState,
    readButtonState,
    disconnectFromDevice,
  },
  actions: {
    setError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
    clearError: assign({ error: null }),
    setDevice: assign({
      deviceId: (_, params: { deviceId: string; deviceName?: string }) => params.deviceId,
      deviceName: (_, params: { deviceId: string; deviceName?: string }) => params.deviceName || null,
    }),
    clearDevice: assign({
      deviceId: null,
      deviceName: null,
      buttonState: null,
    }),
    setButtonState: assign({
      buttonState: (_, params: { value: boolean }) => params.value,
    }),
    toggleLedState: assign({
      ledState: ({ context }) => !context.ledState,
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
  on: {
    CLEAR_STORED_DEVICE: {
      actions: [
        'clearDevice',
        () => {
          AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        },
      ],
    },
  },
  states: {
    // Idle - waiting for START
    idle: {
      on: {
        START: {
          target: 'init',
          actions: ['clearError'],
        },
      },
    },

    // Init - check permissions, start BLE, load stored device
    init: {
      invoke: {
        src: 'initializeBle',
        onDone: [
          {
            guard: ({ event }) => event.output.storedDevice !== null,
            target: 'connecting',
            actions: [
              {
                type: 'setDevice',
                params: ({ event }) => ({
                  deviceId: event.output.storedDevice!.id,
                  deviceName: event.output.storedDevice!.name ?? undefined,
                }),
              },
            ],
          },
          {
            target: 'scanning',
          },
        ],
        onError: {
          target: 'init',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: (event.error as Error)?.message || 'Initialization failed',
              }),
            },
          ],
        },
      },
      on: {
        START: {
          target: 'init',
          reenter: true,
          actions: ['clearError'],
        },
      },
    },

    // Scanning - scan for LBS devices
    scanning: {
      entry: ['clearDiscoveredDevices'],
      invoke: [
        {
          src: 'scanForDevices',
          onError: {
            target: 'init',
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
        {
          src: 'scanListener',
        },
      ],
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
              type: 'setDevice',
              params: ({ event }) => ({
                deviceId: event.deviceId,
                deviceName: event.deviceName,
              }),
            },
          ],
        },
        SCAN: {
          target: 'scanning',
          reenter: true,
        },
      },
    },

    // Connecting - connect, save, discover services, setup notifications
    connecting: {
      invoke: {
        src: 'connectAndSetup',
        input: ({ context }) => ({ deviceId: context.deviceId!, deviceName: context.deviceName }),
        onDone: {
          target: 'connected',
          actions: [
            {
              type: 'setButtonState',
              params: ({ event }) => ({ value: event.output.buttonState }),
            },
          ],
        },
        onError: {
          target: 'init',
          actions: [
            'clearDevice',
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

    // Connected - handle LED toggle, button read, notifications
    connected: {
      invoke: {
        src: 'connectedListener',
      },
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
          actions: ['toggleLedState'],
          target: '.togglingLed',
        },
        READ_BUTTON: {
          target: '.readingButton',
        },
        DISCONNECT: {
          target: '.disconnecting',
        },
      },
      initial: 'ready',
      states: {
        ready: {},
        togglingLed: {
          invoke: {
            src: 'writeLedState',
            input: ({ context }) => ({
              deviceId: context.deviceId!,
              ledState: context.ledState,
            }),
            onDone: 'ready',
            onError: {
              target: '#bleMachine.init',
              actions: [
                'toggleLedState',
                'clearDevice',
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
              target: '#bleMachine.init',
              actions: [
                'clearDevice',
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
        disconnecting: {
          invoke: {
            src: 'disconnectFromDevice',
            input: ({ context }) => ({ deviceId: context.deviceId! }),
            onDone: {
              target: '#bleMachine.init',
              actions: ['clearDevice'],
            },
            onError: {
              target: '#bleMachine.init',
              actions: ['clearDevice'],
            },
          },
        },
      },
    },
  },
});