import React, { Component } from 'react';
import { NativeModules } from 'react-native';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import { EventRegister } from 'react-native-event-listeners';

const { StreamWorkerModule } = NativeModules;

interface StreamWorkerProps {
  dsIP: string;
}

interface StreamWorkerState {
  connected: boolean;
}

interface ProcessPacketsResult {
  jpeg: string;
  isTop: boolean;
}

class StreamWorker extends Component<StreamWorkerProps, StreamWorkerState> {
  private socket: any;
  private abort: boolean = false;
  private messageQueue: Array<Buffer> = [];
  private messageResolve: ((value: Buffer | null) => void) | null = null;
  private streamReadyListener: any;
  private stopStreamListener: any;
  private framePackets: Map<string, Array<Buffer>> = new Map();

  constructor(props: StreamWorkerProps) {
    super(props);

    this.state = {
      connected: false,
    };

    this.streamReadyListener = EventRegister.addEventListener('stream', this.startStream);
    this.stopStreamListener = EventRegister.addEventListener('stopStream', this.stopStream);
  }

  componentWillUnmount() {
    EventRegister.removeEventListener(this.streamReadyListener);
    EventRegister.removeEventListener(this.stopStreamListener);
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
  };

  handleMessage = (msg: Buffer) => {
    const header = this.readPacketHeader(msg);
    const frameId = header[0];
    const screenId = header[1] & 0x0F;
    const key = `${frameId}-${screenId}`;

    if (!this.framePackets.has(key)) {
      this.framePackets.set(key, []);
    }

    const packets = this.framePackets.get(key)!;
    packets.push(msg);

    if ((header[1] & 0xF0) === 0x10) {
      // End of frame
      this.processFrame(key, packets);
      this.framePackets.delete(key);
    }
  };

  processFrame = async (key: string, packets: Array<Buffer>) => {
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
      //console.log(uri);
      EventRegister.emit('frameReady', { uri, isTop });
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
