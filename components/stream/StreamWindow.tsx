import React, { Component } from 'react';
import { View, ImageBackground, StyleSheet, Button, BackHandler, Text } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';

interface StreamWindowProps {
  isTop: boolean;
  dsIP: string;
  navigateBack: () => void;
  showFps: boolean;
}

interface StreamWindowState {
  currentPixmap: string | null;
  previousPixmap: string | null;
  connected: boolean;
  scale: number;
  smooth: boolean;
  fullscreen: boolean;
  fps: number;
}

class StreamWindow extends Component<StreamWindowProps, StreamWindowState> {
  private mounted: boolean;
  private frameReadyListener: any;
  private frameCount: number = 0;
  private fpsInterval: NodeJS.Timeout | null = null;

  constructor(props: StreamWindowProps) {
    super(props);
    this.state = {
      currentPixmap: null,
      previousPixmap: null,
      connected: false,
      scale: 1,
      smooth: false,
      fullscreen: false,
      fps: 0,
    };

    this.mounted = false;

    this.frameReadyListener = EventRegister.addEventListener('frameReady', this.renderFrame);

    BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);
  }

  componentDidMount() {
    console.log('StreamWindow mounted');
    this.mounted = true;
    this.updateSettings();
    this.startFPSCounter();
  }

  componentWillUnmount() {
    this.mounted = false;
    EventRegister.removeEventListener(this.frameReadyListener);
    BackHandler.removeEventListener('hardwareBackPress', this.handleBackPress);
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
    }
  }

  updateSettings = () => {
    const CONFIG = {
      topScale: 0.9,
      botScale: 0.9,
      smoothing: false,
    };

    if (this.mounted) {
      this.setState({
        smooth: CONFIG.smoothing,
        scale: this.props.isTop ? CONFIG.topScale : CONFIG.botScale,
      });
    }
  };

  renderFrame = ({ uri, isTop }: { uri: string; isTop: boolean }) => {
    if (this.mounted && isTop === this.props.isTop) {
      this.setState((prevState) => ({
        previousPixmap: prevState.currentPixmap,
        currentPixmap: uri,
      }));
      this.frameCount += 1;
    }
  };

  handleBackPress = () => {
    if (this.state.fullscreen) {
      this.toggleFullscreen();
      return true;
    }
    this.props.navigateBack();
    return true;
  };

  toggleFullscreen = () => {
    this.setState((prevState) => ({ fullscreen: !prevState.fullscreen }));
  };

  shouldComponentUpdate(nextProps: StreamWindowProps, nextState: StreamWindowState) {
    return nextState.currentPixmap !== this.state.currentPixmap || nextState.fullscreen !== this.state.fullscreen || nextState.fps !== this.state.fps;
  }

  startFPSCounter = () => {
    this.frameCount = 0;
    this.setState({ fps: 0 });

    this.fpsInterval = setInterval(() => {
      this.setState({ fps: this.frameCount });
      this.frameCount = 0;
    }, 1000);
  };

  render() {
    const { currentPixmap, previousPixmap, scale, smooth, fullscreen, fps } = this.state;
    const { showFps } = this.props;

    return (
      <View style={styles.container}>
        {previousPixmap && (
          <ImageBackground
            fadeDuration={0}
            key={previousPixmap}
            source={{ uri: previousPixmap }}
            style={[styles.image, { transform: [{ scale }] }]}
            resizeMode={smooth ? 'contain' : 'cover'}
          />
        )}
        {currentPixmap && (
          <ImageBackground
            fadeDuration={0}
            key={currentPixmap}
            source={{ uri: currentPixmap }}
            style={[styles.image, { transform: [{ scale }] }]}
            resizeMode={smooth ? 'contain' : 'cover'}
          />
        )}
        {!fullscreen && (
          <View style={styles.buttonContainer}>
            <Button title="Fullscreen" onPress={this.toggleFullscreen} />
            <Button title="Back" onPress={this.handleBackPress} />
          </View>
        )}
        {showFps && (
          <Text style={styles.fpsCounter}>FPS: {fps}</Text>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'gray',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
  fpsCounter: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 5,
    borderRadius: 5,
  },
});

export default StreamWindow;
