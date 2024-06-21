import React, { Component } from 'react';
import { View, ImageBackground, StyleSheet, Button, BackHandler } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';

interface StreamWindowProps {
  isTop: boolean;
  dsIP: string;
  navigateBack: () => void;
}

interface StreamWindowState {
  pixmap: string | null;
  connected: boolean;
  scale: number;
  smooth: boolean;
  fullscreen: boolean;
}

class StreamWindow extends Component<StreamWindowProps, StreamWindowState> {
  private mounted: boolean;
  private frameReadyListener: any;

  constructor(props: StreamWindowProps) {
    super(props);
    this.state = {
      pixmap: null,
      connected: false,
      scale: 1,
      smooth: false,
      fullscreen: false,
    };

    this.mounted = false;

    this.frameReadyListener = EventRegister.addEventListener('frameReady', this.renderFrame);

    BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);
  }

  componentDidMount() {
    console.log('StreamWindow mounted');
    this.mounted = true;
    this.updateSettings();
  }

  componentWillUnmount() {
    this.mounted = false;
    EventRegister.removeEventListener(this.frameReadyListener);
    BackHandler.removeEventListener('hardwareBackPress', this.handleBackPress);
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

      this.setState({ pixmap: uri });
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
    return nextState.pixmap !== this.state.pixmap || nextState.fullscreen !== this.state.fullscreen;
  }

  render() {
    const { pixmap, scale, smooth, fullscreen } = this.state;

    return (
      <View style={styles.container}>
        {pixmap && (
          <ImageBackground
            fadeDuration={0}
            key={pixmap} 
            source={{ uri: pixmap }}
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
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
});

export default StreamWindow;