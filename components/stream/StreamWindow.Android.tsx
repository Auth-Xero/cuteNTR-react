import React, { Component } from 'react';
import { Platform, View, ImageBackground, StyleSheet, Button, Text, BackHandler, TouchableOpacity, PermissionsAndroid, Alert, Dimensions } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import RNFS from 'react-native-fs';
import { FFmpegKit } from 'ffmpeg-kit-react-native';

interface StreamWindowProps {
  isTop: boolean;
  dsIP: string;
  navigateBack: () => void;
  showFps: boolean;
  recordingEnabled: boolean;
  hzModEnabled: boolean;
}

interface StreamWindowState {
  currentPixmap: string | null;
  previousPixmap: string | null;
  connected: boolean;
  scale: number;
  smooth: boolean;
  fullscreen: boolean;
  fps: number;
  recording: boolean;
  frames: Array<string>;
  isLandscape: boolean;
}

class StreamWindow extends Component<StreamWindowProps, StreamWindowState> {
  private mounted: boolean;
  private frameReadyListener: any;
  private frameCount: number = 0;
  private fpsInterval: NodeJS.Timeout | null = null;
  private orientationListener: any;

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
      recording: false,
      frames: [],
      isLandscape: Dimensions.get('window').width > Dimensions.get('window').height,
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
    this.orientationListener = Dimensions.addEventListener('change', this.handleOrientationChange);
  }

  componentWillUnmount() {
    this.mounted = false;
    EventRegister.removeEventListener(this.frameReadyListener);
    BackHandler.removeEventListener('hardwareBackPress', this.handleBackPress);
    this.orientationListener.remove();
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
    }
    if (this.state.recording) {
      this.stopRecording();
    }
  }

  handleOrientationChange = () => {
    const isLandscape = Dimensions.get('window').width > Dimensions.get('window').height;
    this.setState({ isLandscape });
  };

  updateSettings = () => {
    const CONFIG = {
      topScale: 1.0,
      botScale: 1.0,
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
    if (this.mounted && uri.startsWith('data:image/jpeg;base64,/9j/')) {
      this.setState((prevState) => {
        if (prevState.currentPixmap !== uri) {
          return {
            previousPixmap: prevState.currentPixmap,
            currentPixmap: uri,
            frames: prevState.recording ? [...prevState.frames, uri] : prevState.frames,
          };
        }
        return null;
      });
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
    return nextState.currentPixmap !== this.state.currentPixmap || nextState.fullscreen !== this.state.fullscreen || nextState.fps !== this.state.fps || nextState.isLandscape !== this.state.isLandscape;
  }

  startFPSCounter = () => {
    this.frameCount = 0;
    this.setState({ fps: 0 });

    this.fpsInterval = setInterval(() => {
      this.setState({ fps: this.frameCount });
      this.frameCount = 0;
    }, 1000);
  };

  handleRecordButton = () => {
    if (this.state.recording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  };

  startRecording = () => {
    this.setState({ recording: true, frames: [] });
  };

  stopRecording = () => {
    this.setState({ recording: false }, () => {
      this.saveRecording();
    });
  };

  saveRecording = async () => {
    const { frames } = this.state;

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

      if (!granted) {
        console.log('Storage permission denied');
        return;
      }
    } catch (err) {
      console.warn(err);
      return;
    }

    const recordingDir = Platform.OS === 'android'
      ? `${RNFS.ExternalStorageDirectoryPath}/Documents/Recordings`
      : `${RNFS.DocumentDirectoryPath}/Recordings`;
    await RNFS.mkdir(recordingDir);

    const framePaths = await Promise.all(
      frames.map((frame, index) => {
        const framePath = `${RNFS.CachesDirectoryPath}/frame_${index}.jpg`;
        return RNFS.writeFile(framePath, frame.replace('data:image/jpeg;base64,', ''), 'base64').then(() => framePath);
      })
    );

    const frameListPath = `${RNFS.CachesDirectoryPath}/frames.txt`;
    await RNFS.writeFile(frameListPath, framePaths.map((path) => `file '${path}'`).join('\n'));

    const outputFilePath = `${recordingDir}/adorableNTR-${Date.now()}.mp4`;

    const command = `-f concat -safe 0 -i ${frameListPath} -vf "transpose=2" -vsync vfr -pix_fmt yuv420p ${outputFilePath}`;
    FFmpegKit.execute(command).then(async (session) => {
      const returnCode = await session.getReturnCode();
      if (returnCode.isValueSuccess()) {
        console.log('Recording saved successfully');
        Alert.alert('Recording Saved', `The recording has been saved to ${outputFilePath}`);
      } else {
        console.log('Recording failed with return code: ' + returnCode);
      }

      // Clean up temporary files
      await RNFS.unlink(frameListPath);
      await Promise.all(framePaths.map((path) => RNFS.unlink(path)));
    });
  };

  handleStartStopStream = () => {
    if (this.state.connected) {
      this.props.hzModEnabled ? EventRegister.emit('stopHzStream') : EventRegister.emit('stopStream');
    } else {
      this.props.hzModEnabled ? EventRegister.emit('hzStream') : EventRegister.emit('startStream');
    }
    this.setState({ connected: !this.state.connected });
  };

  render() {
    const { currentPixmap, previousPixmap, scale, fullscreen, fps, recording, isLandscape } = this.state;
    const { showFps, recordingEnabled } = this.props;

    const imageStyle = [
      isLandscape ? styles.imageLandscape : styles.imagePortrait,
      { transform: [{ scale }, { rotate: '270deg' }] }
    ];

    const buttonContainerStyle = isLandscape ? styles.buttonContainerLandscape : styles.buttonContainerPortrait;

    return (
      <View style={fullscreen ? styles.fullscreenContainer : styles.container}>       
                {previousPixmap && (
          <ImageBackground
            fadeDuration={0}
            key={`prev_${previousPixmap}`}
            source={{ uri: previousPixmap }}
            style={[imageStyle, styles.previousImage]}
            resizeMode={'contain'}
          />
        )}
        {currentPixmap && (
          <ImageBackground
            fadeDuration={0}
            key={`curr_${currentPixmap}`}
            source={{ uri: currentPixmap }}
            style={imageStyle}
            resizeMode={'contain'}
          />
        )}
        <View style={buttonContainerStyle}>
          {!fullscreen && (
            <Button title="Fullscreen" onPress={this.toggleFullscreen} />
          )}
        </View>
        <View style={styles.backButtonWrapper}>
          <Button title="Back" onPress={this.handleBackPress} />
        </View>
        {showFps && (
          <Text style={styles.fpsCounter}>FPS: {fps}</Text>
        )}
        {recordingEnabled && (
          <TouchableOpacity
            style={styles.recordButton}
            onPress={this.handleRecordButton}
          >
            <Text style={styles.recordButtonText}>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  imageLandscape: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  imagePortrait: {
    width: '75%',
    height: '100%',
    position: 'absolute',
  },
  buttonContainerPortrait: {
    position: 'absolute',
    bottom: '5%',
    left: '5%',
    right: '5%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonContainerLandscape: {
    position: 'absolute',
    bottom: '5%',
    left: '5%',
    right: '5%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previousImage: {
    opacity: 1, // You can adjust this value for desired transparency
  },
  buttonWrapperTop: {
    position: 'absolute',
    left: '5%',
    bottom: '5%',
  },
  backButtonWrapper: {
    position: 'absolute',
    right: '5%',
    bottom: '5%',
  },
  fpsCounter: {
    position: 'absolute',
    top: 10,
    left: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 5,
    borderRadius: 5,
  },
  recordButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'red',
    padding: 10,
    borderRadius: 5,
  },
  recordButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});


export default StreamWindow;
