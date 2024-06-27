import React, { Component } from 'react';
import { NativeModules, View } from 'react-native';
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
  private lastFrameIdForScreen: Map<number, number> = new Map();
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
    this.stopStream(); // Ensure the stream is stopped when the component unmounts
  }

  startStream = () => {
    console.log('StreamWorker: startStream called');
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
    console.log('StreamWorker: stopStream called');
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
    const isEndOfFrame = (header[1] & 0xF0) === 0x10;
    const key = `${screenId}-${frameId}`;

    const lastFrameId = this.lastFrameIdForScreen.get(screenId);
    if (lastFrameId !== undefined && frameId !== lastFrameId) {
      // If a new frame with the same screen ID starts before the current frame is complete, drop the current frame
      const oldKey = `${screenId}-${lastFrameId}`;
      this.framePackets.delete(oldKey);
      this.framePacketCounts.delete(oldKey);
    }
    this.lastFrameIdForScreen.set(screenId, frameId);

    if (!this.framePackets.has(key)) {
      this.framePackets.set(key, []);
      this.framePacketCounts.set(key, 0);
    }

    const packets = this.framePackets.get(key)!;
    packets.push(msg);

    if (isEndOfFrame) {
      const expectedPacketCount = packetNumber + 1;
      const receivedPacketCount = packets.length;

      if (expectedPacketCount !== receivedPacketCount) {
        // Drop frame due to missing packets
        this.framePackets.delete(key);
        this.framePacketCounts.delete(key);
        return;
      }

      this.processFrame(key, packets);
      this.framePackets.delete(key);
      this.framePacketCounts.delete(key);
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
    return null;
  }
}

export default StreamWorker;
