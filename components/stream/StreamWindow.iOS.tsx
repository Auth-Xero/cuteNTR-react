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
      recording: false,
      fps: 0,
      frames: [],
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
    if (this.state.recording) {
      this.stopRecording();
    }
  }
startRecording = () => {
    this.setState({ recording: true, frames: [] });
  };

  stopRecording = () => {
    this.setState({ recording: false }, () => {
      this.saveRecording();
    });
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
    if (this.mounted && isTop === this.props.isTop) {
      this.setState((prevState) => ({
        previousPixmap: prevState.currentPixmap,
        currentPixmap: uri,
	frames: prevState.recording ? [...prevState.frames, uri] : prevState.frames,
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
handleRecordButton = () => {
    if (this.state.recording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
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
    const { currentPixmap, previousPixmap, scale, smooth, fullscreen, recording, fps } = this.state;
    const { showFps,recordingEnabled } = this.props;
    const { width, height } = Dimensions.get('window');

    const imageStyle = [
      styles.image,
      { transform: [{ scale }, { rotate: '0deg' }] }
    ];

    return (
      <View style={fullscreen ? styles.fullscreenContainer : styles.container}>
        {previousPixmap && (
          <ImageBackground
            fadeDuration={0}
            key={previousPixmap}
            source={{ uri: previousPixmap }}
            style={imageStyle}
            resizeMode={smooth ? 'contain' : 'cover'}
          />
        )}
        {currentPixmap && (
          <ImageBackground
            fadeDuration={0}
            key={currentPixmap}
            source={{ uri: currentPixmap }}
            style={imageStyle}
            resizeMode={smooth ? 'contain' : 'cover'}
          />
        )}
        {!fullscreen && (
          <View style={styles.buttonContainer}>
            <View style={styles.buttonWrapperTop}>
              <Button title="Fullscreen" onPress={this.toggleFullscreen} />
            </View>
            <View style={styles.buttonWrapperBottom}>
              <Button title="Back" onPress={this.handleBackPress} />
            </View>
          </View>
        )}
        {showFps && (
          <Text style={styles.fpsCounter}>FPS: {fps}</Text>
        )}
	{recordingEnabled && (
          <>
            <TouchableOpacity
              style={styles.recordButton}
              onPress={this.handleRecordButton}
            >
              <Text style={styles.recordButtonText}>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
            </TouchableOpacity>
          </>
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
  fullscreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  buttonContainer: {
    position: 'absolute',
    left: 10,
    justifyContent: 'space-between',
    height: '90%',
  },
  buttonWrapperTop: {
    transform: [{ rotate: '90deg' }],
    marginTop: 20,
  },
  buttonWrapperBottom: {
    transform: [{ rotate: '90deg' }],
    marginBottom: 20,
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
recordButton: {
    transform: [{ rotate: '90deg' }],
    position: 'absolute',
    bottom: 50,
    right: 10,
    backgroundColor: 'red',
    padding: 10,
    borderRadius: 5,
  },
  recordButtonText: {
    color: 'white',
    fontWeight: 'bold',
  }
});

export default StreamWindow;