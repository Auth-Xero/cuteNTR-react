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
  ActivityIndicator,
} from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import RNFS from 'react-native-fs';
import { FFmpegKit } from 'ffmpeg-kit-react-native';
import { requireNativeComponent } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

interface JpegVideoViewProps {
  frame: string | null;
  style?: any;
}
const JpegVideoView = requireNativeComponent<JpegVideoViewProps>('JpegVideoView');

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
  bothViewEnabled?: boolean; 
  dsIP: string;
  navigateBack: () => void;
  showFps: boolean;
  recordingEnabled: boolean;
  hzModEnabled: boolean;
}

interface StreamWindowState {
  currentFrame: string | null;
  currentFrameTop: string | null;
  currentFrameBottom: string | null;
  fps: number;
  fpsTop: number;
  fpsBottom: number;
  recording: boolean;
  frames: string[];
  framesTop: string[];
  framesBottom: string[];
  fullscreen: boolean;
  isLandscape: boolean;
  isExporting: boolean;
  exportProgress: number;
}

class StreamWindow extends Component<StreamWindowProps, StreamWindowState> {
  private mounted: boolean = false;
  private frameReadyListener: any;
  private frameCount: number = 0;
  private frameCountTop: number = 0;
  private frameCountBottom: number = 0;
  private fpsInterval: NodeJS.Timeout | null = null;
  private orientationListener: any;
  private recordingStartTime: number = 0;

