import React, { Component } from 'react';
import { View, StyleSheet, AppState as RNAppState, Button } from 'react-native';
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
  tScale: number;
  bScale: number;
  smooth: boolean;
  nfcPatchType: number;
  debugging: boolean;
  streaming: boolean;
  remotePlayInitiated: boolean;
  currentScreen: 'Home' | 'StreamWindow';
  isTop: boolean;
}

class App extends Component<{}, AppComponentState> {
  appStateSubscription: any;
  stateChangedListener: any;
  ntrStateChangedListener: any;

  constructor(props: {}) {
    super(props);
    this.state = {
      dsIP: '10.0.0.115',
      qosValue: 105,
      priMode: 1,
      priFact: 5,
      jpegQuality: 80,
      tScale: 1,
      bScale: 1,
      smooth: false,
      nfcPatchType: 0,
      debugging: false,
      streaming: false,
      remotePlayInitiated: false,
      currentScreen: 'Home',
      isTop: true,
    };

    this.startStream = this.startStream.bind(this);
    this.stopStream = this.stopStream.bind(this);
    this.sendNfcPatch = this.sendNfcPatch.bind(this);
    this.navigateToStreamWindow = this.navigateToStreamWindow.bind(this);
    this.navigateBack = this.navigateBack.bind(this);
    this.updateDsIP = this.updateDsIP.bind(this);
    this.handleAppStateChange = this.handleAppStateChange.bind(this);
    this.handleStreamStateChanged = this.handleStreamStateChanged.bind(this);
    this.handleNtrStateChanged = this.handleNtrStateChanged.bind(this);
  }

  componentDidMount() {
    this.appStateSubscription = RNAppState.addEventListener('change', this.handleAppStateChange);
    this.stateChangedListener = EventRegister.addEventListener('stateChanged', (state: string) => this.handleStreamStateChanged(state));
    this.ntrStateChangedListener = EventRegister.addEventListener('ntrStateChanged', (state: string) => this.handleNtrStateChanged(state));
  }

  componentWillUnmount() {
    this.appStateSubscription.remove();
    EventRegister.removeEventListener(this.stateChangedListener);
    EventRegister.removeEventListener(this.ntrStateChangedListener);
  }

  handleAppStateChange(nextAppState: string) {

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

  sendNfcPatch() {
    EventRegister.emit('sendNfcPatch', this.state.nfcPatchType);
  }

  navigateToStreamWindow(isTop: boolean) {
    console.log('Navigating to StreamWindow');
    this.setState({ currentScreen: 'StreamWindow', isTop });
  }

  navigateBack() {
    console.log('Navigating back to Home');
    this.setState({ currentScreen: 'Home' });
  }

  updateDsIP(dsIP: string) {
    this.setState({ dsIP });
  }

  render() {
    const { currentScreen, isTop, dsIP, streaming } = this.state;

    if (currentScreen === 'StreamWindow') {
      return <StreamWindow isTop={isTop} dsIP={dsIP} navigateBack={this.navigateBack} />;
    }

    return (
      <View style={styles.container}>
        <MainWindow
          dsIP={this.state.dsIP}
          qosValue={this.state.qosValue}
          priMode={this.state.priMode}
          priFact={this.state.priFact}
          jpegQuality={this.state.jpegQuality}
          tScale={this.state.tScale}
          bScale={this.state.bScale}
          smooth={this.state.smooth}
          nfcPatchType={this.state.nfcPatchType}
          debugging={this.state.debugging}
          streaming={this.state.streaming}
          startStream={this.startStream}
          stopStream={this.stopStream}
          sendNfcPatch={this.sendNfcPatch}
          updateDsIP={this.updateDsIP}
        />
        <Button title="Go to Stream Window (Top)" onPress={() => this.navigateToStreamWindow(true)} />
        <Button title="Go to Stream Window (Bottom)" onPress={() => this.navigateToStreamWindow(false)} />
        <Ntr dsIP={this.state.dsIP} />
        <NtrUtility dsIP={this.state.dsIP} />
        <StreamWorker dsIP={this.state.dsIP} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
});

export default App;