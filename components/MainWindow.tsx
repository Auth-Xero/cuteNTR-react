import React, { useState, useEffect } from 'react';
import {
  Platform,
  View,
  TextInput,
  Text,
  StyleSheet,
  Button,
  Switch,
  TouchableOpacity,
  ScrollView,
  PermissionsAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import RNFS from 'react-native-fs';

interface MainWindowProps {
  dsIP: string;
  qosValue: number;
  priMode: number;
  priFact: number;
  jpegQuality: number;
  debugging: boolean;
  streaming: boolean;
  hzStreaming: boolean;
  startStream: () => void;
  stopStream: () => void;
  startHzStream: () => void;
  stopHzStream: () => void;
  updateDsIP: (dsIP: string) => void;
  updateJpegQuality: (jpegQuality: number) => void;
  updateCpuLimit: (cpuLimit: number) => void;
  // Modified navigateToStreamWindow accepts a mode: 'top' | 'bottom' | 'both'
  navigateToStreamWindow: (mode: 'top' | 'bottom' | 'both', showFps: boolean) => void;
  recordingEnabled: boolean;
  setRecordingEnabled: (enabled: boolean) => void;
  hzModEnabled: boolean;
  setHzModEnabled: (enabled: boolean) => void;
  cpuLimit: number;
  setCpuLimit: (limit: number) => void;
  hzConnected: boolean;
  hzDisconnected: boolean;
}

const MainWindow: React.FC<MainWindowProps> = (props) => {
  // Local state with defaults coming from props.
  const [dsIP, setDsIP] = useState<string>(props.dsIP);
  const [qosValue, setQosValue] = useState<string>(props.qosValue.toString());
  const [jpegQuality, setJpegQuality] = useState<string>(props.jpegQuality.toString());
  const [priorityFactor, setPriorityFactor] = useState<number>(props.priFact);
  const [screenPriority, setScreenPriority] = useState<number>(1); // Default to Top
  const [showFps, setShowFps] = useState<boolean>(false);
  // New state for toggling both view mode.
  // If HzMod is enabled, bothViewEnabled is forced to false.
  const [bothViewEnabled, setBothViewEnabled] = useState<boolean>(false);

  // Load persisted settings from AsyncStorage when the component mounts.
  useEffect(() => {
    (async () => {
      try {
        const savedSettings = await AsyncStorage.getItem('mainWindowSettings');
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          if (settings.dsIP) setDsIP(settings.dsIP);
          if (settings.qosValue) setQosValue(settings.qosValue);
          if (settings.jpegQuality) setJpegQuality(settings.jpegQuality);
          if (settings.priorityFactor || settings.priorityFactor === 0) setPriorityFactor(settings.priorityFactor);
          if (settings.screenPriority || settings.screenPriority === 0) setScreenPriority(settings.screenPriority);
          if (settings.showFps !== undefined) setShowFps(settings.showFps);
          if (settings.bothViewEnabled !== undefined) setBothViewEnabled(settings.bothViewEnabled);
        }
      } catch (error) {
        console.log('Error loading mainWindowSettings:', error);
      }
    })();
  }, []);

  // Save local settings to AsyncStorage whenever they change.
  useEffect(() => {
    const settings = {
      dsIP,
      qosValue,
      jpegQuality,
      priorityFactor,
      screenPriority,
      showFps,
      bothViewEnabled,
    };
    AsyncStorage.setItem('mainWindowSettings', JSON.stringify(settings)).catch((error) =>
      console.error('Failed to save mainWindowSettings:', error),
    );
  }, [dsIP, qosValue, jpegQuality, priorityFactor, screenPriority, showFps, bothViewEnabled]);

  // Request storage permission on Android.
  useEffect(() => {
    if (Platform.OS === 'android') {
      hasAndroidPermission().then((hasPermission) => {
        if (!hasPermission) {
          console.log('Storage permission denied by user.');
        }
      });
    }
  }, []);
  
  async function hasAndroidPermission() {
    if (Number(Platform.Version) >= 33) {
      return true;
    }
  
    const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  
    const hasPermission = await PermissionsAndroid.check(permission);
    if (hasPermission) {
      return true;
    }
  
    const status = await PermissionsAndroid.request(permission,  {
      title: 'Storage Permission',
      message: 'App needs access to your storage to save recordings',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    });
    return status === 'granted';
  }
  
  useEffect(() => {
    const handleStateChanged = (state: string) => {
      console.log('Stream state changed:', state);
    };

    const stateChangedListener = EventRegister.addEventListener('stateChanged', handleStateChanged);
    return () => {
      EventRegister.removeEventListener('stateChanged');
    };
  }, []);

  const handleStartStopStream = () => {
    props.updateDsIP(dsIP);
    const jpegq = parseInt(jpegQuality, 10);
    const qosvalue = parseInt(qosValue, 10) * 2;

    EventRegister.emit('streamSettings', { screenPriority, priorityFactor, jpegq, qosvalue });

    if (props.streaming) {
      props.hzModEnabled ? props.stopHzStream() : props.stopStream();
    } else {
      props.hzModEnabled ? props.startHzStream() : props.startStream();
    }
  };

  const recordingDirectory =
    Platform.OS === 'android'
      ? `${RNFS.ExternalStorageDirectoryPath}/Documents/Recordings`
      : `${RNFS.DocumentDirectoryPath}/Recordings`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Section: IP and Stream Control */}
        <View style={styles.section}>
          <Text style={styles.label}>IP Address</Text>
          <TextInput
            style={styles.input}
            placeholder="DS IP Address"
            placeholderTextColor="#888"
            value={dsIP}
            onChangeText={setDsIP}
          />
          <TouchableOpacity style={styles.button} onPress={handleStartStopStream}>
            <Text style={styles.buttonText}>{props.streaming ? 'Stop Stream' : 'Start Stream'}</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Priority Settings */}
        <View style={styles.section}>
          <Text style={styles.label}>Priority Factor</Text>
          <View style={styles.priorityContainer}>
            <Button
              title="-"
              onPress={() => !props.hzModEnabled && setPriorityFactor((prev) => Math.max(prev - 1, 0))}
              disabled={props.hzModEnabled}
              color="#BB86FC"
            />
            <TextInput
              style={[styles.priorityInput, props.hzModEnabled && styles.disabledInput]}
              value={priorityFactor.toString()}
              onChangeText={(text) => !props.hzModEnabled && setPriorityFactor(parseInt(text, 10))}
              keyboardType="numeric"
              editable={!props.hzModEnabled}
            />
            <Button
              title="+"
              onPress={() => !props.hzModEnabled && setPriorityFactor((prev) => prev + 1)}
              disabled={props.hzModEnabled}
              color="#BB86FC"
            />
          </View>

          <Text style={styles.label}>Screen Priority</Text>
          <View style={styles.screenPriorityContainer}>
            <TouchableOpacity
              style={[styles.screenPriorityButton, screenPriority === 1 && styles.selectedButton]}
              onPress={() => !props.hzModEnabled && setScreenPriority(1)}
            >
              <Text style={styles.buttonText}>Top Screen</Text>
            </TouchableOpacity>
            {/* Only allow Bottom Screen selection if HzMod is disabled */}
            <TouchableOpacity
              style={[
                styles.screenPriorityButton,
                screenPriority === 0 && styles.selectedButton,
                props.hzModEnabled && styles.disabledButton,
              ]}
              onPress={() => !props.hzModEnabled && setScreenPriority(0)}
              disabled={props.hzModEnabled}
            >
              <Text style={styles.buttonText}>Bottom Screen</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: JPEG and QoS Settings */}
        <View style={styles.section}>
          <Text style={styles.label}>JPEG Quality</Text>
          <TextInput
            style={styles.input}
            placeholder="JPEG Quality"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={jpegQuality}
            onChangeText={(text) => {
              setJpegQuality(text);
              props.updateJpegQuality(parseInt(text, 10));
            }}
          />

          {props.hzModEnabled ? (
            <>
              <Text style={styles.label}>CPU Limit</Text>
              <TextInput
                style={styles.input}
                placeholder="CPU Limit"
                placeholderTextColor="#888"
                keyboardType="numeric"
                value={props.cpuLimit.toString()}
                onChangeText={(text) => {
                  const limit = parseInt(text, 10);
                  if (!isNaN(limit)) {
                    props.setCpuLimit(limit);
                    props.updateCpuLimit(limit);
                  }
                }}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>QoS Value</Text>
              <TextInput
                style={styles.input}
                placeholder="QoS Value"
                placeholderTextColor="#888"
                keyboardType="numeric"
                value={qosValue}
                onChangeText={setQosValue}
              />
            </>
          )}
        </View>

        {/* Section: Additional Options */}
        <View style={styles.section}>
          <View style={styles.switchContainer}>
            <Text style={styles.label}>Show FPS</Text>
            <Switch value={showFps} onValueChange={setShowFps} />
          </View>
          <View style={styles.switchContainer}>
            <Text style={styles.label}>Enable Recording</Text>
            <Switch value={props.recordingEnabled} onValueChange={props.setRecordingEnabled} />
          </View>
          {props.recordingEnabled && (
            <>
              <Text style={styles.label}>Recordings will be saved to:</Text>
              <Text style={styles.directoryPath}>{recordingDirectory}</Text>
            </>
          )}
          <View style={styles.switchContainer}>
            <Text style={styles.label}>HzMod</Text>
            <Switch
              value={props.hzModEnabled}
              onValueChange={(enabled) => {
                props.setHzModEnabled(enabled);
                // If HzMod is enabled, force bothViewEnabled to false.
                if (enabled) {
                  setBothViewEnabled(false);
                }
              }}
            />
          </View>
          {/* Both View Option is available only if HzMod is disabled */}
          <View style={styles.switchContainer}>
            <Text style={styles.label}>Both View</Text>
            <Switch
              value={bothViewEnabled}
              onValueChange={setBothViewEnabled}
              disabled={props.hzModEnabled}
            />
          </View>
        </View>

        {/* Navigation Buttons */}
        {props.hzModEnabled ? (
          // If HzMod is enabled, force top screen.
          <TouchableOpacity style={styles.button} onPress={() => props.navigateToStreamWindow('top', showFps)}>
            <Text style={styles.buttonText}>Go to Stream Window (Top)</Text>
          </TouchableOpacity>
        ) : (
          // HzMod disabled: offer either both view or separate top/bottom.
          bothViewEnabled ? (
            <TouchableOpacity style={styles.button} onPress={() => props.navigateToStreamWindow('both', showFps)}>
              <Text style={styles.buttonText}>Go to Stream Window (Both)</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.button} onPress={() => props.navigateToStreamWindow('top', showFps)}>
                <Text style={styles.buttonText}>Go to Stream Window (Top)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={() => props.navigateToStreamWindow('bottom', showFps)}>
                <Text style={styles.buttonText}>Go to Stream Window (Bottom)</Text>
              </TouchableOpacity>
            </>
          )
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContainer: {
    padding: 20,
  },
  section: {
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  input: {
    height: 50,
    backgroundColor: '#2C2C2C',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '500',
    color: '#E0E0E0',
  },
  button: {
    backgroundColor: '#BB86FC',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  priorityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  priorityInput: {
    height: 50,
    backgroundColor: '#2C2C2C',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    flex: 1,
    marginHorizontal: 8,
  },
  disabledInput: {
    backgroundColor: '#555',
  },
  screenPriorityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  screenPriorityButton: {
    flex: 1,
    backgroundColor: '#BB86FC',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  selectedButton: {
    backgroundColor: '#6200EE',
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  directoryPath: {
    color: '#E0E0E0',
    fontSize: 14,
    marginTop: 4,
  },
});

export default MainWindow;
