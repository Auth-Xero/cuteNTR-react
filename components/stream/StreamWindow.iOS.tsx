import React, { Component } from 'react';
import {
  Platform,
  View,
  StyleSheet,
  Text,
  BackHandler,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import RNFS from 'react-native-fs';
import { FFmpegKit } from 'ffmpeg-kit-react-native';
import { requireNativeComponent } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

// Native JPEG video view component
interface JpegVideoViewProps {
  frame: string | null;
  style?: any;
}

const JpegVideoView = requireNativeComponent<JpegVideoViewProps>('JpegVideoView');

// Singleton wrapper for the native view
class SingletonJpegVideoView extends Component<JpegVideoViewProps> {
  private static instance: SingletonJpegVideoView | null = null;

  constructor(props: JpegVideoViewProps) {
    super(props);
    if (SingletonJpegVideoView.instance) {
      console.warn('SingletonJpegVideoView already exists. Reusing the existing instance.');
    } else {
      SingletonJpegVideoView.instance = this;
    }
  }

  componentWillUnmount() {
    if (SingletonJpegVideoView.instance === this) {
      SingletonJpegVideoView.instance = null;
    }
  }

  render() {
    return <JpegVideoView {...this.props} />;
  }
}

interface StreamWindowProps {
  isTop: boolean;
  dsIP: string;
  navigateBack: () => void;
  showFps: boolean;
  recordingEnabled: boolean;
  hzModEnabled: boolean;
}

interface StreamWindowState {
  currentFrame: string | null;
  connected: boolean;
  fps: number;
  recording: boolean;
  frames: string[];
  fullscreen: boolean;
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
      currentFrame: null,
      connected: false,
      fps: 0,
      recording: false,
      frames: [],
      fullscreen: false,
      isLandscape: Dimensions.get('window').width > Dimensions.get('window').height,
    };

    this.mounted = false;
    this.frameReadyListener = EventRegister.addEventListener('frameReady', this.renderFrame);
    BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);
  }

  componentDidMount() {
    console.log('StreamWindow mounted');
    this.mounted = true;
    this.startFPSCounter();
    this.orientationListener = Dimensions.addEventListener('change', this.handleOrientationChange);
  }

  componentWillUnmount() {
    this.mounted = false;
    EventRegister.removeEventListener(this.frameReadyListener);
    BackHandler.removeEventListener('hardwareBackPress', this.handleBackPress);
    if (this.orientationListener && this.orientationListener.remove) {
      this.orientationListener.remove();
    }
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
    console.log('Orientation changed, isLandscape:', isLandscape);
  };

  renderFrame = ({ uri, isTop }: { uri: string; isTop: boolean }) => {
    try {
      if (
        this.mounted &&
        isTop === this.props.isTop &&
        uri.startsWith('data:image/jpeg;base64,/9j/')
      ) {
        this.setState((prevState) => ({
          currentFrame: uri,
          frames: prevState.recording ? [...prevState.frames, uri] : prevState.frames,
        }));
        this.frameCount += 1;
      }
    } catch (error) {
      console.error('Error processing frame:', error);
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

  startFPSCounter = () => {
    this.frameCount = 0;
    this.setState({ fps: 0 });
    this.fpsInterval = setInterval(() => {
      this.setState({ fps: this.frameCount });
      this.frameCount = 0;
    }, 1000);
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
    if (frames.length === 0) {
      Alert.alert('No frames captured', 'Recording did not capture any frames.');
      return;
    }

    const recordingDir =
      Platform.OS === 'android'
        ? `${RNFS.ExternalStorageDirectoryPath}/Documents/Recordings`
        : `${RNFS.DocumentDirectoryPath}/Recordings`;
    await RNFS.mkdir(recordingDir);

    // Write each frame as a JPEG file
    const framePaths = await Promise.all(
      frames.map((frame, index) => {
        const framePath = `${RNFS.CachesDirectoryPath}/frame_${index}.jpg`;
        return RNFS.writeFile(framePath, frame.replace('data:image/jpeg;base64,', ''), 'base64').then(
          () => framePath,
        );
      }),
    );

    // Create a list file for FFmpeg
    const frameListPath = `${RNFS.CachesDirectoryPath}/frames.txt`;
    await RNFS.writeFile(
      frameListPath,
      framePaths.map((path) => `file '${path}'`).join('\n'),
    );

    const outputFilePath = `${recordingDir}/recording-${Date.now()}.mp4`;

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

  render() {
    const { currentFrame, fullscreen, fps, recording, isLandscape } = this.state;
    // Adjust video transformation as needed based on orientation
    const videoTransform = [{ rotate: '0deg' }];

    return (
      <View style={fullscreen ? styles.fullscreenContainer : styles.container}>
        <StatusBar hidden={fullscreen} />
        <SingletonJpegVideoView
          style={[styles.video, { transform: videoTransform }]}
          frame={currentFrame}
        />

        {/* Render the top bar only when NOT in full screen */}
        {!fullscreen && (
          <View style={styles.topBar}>
            <TouchableOpacity onPress={this.handleBackPress} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={28} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={this.toggleFullscreen} style={styles.iconButton}>
              <Ionicons name={fullscreen ? 'contract' : 'expand'} size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Render the bottom bar only when NOT in full screen */}
        {!fullscreen && (
          <View style={styles.bottomBar}>
            {this.props.showFps && (
              <View style={styles.fpsContainer}>
                <Ionicons name="speedometer" size={20} color="#FFF" />
                <Text style={styles.fpsText}>FPS: {fps}</Text>
              </View>
            )}
            {this.props.recordingEnabled && (
              <TouchableOpacity style={styles.recordButton} onPress={this.handleRecordButton}>
                <Ionicons
                  name={recording ? 'stop-circle' : 'radio-button-on'}
                  size={40}
                  color={recording ? '#CF6679' : '#FF1744'}
                />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  fullscreenContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#121212',
    zIndex: 999,
  },
  video: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  iconButton: {
    padding: 5,
  },
  fpsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fpsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 5,
  },
  recordButton: {
    padding: 5,
  },
});

export default StreamWindow;