  constructor(props: StreamWindowProps) {
    super(props);
    this.state = {
      currentFrame: null,
      currentFrameTop: null,
      currentFrameBottom: null,
      fps: 0,
      fpsTop: 0,
      fpsBottom: 0,
      recording: false,
      frames: [],
      framesTop: [],
      framesBottom: [],
      fullscreen: false,
      isLandscape: Dimensions.get('window').width > Dimensions.get('window').height,
      isExporting: false,
      exportProgress: 0,
    };
    this.frameReadyListener = EventRegister.addEventListener('frameReady', this.renderFrame);
    BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);
  }

  delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

  componentDidMount() {
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
    if (this.fpsInterval) clearInterval(this.fpsInterval);
    if (this.state.recording) this.stopRecording();
  }

  handleOrientationChange = () => {
    const isLandscape = Dimensions.get('window').width > Dimensions.get('window').height;
    this.setState({ isLandscape });
  };

  renderFrame = ({ uri, isTop }: { uri: string; isTop: boolean }) => {
    if (!this.mounted || !uri.startsWith('data:image/jpeg;base64,/9j/')) return;
    if (this.props.bothViewEnabled) {
      if (isTop) {
        this.setState(prev => ({
          currentFrameTop: uri,
          framesTop: prev.recording ? [...prev.framesTop, uri] : prev.framesTop,
        }));
        this.frameCountTop += 1;
      } else {
        this.setState(prev => ({
          currentFrameBottom: uri,
          framesBottom: prev.recording ? [...prev.framesBottom, uri] : prev.framesBottom,
        }));
        this.frameCountBottom += 1;
      }
    } else {
      if (isTop === this.props.isTop) {
        this.setState(prev => ({
          currentFrame: uri,
          frames: prev.recording ? [...prev.frames, uri] : prev.frames,
        }));
        this.frameCount += 1;
      }
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
    this.frameCountTop = 0;
    this.frameCountBottom = 0;
    this.setState({ fps: 0, fpsTop: 0, fpsBottom: 0 });
    this.fpsInterval = setInterval(() => {
      if (this.props.bothViewEnabled) {
        this.setState({ fpsTop: this.frameCountTop, fpsBottom: this.frameCountBottom });
        this.frameCountTop = 0;
        this.frameCountBottom = 0;
      } else {
        this.setState({ fps: this.frameCount });
        this.frameCount = 0;
      }
    }, 1000);
  };

  toggleFullscreen = () => {
    this.setState(prev => ({ fullscreen: !prev.fullscreen }));
  };

  handleRecordButton = () => {
    if (this.state.recording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  };

  startRecording = () => {
    if (this.props.bothViewEnabled) {
      this.setState({ recording: true, framesTop: [], framesBottom: [] });
    } else {
      this.setState({ recording: true, frames: [] });
    }
  };

  stopRecording = () => {
    this.setState({ recording: false }, () => {
      this.saveRecording();
    });
  };

  writeFrameFile = async (path: string, data: string): Promise<string> => {
    try {
      await RNFS.writeFile(path, data.replace('data:image/jpeg;base64,', ''), 'base64');
      const exists = await RNFS.exists(path);
      if (!exists) {
        throw new Error(`File not found after writing: ${path}`);
      }
      return path;
    } catch (error) {
      console.error('Error writing frame file:', path, error);
      throw error;
    }
  };

  async saveRecording() {

    const recordingDurationInSeconds = (Date.now() - this.recordingStartTime) / 1000;
    if (recordingDurationInSeconds <= 0) {
      Alert.alert('Error', 'Recording duration is too short.');
      return;
    }

    const recordingDirectory =
      Platform.OS === 'android'
        ? `${RNFS.ExternalStorageDirectoryPath}/Documents/Recordings`
        : `${RNFS.DocumentDirectoryPath}/Recordings`;

    await RNFS.mkdir(recordingDirectory);

    this.setState({ isExporting: true, exportProgress: 0 });

    if (this.props.bothViewEnabled) {
      const { framesTop, framesBottom } = this.state;
      if (framesTop.length === 0 || framesBottom.length === 0) {
        Alert.alert('No frames captured', 'Recording did not capture frames from both streams.');
        this.setState({ isExporting: false });
        return;
      }

      const topFPS = Math.round(framesTop.length / recordingDurationInSeconds) || 30;
      const bottomFPS = Math.round(framesBottom.length / recordingDurationInSeconds) || 30;

      const maxFrameCount = Math.max(framesTop.length, framesBottom.length);
      const paddedTopFrames =
        framesTop.length < maxFrameCount
          ? framesTop.concat(Array(maxFrameCount - framesTop.length).fill(framesTop[framesTop.length - 1]))
          : framesTop;
      const paddedBottomFrames =
        framesBottom.length < maxFrameCount
          ? framesBottom.concat(Array(maxFrameCount - framesBottom.length).fill(framesBottom[framesBottom.length - 1]))
          : framesBottom;

      const chunkArray = (arr: string[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };
      const chunkSize = 5;

      const topFramePaths: string[] = [];
      const topChunks = chunkArray(paddedTopFrames, chunkSize);
      for (let chunkIndex = 0; chunkIndex < topChunks.length; chunkIndex++) {
        const chunk = topChunks[chunkIndex];
        const chunkPaths = await Promise.all(
          chunk.map((frame, index) => {
            const globalIndex = chunkIndex * chunkSize + index;
            const path = `${RNFS.CachesDirectoryPath}/frame_top_${globalIndex}.jpg`;
            return this.writeFrameFile(path, frame);
          })
        );
        topFramePaths.push(...chunkPaths);
        await this.delay(64);
      }

      const bottomFramePaths: string[] = [];
      const bottomChunks = chunkArray(paddedBottomFrames, chunkSize);
      for (let chunkIndex = 0; chunkIndex < bottomChunks.length; chunkIndex++) {
        const chunk = bottomChunks[chunkIndex];
        const chunkPaths = await Promise.all(
          chunk.map((frame, index) => {
            const globalIndex = chunkIndex * chunkSize + index;
            const path = `${RNFS.CachesDirectoryPath}/frame_bottom_${globalIndex}.jpg`;
            return this.writeFrameFile(path, frame);
          })
        );
        bottomFramePaths.push(...chunkPaths);
        await this.delay(64);
      }

      for (let i = 0; i < paddedBottomFrames.length; i++) {
        const filePath = `${RNFS.CachesDirectoryPath}/frame_bottom_${i}.jpg`;
        let exists = await RNFS.exists(filePath);
        if (!exists) {
          console.warn(`Bottom frame missing at index ${i}, waiting for file...`);
          await this.delay(200);
          exists = await RNFS.exists(filePath);
          if (!exists) {
            console.warn(`Bottom frame still missing at index ${i}, writing duplicate of the last frame.`);
            await this.writeFrameFile(filePath, paddedBottomFrames[paddedBottomFrames.length - 1]);
            bottomFramePaths.push(filePath);
          }
        }
      }

      const topVideoPath = `${RNFS.CachesDirectoryPath}/video_top.mp4`;
      const bottomVideoPath = `${RNFS.CachesDirectoryPath}/video_bottom.mp4`;
      const outputFilePath = `${recordingDirectory}/recording-${Date.now()}.mp4`;

      await this.delay(5000);

      const commandTop = `-y -framerate ${topFPS} -i ${RNFS.CachesDirectoryPath}/frame_top_%d.jpg -c:v h264_mediacodec -b:v 5M -g ${topFPS} -pix_fmt yuv420p -movflags +faststart ${topVideoPath}`;
      await FFmpegKit.executeAsync(commandTop, async (session) => {
        const returnCode = await session.getReturnCode();
        if (!returnCode.isValueSuccess()) {
          Alert.alert('Error', 'Failed to export top video.');
          this.setState({ isExporting: false });
          return;
        }
      });

      await this.delay(5000);

      const commandBottom = `-y -framerate ${bottomFPS} -i ${RNFS.CachesDirectoryPath}/frame_bottom_%d.jpg -c:v h264_mediacodec -b:v 5M -g ${bottomFPS} -pix_fmt yuv420p -movflags +faststart ${bottomVideoPath}`;
      await FFmpegKit.executeAsync(commandBottom, async (session) => {
        const returnCode = await session.getReturnCode();
        if (!returnCode.isValueSuccess()) {
          Alert.alert('Error', 'Failed to export bottom video.');
          this.setState({ isExporting: false });
          return;
        }
      });

      await this.delay(5000);

      const commandStack = `-y -i ${topVideoPath} -i ${bottomVideoPath} -filter_complex "[0:v]setpts=PTS-STARTPTS[top];[1:v]setpts=PTS-STARTPTS[bottom];[top][bottom]vstack=inputs=2,transpose=2" -c:v h264_mediacodec -b:v 5M -pix_fmt yuv420p -movflags +faststart ${outputFilePath}`;
      FFmpegKit.executeAsync(
        commandStack,
        async (session) => {
          const returnCode = await session.getReturnCode();
          this.setState({ isExporting: false, exportProgress: 0 });
          if (returnCode.isValueSuccess()) {
            Alert.alert('Recording Saved', `Recording saved to ${outputFilePath}`);
          } else {
            Alert.alert('Recording Failed', 'Error exporting combined video.');
          }

          await Promise.all(topFramePaths.map(p => RNFS.unlink(p)));
          await Promise.all(bottomFramePaths.map(p => RNFS.unlink(p)));
        },
        (log) => {
          console.log(log.getMessage());
        },
        (statistics) => {

          const commonDuration = Math.max(
            (paddedTopFrames.length / topFPS) * 1000,
            (paddedBottomFrames.length / bottomFPS) * 1000
          );
          const time = statistics.getTime();
          const progress = Math.min(time / commonDuration, 1);
          this.setState({ exportProgress: progress });
        }
      );
    } else {

      const { frames } = this.state;
      if (frames.length === 0) {
        Alert.alert('No frames captured', 'Recording did not capture any frames.');
        this.setState({ isExporting: false });
        return;
      }
      const averageFPS = Math.round(frames.length / recordingDurationInSeconds) || 30;
      const totalDuration = (frames.length / averageFPS) * 1000;
      this.setState({ isExporting: true, exportProgress: 0 });
      const chunkArray = (arr: string[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };
      const chunkSize = 10;
      const framePaths: string[] = [];
      const frameChunks = chunkArray(frames, chunkSize);
      for (let chunkIndex = 0; chunkIndex < frameChunks.length; chunkIndex++) {
        const chunk = frameChunks[chunkIndex];
        const chunkPaths = await Promise.all(
          chunk.map((frame, index) => {
            const globalIndex = chunkIndex * chunkSize + index;
            const framePath = `${RNFS.CachesDirectoryPath}/frame_${globalIndex}.jpg`;
            return this.writeFrameFile(framePath, frame);
          })
        );
        framePaths.push(...chunkPaths);
        await this.delay(100);
      }

      await this.delay(1000);

      const outputFilePath = `${recordingDirectory}/recording-${Date.now()}.mp4`;
      const command = `-y -framerate ${averageFPS} -i ${RNFS.CachesDirectoryPath}/frame_%d.jpg -vf "transpose=2" -c:v h264_mediacodec -b:v 5M -pix_fmt yuv420p -movflags +faststart ${outputFilePath}`;
      FFmpegKit.executeAsync(
        command,
        async (session) => {
          const returnCode = await session.getReturnCode();
          this.setState({ isExporting: false, exportProgress: 0 });
          if (returnCode.isValueSuccess()) {
            Alert.alert('Recording Saved', `The recording has been saved to ${outputFilePath}`);
          } else {
            Alert.alert('Recording Failed', 'There was an error exporting the recording.');
          }
          await Promise.all(framePaths.map(p => RNFS.unlink(p)));
        },
        (log) => {
          console.log(log.getMessage());
        },
        (statistics) => {
          const time = statistics.getTime();
          const progress = Math.min(time / totalDuration, 1);
          this.setState({ exportProgress: progress });
        }
      );
    }
  }

  render() {
    const {
      currentFrame,
      currentFrameTop,
      currentFrameBottom,
      fullscreen,
      fps,
      fpsTop,
      fpsBottom,
      recording,
      isExporting,
      exportProgress,
    } = this.state;
    const videoTransform = [{ rotate: '0deg' }];
    return (
      <View style={fullscreen ? styles.fullscreenContainer : styles.container}>
        <StatusBar hidden={fullscreen} />
        {this.props.bothViewEnabled ? (
          <View style={styles.splitContainer}>
            <View style={styles.splitSection}>
              <SingletonJpegVideoView style={[styles.video, { transform: videoTransform }]} frame={currentFrameTop} />
              {this.props.showFps && <Text style={styles.fpsText}>Top FPS: {fpsTop}</Text>}
            </View>
            <View style={styles.splitSection}>
              <SingletonJpegVideoView style={[styles.video, { transform: videoTransform }]} frame={currentFrameBottom} />
              {this.props.showFps && <Text style={styles.fpsText}>Bottom FPS: {fpsBottom}</Text>}
            </View>
          </View>
        ) : (
          <SingletonJpegVideoView style={[styles.video, { transform: videoTransform }]} frame={currentFrame} />
        )}
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
        {!fullscreen && (
          <View style={styles.bottomBar}>
            {this.props.showFps && !this.props.bothViewEnabled && (
              <View style={styles.fpsContainer}>
                <Ionicons name="speedometer" size={20} color="#FFF" />
                <Text style={styles.fpsText}>FPS: {fps}</Text>
              </View>
            )}
            {this.props.recordingEnabled && (
              <TouchableOpacity style={styles.recordButton} onPress={this.handleRecordButton}>
                <Ionicons name={recording ? 'stop-circle' : 'radio-button-on'} size={40} color={recording ? '#CF6679' : '#FF1744'} />
              </TouchableOpacity>
            )}
          </View>
        )}
        {isExporting && (
          <View style={styles.exportOverlay}>
            <ActivityIndicator size="large" color="#FF1744" />
            <Text style={styles.exportProgressText}>Exporting... {Math.round(exportProgress * 100)}%</Text>
          </View>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  fullscreenContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#121212', zIndex: 999 },
  video: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  iconButton: { padding: 5 },
  fpsContainer: { flexDirection: 'row', alignItems: 'center' },
  fpsText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginLeft: 5 },
  recordButton: { padding: 5 },
  exportOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  exportProgressText: { marginTop: 10, fontSize: 18, color: '#FFF' },
  splitContainer: { flex: 1 },
  splitSection: { flex: 1, borderBottomWidth: 1, borderColor: '#333' },
});

export default StreamWindow;