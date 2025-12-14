import React, { useEffect, useRef, useState, useMemo } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Peripheral } from 'react-native-ble-manager';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBluetooth } from '../state-machine';

interface DebugLog {
  id: string;
  timestamp: string;
  type: 'event' | 'action' | 'error' | 'info' | 'state';
  message: string;
}

export default function HomeScreen() {
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const debugListRef = useRef<FlatList>(null);
  const prevStateRef = useRef<string>('');

  // XState machine hook
  const {
    start,
    selectDevice,
    disconnect,
    toggleLed,
    readButton,
    clearStoredDevice,
    // State selectors
    deviceId,
    deviceName,
    buttonState,
    ledState,
    error,
    discoveredDevices,
    isIdle,
    isScanning,
    isConnecting,
    isConnected,
    currentState,
  } = useBluetooth();

  const addLog = (type: DebugLog['type'], message: string) => {
    const now = new Date();
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    const timestamp = `${mm}:${ss}`;
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

  // Log state changes
  useEffect(() => {
    if (currentState !== prevStateRef.current) {
      addLog('state', `State: ${prevStateRef.current || 'initial'} → ${currentState}`);
      prevStateRef.current = currentState;
    }
  }, [currentState]);

  // Log errors
  useEffect(() => {
    if (error) {
      addLog('error', error);
    }
  }, [error]);

  // Log device discoveries
  useEffect(() => {
    if (discoveredDevices.length > 0) {
      const latest = discoveredDevices[discoveredDevices.length - 1];
      addLog('event', `Discovered: ${latest.name || latest.id} (RSSI: ${latest.rssi})`);
    }
  }, [discoveredDevices.length]);

  // Log connection status
  useEffect(() => {
    if (isConnected && deviceId) {
      addLog('info', `✓ Connected to ${deviceId}`);
    }
  }, [isConnected, deviceId]);

  // Log button state changes
  useEffect(() => {
    if (buttonState !== null) {
      addLog('event', `📨 Button: ${buttonState ? 'PRESSED' : 'RELEASED'}`);
    }
  }, [buttonState]);

  const handleStartBLE = () => {
    addLog('action', '▶ Start BLE button pressed');
    start(); // This starts the state machine: idle → init → scanning/connecting
  };

  const handleSelectDevice = (peripheral: Peripheral) => {
    if (isConnected || isConnecting) return;
    
    addLog('action', `▶ Selecting device: ${peripheral.name || peripheral.id}`);
    selectDevice(peripheral.id, peripheral.name);
  };

  const handleDisconnect = () => {
    addLog('action', '▶ Disconnect pressed');
    disconnect();
  };

  const handleToggleLED = () => {
    addLog('action', `💡 Toggling LED...`);
    toggleLed();
  };

  const handleReadButton = () => {
    addLog('action', '📖 Reading button state...');
    readButton();
  };

  const handleClearLogs = () => {
    setDebugLogs([]);
  };

  const handleClearDevice = () => {
    addLog('action', '🗑 Clearing stored device...');
    clearStoredDevice();
  };

  const isStarted = !isIdle;
  const connectedDeviceId = isConnected ? deviceId : null;

  // Create device list that includes connected/connecting device even if not discovered
  const displayDevices = useMemo(() => {
    const devices = [...discoveredDevices];
    
    // If we have a deviceId (connecting or connected) and it's not in discovered list, add it
    if (deviceId && (isConnecting || isConnected)) {
      const exists = devices.find(d => d.id === deviceId);
      if (!exists) {
        // Create a placeholder device entry for stored device
        devices.unshift({
          id: deviceId,
          name: deviceName || undefined,
          rssi: 0,
          advertising: {},
        } as Peripheral);
      }
    }
    
    return devices;
  }, [discoveredDevices, deviceId, deviceName, isConnecting, isConnected]);

  const renderDevice = ({ item }: { item: Peripheral }) => {
    const isThisDeviceConnected = connectedDeviceId === item.id;
    const isThisDeviceConnecting = isConnecting && deviceId === item.id;
    
    return (
      <Pressable onPress={() => handleSelectDevice(item)} style={styles.deviceItem}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceNameRow}>
              {isThisDeviceConnected && <ThemedText style={styles.connectedIndicator}>●</ThemedText>}
              <ThemedText style={styles.deviceName}>{item.name || 'Unknown Device'}</ThemedText>
              {isThisDeviceConnected && <ThemedText style={styles.connectedText}>Connected</ThemedText>}
              {isThisDeviceConnecting && <ThemedText style={styles.connectingText}>Connecting...</ThemedText>}
            </View>
            <ThemedText style={styles.deviceId}>{item.id}</ThemedText>
          </View>
          <View style={styles.deviceMeta}>
            <ThemedText style={styles.rssi}>{item.rssi !== 0 ? `${item.rssi} dBm` : 'Stored'}</ThemedText>
            {isThisDeviceConnected ? (
              <Pressable onPress={handleDisconnect}>
                <ThemedText style={styles.disconnectTextButton}>Disconnect</ThemedText>
              </Pressable>
            ) : (
              <ThemedText style={styles.connectionStatus}>
                {isThisDeviceConnecting ? '' : 'Tap to connect'}
              </ThemedText>
            )}
          </View>
        </View>

        {isThisDeviceConnected && (
          <View style={styles.characteristicsContainer}>
            {/* Button State */}
            <View style={styles.characteristicRow}>
              <View style={styles.characteristicInfo}>
                <ThemedText style={styles.characteristicLabel}>Button</ThemedText>
                <ThemedText style={[
                  styles.characteristicValue,
                  buttonState === true && styles.valueActive
                ]}>
                  {buttonState === null ? '...' : buttonState ? '🔵 PRESSED' : '⚪ RELEASED'}
                </ThemedText>
              </View>
              <Pressable 
                style={styles.characteristicButton}
                onPress={handleReadButton}
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
                  ledState && styles.valueActive
                ]}>
                  {ledState ? '🟢 ON' : '⚫ OFF'}
                </ThemedText>
              </View>
              <Pressable 
                style={[styles.characteristicButton, styles.toggleButton]}
                onPress={handleToggleLED}
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
    const typeColors: Record<string, string> = {
      event: '#4CAF50',
      action: '#2196F3',
      error: '#F44336',
      info: '#9E9E9E',
      state: '#9C27B0',
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
      {/* State Badge */}
      <View style={styles.stateBadge}>
        <ThemedText style={styles.stateLabel}>State:</ThemedText>
        <ThemedText style={styles.stateValue}>{currentState.toUpperCase()}</ThemedText>
      </View>

      {/* Devices List - Upper 40% */}
      <ThemedView style={styles.devicesSection}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Devices ({displayDevices.length})</ThemedText>
          {isScanning && <ThemedText style={styles.scanningBadge}>● Scanning</ThemedText>}
        </View>
        <FlatList
          data={displayDevices}
          renderItem={renderDevice}
          keyExtractor={item => item.id}
          style={styles.list}
          ListEmptyComponent={
            <ThemedText style={styles.emptyText}>
              {isScanning 
                ? 'Searching for LBS devices...' 
                : isIdle 
                  ? 'Press "Start BLE" to begin' 
                  : 'No devices found.'}
            </ThemedText>
          }
        />
      </ThemedView>

      {/* Buttons */}
      <View style={styles.buttonsSection}>
        <Pressable 
          style={[styles.button, isStarted && styles.buttonDisabled]} 
          onPress={handleStartBLE}
          disabled={isStarted}
        >
          <ThemedText style={styles.buttonText}>
            {isStarted ? '✓ BLE Started' : 'Start BLE'}
          </ThemedText>
        </Pressable>
        
        <Pressable 
          style={styles.clearDeviceButton} 
          onPress={handleClearDevice}
        >
          <ThemedText style={styles.clearDeviceButtonText}>Clear Device</ThemedText>
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
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(156, 39, 176, 0.2)',
    gap: 8,
  },
  stateLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  stateValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9C27B0',
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
  clearDeviceButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  clearDeviceButtonText: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logList: {
    flex: 1,
  },
  logItem: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    // paddingVertical: 10,
    // gap: 8,
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.3)',
  },
  logTimestamp: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    opacity: 0.5,
    width: 40,
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
