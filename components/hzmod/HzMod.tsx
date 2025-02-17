import React, { Component } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { NativeModules } from 'react-native';

interface HzModProps {
  cpuLimit: number;
  jpegQuality: number;
  dsIP: string;
}

interface HzModState {
  connected: boolean;
}

class SocketSingleton {
  private static instance: TcpSocket.Socket | null = null;

  static getInstance(dsIP: string): TcpSocket.Socket {
    if (!SocketSingleton.instance) {
      SocketSingleton.instance = TcpSocket.createConnection({ host: dsIP, port: 6464 }, () => {
        console.log('SocketSingleton: Connection Attempted');
      });
    }
    return SocketSingleton.instance;
  }

  static destroyInstance() {
    if (SocketSingleton.instance) {
      SocketSingleton.instance.end();
      SocketSingleton.instance = null;
      console.log('SocketSingleton: Instance destroyed');
    }
  }

  static reconnectInstance(dsIP: string): TcpSocket.Socket {
    SocketSingleton.destroyInstance();
    return SocketSingleton.getInstance(dsIP);
  }
}

class Packet {
  packetid: number | null = null;
  size: number | null = null;
  data: Buffer | null = null;
  receivedSize: number = 0;

  constructor(buffer: Buffer) {
    if (buffer.length >= 4) {
      this.packetid = buffer.readUInt8(0);
      this.size = buffer.readUIntLE(1, 3);
      this.data = Buffer.alloc(this.size);

      if (buffer.length > 4) {
        this.addData(buffer.slice(4));
      }
    } else {
      throw new Error("Insufficient buffer length for packet header.");
    }
  }

  addData(chunk: Buffer) {
    if (!this.data) {
      return;
    }

    const remainingSize = this.size! - this.receivedSize;
    const chunkSize = Math.min(chunk.length, remainingSize);
    chunk.copy(this.data, this.receivedSize, 0, chunkSize);
    this.receivedSize += chunkSize;

    if (this.receivedSize === this.size) {
      EventRegister.emit('completePacket', this);
    }
  }

  isComplete() {
    return this.receivedSize === this.size;
  }
}

class PacketManager {
  buffer = Buffer.alloc(0);
  currentPacket: Packet | null = null;

  processData(data: Buffer | string) {
    const newBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.buffer = Buffer.concat([this.buffer, newBuffer]);
    if (!this.currentPacket || this.currentPacket.isComplete()) {
      if (this.buffer.length >= 4) {
        const size = this.buffer.readUIntLE(1, 3);

        if (this.buffer.length >= size + 4) {
          this.currentPacket = new Packet(this.buffer.slice(0, size + 4));
          this.buffer = this.buffer.slice(size + 4);
        } else {
          return;
        }
      } else {
        return;
      }
    } else {
      this.currentPacket.addData(this.buffer);
      this.buffer = Buffer.alloc(0);
    }
  }
}

class HzMod extends Component<HzModProps, HzModState> {
  packetManager = new PacketManager();
  ImageProcessor = NativeModules.ImageProcessor;
  socketRef: TcpSocket.Socket | null = null;
  appStateSubscription: { remove: () => void } | null = null;

  constructor(props: HzModProps) {
    super(props);
    this.state = {
      connected: false,
    };
  }

