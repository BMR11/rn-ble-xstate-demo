import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, PermissionsAndroid, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import BleManager, { Peripheral } from 'react-native-ble-manager';
import { SafeAreaView } from 'react-native-safe-area-context';

// LBS (LED Button Service) GATT UUIDs
// Reference: https://github.com/BMR11/SwiftCoreBluetoothDemo/blob/main/MyPeripheral/PeripheralManager.swift
const LBS_SERVICE_UUID = '00001523-1212-EFDE-1523-785FEABCD123';
const BUTTON_CHARACTERISTIC_UUID = '00001524-1212-EFDE-1523-785FEABCD123'; // read, notify
const LED_CHARACTERISTIC_UUID = '00001525-1212-EFDE-1523-785FEABCD123'; // write

interface DebugLog {
  id: string;
  timestamp: string;
  type: 'event' | 'action' | 'error' | 'info';
  message: string;
}

interface DeviceState {
  isConnected: boolean;
  isConnecting: boolean;
  buttonState: boolean | null; // null = unknown
  ledState: boolean;
}

export default function HomeScreen() {
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [deviceStates, setDeviceStates] = useState<Record<string, DeviceState>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isBleStarted, setIsBleStarted] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const debugListRef = useRef<FlatList>(null);

  const addLog = (type: DebugLog['type'], message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
    const log: DebugLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp,
      type,
      message,
    };
    setDebugLogs(prev => [...prev, log]);
    setTimeout(() => {
      debugListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const updateDeviceState = (peripheralId: string, updates: Partial<DeviceState>) => {
    setDeviceStates(prev => ({
      ...prev,
      [peripheralId]: {
        ...prev[peripheralId] || { isConnected: false, isConnecting: false, buttonState: null, ledState: false },
        ...updates,
      },
    }));
  };

  useEffect(() => {
    // Set up BLE event listeners
    const discoverListener = BleManager.onDiscoverPeripheral((peripheral: Peripheral) => {
      addLog('event', `Discovered: ${peripheral.name || peripheral.id} (RSSI: ${peripheral.rssi})`);
      setDevices(prev => {
        const exists = prev.find(d => d.id === peripheral.id);
        if (exists) {
          return prev.map(d => d.id === peripheral.id ? peripheral : d);
        }
        return [...prev, peripheral];
      });
    });

    const stopScanListener = BleManager.onStopScan(() => {
      addLog('event', 'Scan stopped');
      setIsScanning(false);
    });

    const stateListener = BleManager.onDidUpdateState((args: { state: string }) => {
      addLog('event', `Bluetooth state changed: ${args.state}`);
    });

    const connectListener = BleManager.onConnectPeripheral((args: { peripheral: string }) => {
      addLog('event', `✓ Connected to: ${args.peripheral}`);
      updateDeviceState(args.peripheral, { isConnected: true, isConnecting: false });
    });

    const disconnectListener = BleManager.onDisconnectPeripheral((args: { peripheral: string }) => {
      addLog('event', `✗ Disconnected from: ${args.peripheral}`);
      updateDeviceState(args.peripheral, { isConnected: false, isConnecting: false, buttonState: null });
    });

    // Handle characteristic value updates (notifications)
    const updateValueListener = BleManager.onDidUpdateValueForCharacteristic((args: {
      peripheral: string;
      characteristic: string;
      value: number[];
    }) => {
      const { peripheral, characteristic, value } = args;
      
      if (characteristic.toLowerCase() === BUTTON_CHARACTERISTIC_UUID.toLowerCase()) {
        const buttonPressed = value[0] !== 0;
        addLog('event', `📨 Button notification: ${buttonPressed ? 'PRESSED' : 'RELEASED'}`);
        updateDeviceState(peripheral, { buttonState: buttonPressed });
      }
    });

    return () => {
      discoverListener.remove();
      stopScanListener.remove();
      stateListener.remove();
      connectListener.remove();
      disconnectListener.remove();
      updateValueListener.remove();
    };
  }, []);

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      addLog('action', 'Requesting Bluetooth permissions...');
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      
      const allGranted = 
        granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED;
      
      addLog(allGranted ? 'info' : 'error', `Permissions ${allGranted ? 'granted' : 'denied'}`);
      return allGranted;
    }
    return true;
  };

  const handleStartBLE = async () => {
    addLog('action', '▶ Start BLE button pressed');
    
    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) {
      addLog('error', 'Permissions denied - cannot proceed');
      Alert.alert('Permissions required', 'Bluetooth permissions are required to use this app');
      return;
    }

    try {
      await BleManager.start();
      addLog('info', 'BLE Manager started successfully');
      
      const state = await BleManager.checkState();
      addLog('info', `Bluetooth state: ${state}`);
      
      if (state === 'off') {
        addLog('action', 'Requesting to enable Bluetooth...');
        await BleManager.enableBluetooth();
        addLog('info', 'Bluetooth enabled');
      }
      
      const finalState = await BleManager.checkState();
      if (finalState === 'on') {
        setIsBleStarted(true);
        addLog('info', '✓ BLE ready - Scan enabled');
      } else {
        addLog('error', `Bluetooth not enabled (state: ${finalState}) - Scan disabled`);
        Alert.alert('Bluetooth required', 'Please enable Bluetooth to scan for devices');
      }
    } catch (error) {
      addLog('error', `Error: ${error}`);
      setIsBleStarted(false);
    }
  };

  const handleScan = async () => {
    addLog('action', '▶ Scan button pressed');

    if (isScanning) {
      addLog('action', 'Stopping scan...');
      await BleManager.stopScan();
      setIsScanning(false);
      return;
    }

    try {
      setDevices([]);
      setDeviceStates({});
      addLog('info', 'Cleared device list, starting scan...');
      setIsScanning(true);
      
      await BleManager.scan({
        serviceUUIDs: [LBS_SERVICE_UUID],
        seconds: 10,
        allowDuplicates: false,
      });
      
      addLog('info', 'Scanning for LBS devices (10 seconds)...');
    } catch (error) {
      addLog('error', `Scan error: ${error}`);
      setIsScanning(false);
    }
  };

  const handleDisconnect = async (peripheralId: string, name?: string) => {
    addLog('action', `▶ Disconnecting from ${name || peripheralId}...`);
    try {
      await BleManager.disconnect(peripheralId);
      addLog('info', 'Disconnected');
    } catch (error) {
      addLog('error', `Disconnect error: ${error}`);
    }
  };

  const handleConnect = async (peripheral: Peripheral) => {
    const state = deviceStates[peripheral.id];
    
    // Don't do anything if already connected or connecting
    if (state?.isConnected || state?.isConnecting) {
      return;
    }

    addLog('action', `▶ Connecting to ${peripheral.name || peripheral.id}...`);
    updateDeviceState(peripheral.id, { isConnecting: true });

    // Stop scanning when connecting
    if (isScanning) {
      await BleManager.stopScan();
      setIsScanning(false);
    }

    try {
      await BleManager.connect(peripheral.id);
      addLog('info', 'Connected successfully');

      // Service discovery
      addLog('info', 'Discovering services...');
      const peripheralInfo = await BleManager.retrieveServices(peripheral.id);
      addLog('info', `Found ${peripheralInfo.services?.length || 0} services, ${peripheralInfo.characteristics?.length || 0} characteristics`);

      // Check if LBS service exists
      const hasLBS = peripheralInfo.services?.some(s => 
        s.uuid.toLowerCase() === LBS_SERVICE_UUID.toLowerCase()
      );
      
      if (hasLBS) {
        addLog('info', '✓ LBS Service found');

        // Start notifications for button characteristic
        addLog('info', 'Registering for button notifications...');
        await BleManager.startNotification(peripheral.id, LBS_SERVICE_UUID, BUTTON_CHARACTERISTIC_UUID);
        addLog('info', '✓ Button notifications enabled');

        // Read initial button state
        await handleReadButton(peripheral.id);
      } else {
        addLog('error', 'LBS Service not found on device');
      }

    } catch (error) {
      addLog('error', `Connection error: ${error}`);
      updateDeviceState(peripheral.id, { isConnecting: false, isConnected: false });
    }
  };

  const handleReadButton = async (peripheralId: string) => {
    addLog('action', '📖 Reading button state...');
    try {
      const data = await BleManager.read(peripheralId, LBS_SERVICE_UUID, BUTTON_CHARACTERISTIC_UUID);
      const buttonPressed = data[0] !== 0;
      addLog('info', `Button state: ${buttonPressed ? 'PRESSED' : 'RELEASED'}`);
      updateDeviceState(peripheralId, { buttonState: buttonPressed });
    } catch (error) {
      addLog('error', `Read error: ${error}`);
    }
  };

  const handleToggleLED = async (peripheralId: string) => {
    const state = deviceStates[peripheralId];
    const newLedState = !state?.ledState;
    
    addLog('action', `💡 Toggling LED to ${newLedState ? 'ON' : 'OFF'}...`);
    try {
      await BleManager.write(peripheralId, LBS_SERVICE_UUID, LED_CHARACTERISTIC_UUID, [newLedState ? 1 : 0]);
      addLog('info', `✓ LED set to ${newLedState ? 'ON' : 'OFF'}`);
      updateDeviceState(peripheralId, { ledState: newLedState });
    } catch (error) {
      addLog('error', `Write error: ${error}`);
    }
  };

  const handleClearLogs = () => {
    addLog('action', '▶ Clear logs pressed');
    setTimeout(() => setDebugLogs([]), 100);
  };

  const renderDevice = ({ item }: { item: Peripheral }) => {
    const state = deviceStates[item.id] || { isConnected: false, isConnecting: false, buttonState: null, ledState: false };
    
    return (
      <Pressable onPress={() => handleConnect(item)} style={styles.deviceItem}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceNameRow}>
              {state.isConnected && <ThemedText style={styles.connectedIndicator}>●</ThemedText>}
              <ThemedText style={styles.deviceName}>{item.name || 'Unknown Device'}</ThemedText>
              {state.isConnected && <ThemedText style={styles.connectedText}>Connected</ThemedText>}
              {state.isConnecting && <ThemedText style={styles.connectingText}>Connecting...</ThemedText>}
            </View>
            <ThemedText style={styles.deviceId}>{item.id}</ThemedText>
          </View>
          <View style={styles.deviceMeta}>
            <ThemedText style={styles.rssi}>{item.rssi} dBm</ThemedText>
            {state.isConnected ? (
              <Pressable onPress={() => handleDisconnect(item.id, item.name)}>
                <ThemedText style={styles.disconnectTextButton}>Disconnect</ThemedText>
              </Pressable>
            ) : (
              <ThemedText style={styles.connectionStatus}>
                {state.isConnecting ? '' : 'Tap to connect'}
              </ThemedText>
            )}
          </View>
        </View>

        {state.isConnected && (
          <View style={styles.characteristicsContainer}>
            {/* Button State */}
            <View style={styles.characteristicRow}>
              <View style={styles.characteristicInfo}>
                <ThemedText style={styles.characteristicLabel}>Button</ThemedText>
                <ThemedText style={[
                  styles.characteristicValue,
                  state.buttonState === true && styles.valueActive
                ]}>
                  {state.buttonState === null ? '...' : state.buttonState ? '🔵 PRESSED' : '⚪ RELEASED'}
                </ThemedText>
              </View>
              <Pressable 
                style={styles.characteristicButton}
                onPress={() => handleReadButton(item.id)}
              >
                <ThemedText style={styles.characteristicButtonText}>Read</ThemedText>
              </Pressable>
            </View>

            {/* LED State */}
            <View style={styles.characteristicRow}>
              <View style={styles.characteristicInfo}>
                <ThemedText style={styles.characteristicLabel}>LED</ThemedText>
                <ThemedText style={[
                  styles.characteristicValue,
                  state.ledState && styles.valueActive
                ]}>
                  {state.ledState ? '🟢 ON' : '⚫ OFF'}
                </ThemedText>
              </View>
              <Pressable 
                style={[styles.characteristicButton, styles.toggleButton]}
                onPress={() => handleToggleLED(item.id)}
              >
                <ThemedText style={styles.characteristicButtonText}>Toggle</ThemedText>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  const renderLog = ({ item }: { item: DebugLog }) => {
    const typeColors = {
      event: '#4CAF50',
      action: '#2196F3',
      error: '#F44336',
      info: '#9E9E9E',
    };
    
    return (
      <View style={styles.logItem}>
        <ThemedText style={styles.logTimestamp}>{item.timestamp}</ThemedText>
        <ThemedText style={[styles.logType, { color: typeColors[item.type] }]}>
          [{item.type.toUpperCase()}]
        </ThemedText>
        <ThemedText style={styles.logMessage} numberOfLines={2}>{item.message}</ThemedText>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Devices List - Upper 40% */}
      <ThemedView style={styles.devicesSection}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Devices ({devices.length})</ThemedText>
          {isScanning && <ThemedText style={styles.scanningBadge}>● Scanning</ThemedText>}
        </View>
        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={item => item.id}
          style={styles.list}
          ListEmptyComponent={
            <ThemedText style={styles.emptyText}>
              {isScanning ? 'Searching for LBS devices...' : 'No devices found. Tap Scan to search.'}
            </ThemedText>
          }
        />
      </ThemedView>

      {/* Buttons - Middle 20% */}
      <View style={styles.buttonsSection}>
        <Pressable 
          style={[styles.button, isBleStarted && styles.buttonDisabled]} 
          onPress={handleStartBLE}
          disabled={isBleStarted}
        >
          <ThemedText style={styles.buttonText}>
            {isBleStarted ? '✓ BLE Started' : 'Start BLE'}
          </ThemedText>
        </Pressable>
        
        <Pressable 
          style={[
            styles.button, 
            styles.scanButton, 
            isScanning && styles.scanningButton,
            !isBleStarted && styles.scanButtonDisabled
          ]} 
          onPress={handleScan}
          disabled={!isBleStarted}
        >
          <ThemedText style={[styles.buttonText, !isBleStarted && styles.buttonTextDisabled]}>
            {isScanning ? 'Stop Scan' : 'Scan'}
          </ThemedText>
        </Pressable>
      </View>

      {/* Debug Logs - Lower 40% */}
      <ThemedView style={styles.debugSection}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Debug Logs</ThemedText>
          <Pressable onPress={handleClearLogs}>
            <ThemedText style={styles.clearButton}>Clear</ThemedText>
          </Pressable>
        </View>
        <FlatList
          ref={debugListRef}
          data={debugLogs}
          renderItem={renderLog}
          keyExtractor={item => item.id}
          style={styles.logList}
          ListEmptyComponent={
            <ThemedText style={styles.emptyText}>No logs yet. Start interacting!</ThemedText>
          }
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  devicesSection: {
    flex: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  buttonsSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  debugSection: {
    flex: 4,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scanningBadge: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  deviceItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedIndicator: {
    color: '#4CAF50',
    fontSize: 12,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
  },
  connectedText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  connectingText: {
    color: '#FF9800',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  deviceId: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
  },
  deviceMeta: {
    alignItems: 'flex-end',
  },
  rssi: {
    fontSize: 12,
    opacity: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  connectionStatus: {
    fontSize: 10,
    opacity: 0.5,
    marginTop: 2,
  },
  disconnectTextButton: {
    color: '#F44336',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  characteristicsContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  characteristicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  characteristicInfo: {
    flex: 1,
  },
  characteristicLabel: {
    fontSize: 11,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  characteristicValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  valueActive: {
    color: '#4CAF50',
  },
  characteristicButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  toggleButton: {
    backgroundColor: '#FF9800',
  },
  characteristicButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#2E7D32',
  },
  scanButton: {
    backgroundColor: '#FF9800',
  },
  scanButtonDisabled: {
    backgroundColor: '#666',
    opacity: 0.5,
  },
  scanningButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    opacity: 0.7,
  },
  logList: {
    flex: 1,
  },
  logItem: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'flex-start',
  },
  logTimestamp: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    opacity: 0.5,
    width: 85,
  },
  logType: {
    fontSize: 10,
    fontWeight: '700',
    width: 60,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logMessage: {
    fontSize: 11,
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    marginTop: 20,
    fontSize: 13,
  },
  clearButton: {
    color: '#FF5722',
    fontSize: 14,
    fontWeight: '600',
  },
});
