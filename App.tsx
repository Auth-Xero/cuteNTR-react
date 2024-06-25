import React, { Component } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import MainWindow from './components/MainWindow';
import Ntr from './components/ntr/Ntr';
import NtrUtility from './components/ntr/NtrUtility';
import StreamWorker from './components/stream/StreamWorker';
import StreamWindow from './components/stream/StreamWindow';
import { EventRegister } from 'react-native-event-listeners';

interface AppComponentState {
  dsIP: string;
  qosValue: number;
  priMode: number;
  priFact: number;
  jpegQuality: number;
  debugging: boolean;
  streaming: boolean;
  remotePlayInitiated: boolean;
  currentScreen: 'Home' | 'StreamWindow';
  isTop: boolean;
  showFps: boolean;
}

class App extends Component<{}, AppComponentState> {
  private appStateSubscription: any;
  private stateChangedListener: any;
  private ntrStateChangedListener: any;

  constructor(props: {}) {
    super(props);
    this.state = {
      dsIP: '11.7.0.30',
      qosValue: 105,
      priMode: 1,
      priFact: 5,
      jpegQuality: 80,
      debugging: false,
      streaming: false,
      remotePlayInitiated: false,
      currentScreen: 'Home',
      isTop: true,
      showFps: false,
    };

    this.startStream = this.startStream.bind(this);
    this.stopStream = this.stopStream.bind(this);
    this.navigateToStreamWindow = this.navigateToStreamWindow.bind(this);
    this.navigateBack = this.navigateBack.bind(this);
    this.updateDsIP = this.updateDsIP.bind(this);
    this.handleAppStateChange = this.handleAppStateChange.bind(this);
    this.handleStreamStateChanged = this.handleStreamStateChanged.bind(this);
    this.handleNtrStateChanged = this.handleNtrStateChanged.bind(this);
  }

  componentDidMount() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    this.stateChangedListener = EventRegister.addEventListener('stateChanged', (state: string) => this.handleStreamStateChanged(state));
    this.ntrStateChangedListener = EventRegister.addEventListener('ntrStateChanged', (state: string) => this.handleNtrStateChanged(state));
  }

  componentWillUnmount() {
    this.appStateSubscription.remove();
    EventRegister.removeEventListener(this.stateChangedListener);
    EventRegister.removeEventListener(this.ntrStateChangedListener);
    this.stopStream(); // Ensure the stream is stopped when the component unmounts
  }

  handleAppStateChange(nextAppState: string) {
    if (nextAppState.match(/inactive|background/)) {
      this.stopStream(); // Stop the stream when the app goes to the background
    }
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
      this.setState({ streaming: true });
      EventRegister.emit('ntrConnectToDs');
    } else if (state === 'Disconnected') {
      this.setState({ streaming: false, remotePlayInitiated: false });
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

  navigateToStreamWindow(isTop: boolean, showFps: boolean) {
    console.log('Navigating to StreamWindow');
    this.setState({ currentScreen: 'StreamWindow', isTop, showFps });
  }

  navigateBack() {
    console.log('Navigating back to Home');
    this.setState({ currentScreen: 'Home' });
    // Do not stop the stream here
  }

  updateDsIP(dsIP: string) {
    this.setState({ dsIP });
  }

  render() {
    const { currentScreen, isTop, dsIP, streaming, priMode, priFact, jpegQuality, qosValue, showFps } = this.state;

    return (
      <View style={styles.container}>
        {currentScreen === 'StreamWindow' ? (
          <StreamWindow isTop={isTop} dsIP={dsIP} navigateBack={this.navigateBack} showFps={showFps} />
        ) : (
          <MainWindow
            dsIP={this.state.dsIP}
            qosValue={this.state.qosValue}
            priMode={this.state.priMode}
            priFact={this.state.priFact}
            jpegQuality={this.state.jpegQuality}
            debugging={this.state.debugging}
            streaming={this.state.streaming}
            startStream={this.startStream}
            stopStream={this.stopStream}
            updateDsIP={this.updateDsIP}
            navigateToStreamWindow={this.navigateToStreamWindow}
          />
        )}
        <Ntr dsIP={dsIP} screenPriority={priMode} priFact={priFact} jpegq={jpegQuality} qosvalue={qosValue} />
        <NtrUtility dsIP={this.state.dsIP} />
        <StreamWorker dsIP={this.state.dsIP} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
    margin: 0,
    backgroundColor: '#000', // Ensure the background color is black to avoid any visible borders
  },
});

export default App;