  componentDidMount() {
    EventRegister.addEventListener('hzStream', this.startStream);
    EventRegister.addEventListener('stopHzStream', this.stopStream);
    EventRegister.addEventListener('completePacket', this.handlePacket);

    // Listen to app state changes so we can stop/start the stream
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  componentWillUnmount() {
    EventRegister.removeEventListener('hzStream');
    EventRegister.removeEventListener('stopHzStream');
    EventRegister.removeEventListener('completePacket');
    this.stopStream();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
  }

  // Handle AppState changes to pause/resume the stream
  handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState.match(/inactive|background/)) {
      console.log("App is in background. Stopping stream.");
      this.stopStream();
    } else if (nextAppState === "active") {
      console.log("App is active. Starting stream.");
      this.startStream();
    }
  };

  componentDidUpdate(prevProps: HzModProps) {
    if (
      prevProps.dsIP !== this.props.dsIP ||
      prevProps.cpuLimit !== this.props.cpuLimit ||
      prevProps.jpegQuality !== this.props.jpegQuality
    ) {
      console.log('HzMod: componentDidUpdate detected changes in props');
      this.reconnectSocket();
    }
  }

  reconnectSocket = () => {
    console.log('HzMod: reconnectSocket called');
    SocketSingleton.destroyInstance();
    this.socketRef = SocketSingleton.getInstance(this.props.dsIP);
    this.startStream();
  };

  startStream = async () => {
    console.log('HzMod: startStream called');
    if (!this.state.connected) {
      const socket = SocketSingleton.getInstance(this.props.dsIP);
      this.socketRef = socket;

      socket.on('connect', async () => {
        this.setState({ connected: true });
        EventRegister.emit('stateChanged', 'Connected');
        console.log(`HzMod: Socket connected to ${this.props.dsIP} on port 6464`);
        await this.hzModInit(this.props.jpegQuality, this.props.cpuLimit);
      });

      socket.on('data', (data) => {
        this.packetManager.processData(data);
      });

      socket.on('error', (err: Error) => {
        console.error('HzMod: Socket error:', err);
        this.stopStream();
      });

      socket.on('close', () => {
        this.setState({ connected: false });
        EventRegister.emit('stateChanged', 'Disconnected');
        console.log('HzMod: Socket closed');
      });
    }
  };

  stopStream = () => {
    console.log('HzMod: stopStream called');
    SocketSingleton.destroyInstance();
    this.setState({ connected: false });
    EventRegister.emit('stateChanged', 'Disconnected');
    console.log('HzMod: Socket closed and stream stopped');
  };

  handlePacket = async (packet: Packet) => {
    const { packetid, data } = packet;
    if (!data) {
      return;
    }

    switch (packetid) {
      case 0x01:
        this.handleErrorPacket(data);
        break;
      case 0x02:
        this.handleModeSetPacket(data);
        break;
      case 0x03:
        await this.handleTGAPacket(data);
        break;
      case 0x04:
        await this.handleJPEGPacket(data);
        break;
      case 0x7E:
        console.log("Received CFGBLK_IN packet");
        break;
      case 0xFF:
        this.handleDebugPacket(data);
        break;
      default:
        console.log(`Unknown packet: ${packetid?.toString(16)}`);
        break;
    }
  };

  handleErrorPacket = (data: Buffer) => {
    console.log(`Disconnected by error (${data[0]}):`);
    for (let i = 1; i < data.length; i++) {
      process.stdout.write(String.fromCharCode(data[i]));
    }
    process.stdout.write('\n');
    process.exit(1);
  };

  handleModeSetPacket = (data: Buffer) => {
    const pdata = new Uint32Array(data.buffer);

    console.log(`ModeTOP: ${pdata[0].toString(16)} (o: ${pdata[0] & 7}, bytesize: ${pdata[1]})`);
    console.log(`ModeBOT: ${pdata[2].toString(16)} (o: ${pdata[2] & 7}, bytesize: ${pdata[3]})`);
  };

  handleTGAPacket = async (packetData: Buffer) => {
    if (packetData.length < 18) {
      console.error("Invalid TGA packet: too short to contain a valid header.");
      return;
    }

    const base64Tga = packetData.toString("base64");

    try {
      const processedImageBase64 = await this.ImageProcessor.decodeTgaFromMemory(base64Tga);
      if (!processedImageBase64) {
        console.error("Native module returned an empty result for TGA processing.");
        return;
      }

      const uri = `data:image/jpeg;base64,${processedImageBase64}`;
      EventRegister.emit("frameReady", { uri, isTop: true });
    } catch (error) {
      console.error("Error processing TGA packet:", error);
    }
  };

  handleJPEGPacket = async (packetData: Buffer) => {
    const jpegData = packetData.slice(8);
    const rgbImage = await this.ImageProcessor.convertBGRtoRGB(jpegData.toString('base64'));
    const base64Image = rgbImage.toString('base64');
    const uri = `data:image/jpeg;base64,${base64Image}`;
    EventRegister.emit('frameReady', { uri: uri, isTop: true });
  };

  handleDebugPacket = (data: Buffer) => {
    console.log(`DebugMSG (0x${data.length.toString(16)}):`);
    for (let i = 0; i < data.length; i += 4) {
      console.log(` ${data.readUInt32LE(i).toString(16)}`);
    }
    console.log('\n');
  };

  hzModInit = (quality: number, cpuLimit: number) => {
    console.log('HzMod: hzModInit called');
    const socket = SocketSingleton.getInstance(this.props.dsIP);
    if (cpuLimit > 255) cpuLimit = 255;
    const streamStartPacket = Buffer.from([0x7E, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
    const limitCPUPacket = Buffer.concat([
      Buffer.from([0x7E, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00]),
      Buffer.from([cpuLimit])
    ]);

    console.log('HzMod: Initializing with CPU limit:', cpuLimit, 'and quality:', quality);

    if (cpuLimit > 0) {
      socket.write(limitCPUPacket);
      console.log('HzMod: Setting CPU cycle cap to', cpuLimit);
    }
    this.hzModChangeQuality(quality);
    socket.write(streamStartPacket);
    console.log('HzMod: Stream started');
  };

  hzModChangeQuality = (quality: number) => {
    console.log('HzMod: hzModChangeQuality called');
    const socket = SocketSingleton.getInstance(this.props.dsIP);
    if (quality < 1) quality = 1;
    if (quality > 100) quality = 100;
    const qualityPacket = Buffer.concat([
      Buffer.from([0x7E, 0x05, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]),
      Buffer.from([quality])
    ]);

    socket.write(qualityPacket);
    console.log('HzMod: Setting quality to', quality);
  };

  render() {
    return null;
  }
}

export default HzMod;
