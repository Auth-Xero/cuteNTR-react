import React, { Component } from 'react';
import { NativeModules, View, Text, StyleSheet } from 'react-native';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import { EventRegister } from 'react-native-event-listeners';

const { StreamWorkerModule } = NativeModules;

interface StreamWorkerProps {
  dsIP: string;
}

interface StreamWorkerState {
  connected: boolean;
  fps: number;
}

interface ProcessPacketsResult {
  jpeg: string;
  isTop: boolean;
}

class StreamWorker extends Component<StreamWorkerProps, StreamWorkerState> {
  private socket: any;
  private abort: boolean = false;
  private streamReadyListener: any;
  private stopStreamListener: any;
  private framePackets: Map<string, Array<Buffer>> = new Map();
  private framePacketCounts: Map<string, number> = new Map();
  private frameCount: number = 0;
  private fpsInterval: NodeJS.Timeout | null = null;

  constructor(props: StreamWorkerProps) {
    super(props);

    this.state = {
      connected: false,
      fps: 0,
    };

    this.streamReadyListener = EventRegister.addEventListener('stream', this.startStream);
    this.stopStreamListener = EventRegister.addEventListener('stopStream', this.stopStream);
  }

  componentWillUnmount() {
    EventRegister.removeEventListener(this.streamReadyListener);
    EventRegister.removeEventListener(this.stopStreamListener);
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
    }
  }

  startStream = () => {
    this.abort = false;
    if (!this.state.connected) {
      this.socket = dgram.createSocket({ type: 'udp4' });
      this.socket.on('message', this.handleMessage);
      this.socket.bind(8001, () => {
        this.setState({ connected: true });
        EventRegister.emit('stateChanged', 'Connected');
        console.log('Socket bound and listening on port 8001');
      });

      this.socket.on('error', (err: Error) => {
        console.error('Socket error:', err);
        this.stopStream();
      });

      this.startFPSCounter();
    }
  };

  stopStream = () => {
    this.abort = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.setState({ connected: false });
      EventRegister.emit('stateChanged', 'Disconnected');
      console.log('Socket closed and stream stopped');
    }
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
  };

  startFPSCounter = () => {
    this.frameCount = 0;
    this.setState({ fps: 0 });

    this.fpsInterval = setInterval(() => {
      this.setState({ fps: this.frameCount });
      this.frameCount = 0;
    }, 1000);
  };

  handleMessage = (msg: Buffer) => {
    const header = this.readPacketHeader(msg);
    const frameId = header[0];
    const screenId = header[1] & 0x0F;
    const packetNumber = header[2];
    const key = `${frameId}-${screenId}`;

    if (!this.framePackets.has(key)) {
      this.framePackets.set(key, []);
      this.framePacketCounts.set(key, 0);
    }

    const packets = this.framePackets.get(key)!;
    packets.push(msg);

    if ((header[1] & 0xF0) === 0x10) {
      // End of frame
      const expectedPacketCount = packetNumber + 1;
      const receivedPacketCount = packets.length;

      if (expectedPacketCount !== receivedPacketCount) {
        console.warn(`Dropping frame ${frameId} due to missing packets.`);
        this.framePackets.delete(key);
        return;
      }

      this.processFrame(key, packets);
      this.framePackets.delete(key);
    }
  };

  processFrame = async (key: string, packets: Array<Buffer>) => {
    // Sort packets to ensure proper order
    const sortedPackets = packets.sort((a, b) => {
      const [, , aPacketNumber] = this.readPacketHeader(a);
      const [, , bPacketNumber] = this.readPacketHeader(b);
      return aPacketNumber - bPacketNumber;
    });

    const packetBuffers = sortedPackets.map(packet => Buffer.from(packet));
    const concatenatedPackets = Buffer.concat(packetBuffers);

    try {
      const result = await this.processPacketsWithNativeModule(concatenatedPackets);
      const { jpeg, isTop } = result;
      const uri = `data:image/jpeg;base64,${jpeg}`;
      EventRegister.emit('frameReady', { uri, isTop });
      this.frameCount += 1;
    } catch (error) {
      console.error('Error processing packets:', error);
    }
  };

  processPacketsWithNativeModule = (buffer: Buffer): Promise<ProcessPacketsResult> => {
    return new Promise((resolve, reject) => {
      const base64Packets = buffer.toString('base64');
      StreamWorkerModule.processPackets(base64Packets)
        .then((result: ProcessPacketsResult) => resolve(result))
        .catch((error: any) => reject(error));
    });
  };

  readPacketHeader = (packet: Buffer): [number, number, number] => {
    if (packet.length < 4) throw new Error('Invalid packet');
    const frameId = packet.readUInt8(0);
    const screenInfo = packet.readUInt8(1);
    const packetNumber = packet.readUInt8(3);
    return [frameId, screenInfo, packetNumber];
  };

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.fpsCounter}>FPS: {this.state.fps}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 5,
    borderRadius: 5,
  },
  fpsCounter: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
});

export default StreamWorker;
