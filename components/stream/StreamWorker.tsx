import React, { Component } from 'react';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import { EventRegister } from 'react-native-event-listeners';

interface StreamWorkerProps {
  dsIP: string;
}

interface StreamWorkerState {
  connected: boolean;
}

class StreamWorker extends Component<StreamWorkerProps, StreamWorkerState> {
  private socket: any;
  private abort: boolean = false;
  private streamReadyListener: any;
  private stopStreamListener: any;
  private packets: { [key: number]: Buffer } = {};
  private currentFrameId: number = -1;
  private currentScreenId: number = -1;
  private expectedPacket: number = 0;
  private jpeg: Buffer = Buffer.alloc(0);

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
    this.stopStream();
  }

  startStream = () => {
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

      this.socket.on('close', () => {
        console.log('Socket closed');
        this.setState({ connected: false });
        EventRegister.emit('stateChanged', 'Disconnected');
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

  handleMessage = async (msg: Buffer) => {
    try {
      let header = this.readPacketHeader(msg);
      if (!header || (this.currentFrameId !== -1 && header[0] !== this.currentFrameId)) {
        console.warn('Invalid or incomplete packet received.');
        return;
      }

      if (header[2] === 0) {

        this.currentFrameId = header[0];
        this.currentScreenId = header[1] & 0x0F;
        this.expectedPacket = 0;
        this.jpeg = Buffer.alloc(0);
        this.packets = {};
      }

      this.packets[header[2]] = msg;
      let jpegEndFlag = (header[1] & 0xF0) === 0x10;

      if (jpegEndFlag) {
        this.processFrame();
      }
    } catch (error) {
      console.warn('Error processing frame:', error);
    }
  };

  processFrame = () => {
    let packetNumbers = Object.keys(this.packets).map(Number).sort((a, b) => a - b);

    for (let i = 0; i < packetNumbers.length; i++) {
      if (packetNumbers[i] !== this.expectedPacket) {
        console.warn('Missing packet, skipping frame.');
        return;
      }
      this.jpeg = Buffer.concat([this.jpeg, this.packets[packetNumbers[i]].slice(4)]);
      this.expectedPacket++;
    }

    if (!this.jpeg.slice(-2).equals(Buffer.from([0xff, 0xd9]))) {
      console.warn('Skipping current frame. (Invalid/incomplete JPEG image)');
      return;
    }

    let base64String = Buffer.from(this.jpeg).toString('base64');
    let uri = `data:image/jpeg;base64,${base64String}`;
    console.log('JPEG frame ready:', uri);
    EventRegister.emit('frameReady', { uri, isTop: this.currentScreenId === 1 });
  };

  readPacketHeader = (packet: Buffer) => {
    if (packet.length < 4) return null;
    let frameId = packet.readUInt8(0); 
    let screenId = packet.readUInt8(1); 
    let packetNumber = packet.readUInt8(3);  

    return [frameId, screenId, packetNumber];
  };

  render() {
    return null;
  }
}

export default StreamWorker;