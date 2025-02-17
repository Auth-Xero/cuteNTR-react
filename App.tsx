import React, { Component } from 'react';
import { 
  View, 
  StyleSheet, 
  AppState, 
  Platform, 
  PermissionsAndroid 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MainWindow from './components/MainWindow';
import Ntr from './components/ntr/Ntr';
import StreamWorker from './components/stream/StreamWorker';
import HzMod from './components/hzmod/HzMod';
import { EventRegister } from 'react-native-event-listeners';

interface AppComponentState {
  dsIP: string;
  qosValue: number;
  priMode: number;
  priFact: number;
  jpegQuality: number;
  debugging: boolean;
  streaming: boolean;
  hzStreaming: boolean;
  remotePlayInitiated: boolean;
  currentScreen: 'Home' | 'StreamWindow';
  isTop: boolean; // Determines which screen to show when in single mode
  streamMode: 'top' | 'bottom' | 'both'; // New property to indicate stream mode
  showFps: boolean;
  recordingEnabled: boolean;
  recordingPath: string;
  hzModEnabled: boolean;
  cpuLimit: number;
  hzConnected: boolean;
  hzDisconnected: boolean;
}

class App extends Component<{}, AppComponentState> {
  private appStateSubscription: any;
  private stateChangedListener: any;
  private ntrStateChangedListener: any;

  constructor(props: {}) {
    super(props);
    this.state = {
      dsIP: '10.0.0.116',
      qosValue: 105,
      priMode: 1,
      priFact: 5,
      jpegQuality: 60,
      debugging: false,
      streaming: false,
      hzStreaming: false,
      remotePlayInitiated: false,
      currentScreen: 'Home',
      isTop: true,
      streamMode: 'top', // default mode is top
      showFps: false,
      recordingEnabled: false,
      recordingPath: '',
      hzModEnabled: false,
      cpuLimit: 0,
      hzConnected: false,
      hzDisconnected: true,
    };

    this.startStream = this.startStream.bind(this);
    this.stopStream = this.stopStream.bind(this);
    this.startHzStream = this.startHzStream.bind(this);
    this.stopHzStream = this.stopHzStream.bind(this);
    this.navigateToStreamWindow = this.navigateToStreamWindow.bind(this);
    this.navigateBack = this.navigateBack.bind(this);
    this.updateDsIP = this.updateDsIP.bind(this);
    this.updateJpegQuality = this.updateJpegQuality.bind(this);
    this.updateCpuLimit = this.updateCpuLimit.bind(this);
    this.handleAppStateChange = this.handleAppStateChange.bind(this);
    this.handleStreamStateChanged = this.handleStreamStateChanged.bind(this);
    this.handleNtrStateChanged = this.handleNtrStateChanged.bind(this);
    this.setRecordingEnabled = this.setRecordingEnabled.bind(this);
    this.setRecordingPath = this.setRecordingPath.bind(this);
    this.setHzModEnabled = this.setHzModEnabled.bind(this);
    this.setCpuLimit = this.setCpuLimit.bind(this);
  }

  componentDidMount() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    this.stateChangedListener = EventRegister.addEventListener('stateChanged', (state: string) => this.handleStreamStateChanged(state));
    this.ntrStateChangedListener = EventRegister.addEventListener('ntrStateChanged', (state: string) => this.handleNtrStateChanged(state));

    // Load persisted settings (if any) and request storage permission initially.
    this.loadSettings();
    this.requestStoragePermission();
  }

  componentDidUpdate(prevProps: {}, prevState: AppComponentState) {
    // Persist selected settings so they survive an app restart.
    const { dsIP, qosValue, priMode, priFact, jpegQuality, recordingEnabled, recordingPath, hzModEnabled, cpuLimit } = this.state;
    const settings = { dsIP, qosValue, priMode, priFact, jpegQuality, recordingEnabled, recordingPath, hzModEnabled, cpuLimit };
    AsyncStorage.setItem('appSettings', JSON.stringify(settings)).catch(error =>
      console.error('Failed to save settings:', error),
    );
  }

  componentWillUnmount() {
    this.appStateSubscription.remove();
    EventRegister.removeEventListener(this.stateChangedListener);
    EventRegister.removeEventListener(this.ntrStateChangedListener);
    this.stopStream(); // Ensure the stream is stopped when the component unmounts
  }

  // Load settings from AsyncStorage
  loadSettings = async () => {
    try {
      const settingsString = await AsyncStorage.getItem('appSettings');
      if (settingsString) {
        const settings = JSON.parse(settingsString);
        this.setState({
          dsIP: settings.dsIP || '10.0.0.116',
          qosValue: settings.qosValue || 105,
          priMode: settings.priMode || 1,
          priFact: settings.priFact || 5,
          jpegQuality: settings.jpegQuality || 60,
          recordingEnabled: settings.recordingEnabled || false,
          recordingPath: settings.recordingPath || '',
          hzModEnabled: settings.hzModEnabled || false,
          cpuLimit: settings.cpuLimit || 0,
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  // Request storage permission (for Android)
  requestStoragePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Storage Permission',
            message: 'App needs access to your storage to save recordings',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        console.log(granted);
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Storage permission granted');
        } else {
          console.log('Storage permission denied');
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };

  handleAppStateChange(nextAppState: string) {
    /* Uncomment if you want to stop the stream when the app goes to the background:
    if (nextAppState.match(/inactive|background/)) {
      this.stopStream();
    }
    */
  }

  handleNtrStateChanged(state: string) {
    if (state === 'Connected') {
      this.setState({ debugging: true });
      if (!this.state.remotePlayInitiated) {
        this.setState({ remotePlayInitiated: true });
        EventRegister.emit('ntrCommand', {
          command: 901,
        });
      }
    } else if (state === 'Disconnected') {
      this.setState({ debugging: false });
    }
  }

  handleStreamStateChanged(state: string) {
    if (state === 'Connected') {
      this.setState({ streaming: true, hzConnected: false, hzDisconnected: false });
      EventRegister.emit('ntrConnectToDs');
    } else if (state === 'Disconnected') {
      this.setState({
        streaming: false,
        hzStreaming: false,
        hzConnected: false,
        hzDisconnected: true,
        remotePlayInitiated: false,
      });
    }
  }

  startStream() {
    console.log('startStream called');
    if (!this.state.streaming) {
      EventRegister.emit('stream');
    }
  }

  stopStream() {
    console.log('stopStream called');
    if (this.state.streaming) {
      EventRegister.emit('stopStream');
    }
  }

  startHzStream() {
    console.log('startHzStream called');
    if (!this.state.hzStreaming) {
      EventRegister.emit('hzStream');
      this.setState({ hzStreaming: true });
    }
  }

  stopHzStream() {
    console.log('stopHzStream called');
    if (this.state.hzStreaming) {
      EventRegister.emit('stopHzStream');
      this.setState({ hzStreaming: false });
    }
  }

  // Updated navigateToStreamWindow to accept a mode ('top' | 'bottom' | 'both')
  navigateToStreamWindow(mode: 'top' | 'bottom' | 'both', showFps: boolean) {
    console.log('Navigating to StreamWindow with mode:', mode);
    this.setState({
      currentScreen: 'StreamWindow',
      streamMode: mode,
      // For single view modes, set isTop accordingly; for 'both', isTop is not used
      isTop: mode === 'top',
      showFps: showFps,
    });
  }

  navigateBack() {
    console.log('Navigating back to Home');
    this.setState({ currentScreen: 'Home' });
    // Do not stop the stream here
  }

  updateDsIP(dsIP: string) {
    this.setState({ dsIP });
  }

  updateJpegQuality(jpegQuality: number) {
    this.setState({ jpegQuality });
  }

  updateCpuLimit(cpuLimit: number) {
    this.setState({ cpuLimit });
  }

  setRecordingEnabled(enabled: boolean) {
    this.setState({ recordingEnabled: enabled });
  }

  setRecordingPath(path: string) {
    this.setState({ recordingPath: path });
  }

  setHzModEnabled(enabled: boolean) {
    this.setState({ hzModEnabled: enabled });
  }

  setCpuLimit(limit: number) {
    this.setState({ cpuLimit: limit });
  }

  render() {
    const { 
      currentScreen, 
      isTop, 
      streamMode, 
      dsIP, 
      streaming, 
      hzStreaming, 
      priMode, 
      priFact, 
      jpegQuality, 
      qosValue, 
      showFps, 
      recordingEnabled, 
      recordingPath, 
      hzModEnabled, 
      cpuLimit, 
      hzConnected, 
      hzDisconnected 
    } = this.state;

    // Choose the platform-specific StreamWindow component.
    const StreamWindowComponent = require('./components/stream/StreamWindow').default;

    return (
      <View style={styles.container}>
        {currentScreen === 'StreamWindow' ? (
          <StreamWindowComponent
            // Pass isTop (for single view) and bothViewEnabled (for dual view) accordingly.
            isTop={isTop}
            bothViewEnabled={streamMode === 'both'}
            dsIP={dsIP}
            navigateBack={this.navigateBack}
            showFps={showFps}
            recordingEnabled={recordingEnabled}
            hzModEnabled={hzModEnabled}
          />
        ) : (
          <MainWindow
            dsIP={dsIP}
            qosValue={qosValue}
            priMode={priMode}
            priFact={priFact}
            jpegQuality={jpegQuality}
            debugging={this.state.debugging}
            streaming={streaming}
            hzStreaming={hzStreaming}
            startStream={this.startStream}
            stopStream={this.stopStream}
            startHzStream={this.startHzStream}
            stopHzStream={this.stopHzStream}
            updateDsIP={this.updateDsIP}
            updateJpegQuality={this.updateJpegQuality}
            updateCpuLimit={this.updateCpuLimit}
            // Pass the updated navigateToStreamWindow that now takes a mode.
            navigateToStreamWindow={this.navigateToStreamWindow}
            recordingEnabled={recordingEnabled}
            setRecordingEnabled={this.setRecordingEnabled}
            hzModEnabled={hzModEnabled}
            setHzModEnabled={this.setHzModEnabled}
            cpuLimit={cpuLimit}
            setCpuLimit={this.setCpuLimit}
            hzConnected={hzConnected}
            hzDisconnected={hzDisconnected}
          />
        )}
        {/* Ntr and StreamWorker are only rendered when HzMod is disabled */}
        {!hzModEnabled && <Ntr dsIP={dsIP} screenPriority={priMode} priFact={priFact} jpegq={jpegQuality} qosvalue={qosValue} />}
        {!hzModEnabled && <StreamWorker dsIP={dsIP} />}
        {hzModEnabled && <HzMod cpuLimit={cpuLimit} jpegQuality={jpegQuality} dsIP={dsIP} />}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
    margin: 0,
    backgroundColor: '#000', // Black background to match your stream's appearance
  },
});

export default App;
