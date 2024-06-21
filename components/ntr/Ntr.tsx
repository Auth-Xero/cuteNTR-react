import React, { Component } from 'react';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { EventRegister } from 'react-native-event-listeners';

interface NtrProps {
  dsIP: string;
}

interface NtrState {
  connected: boolean;
  buffer: Buffer[];
}

enum Command {
  Empty,
  WriteSave,
  Hello,
  Reload,
  PidList,
  AttachProc,
  ThreadList,
  MemLayout,
  ReadMem,
  WriteMem,
  Resume,
  QueryHandle,
  RemotePlay = 901
}

class Ntr extends Component<NtrProps, NtrState> {
  private sock: any;
  private sequence: number = 0;
  private bufferlen: number = 0;
  private recievedcmd: number = 901;
  private heartbeat: any;
  private remotePlayCalled: boolean = false;
  private ntrCommandListener: any;

  constructor(props: NtrProps) {
    super(props);

    this.state = {
      connected: false,
      buffer: [],
    };

    this.sequence = 0;
    this.bufferlen = 0;
    this.recievedcmd = 0;

    this.ntrCommandListener = EventRegister.addEventListener('ntrCommand', this.sendCommand);
    this.ntrCommandListener = EventRegister.addEventListener('ntrConnectToDs', this.connectToDS);
  }

  componentWillUnmount() {
    this.disconnectFromDS();
    EventRegister.removeEventListener(this.ntrCommandListener);
  }

  startHeartbeat() {
    this.heartbeat = setInterval(this.sendHeartbeat, 1000);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeat);
  }

  sendHeartbeat = () => {
    this.sendPacket(0, Command.Empty, [], 0);
  }

  connectToDS = () => {
    if (this.state.connected) this.disconnectFromDS();

    this.sock = TcpSocket.createConnection(
      { port: 8000, host: this.props.dsIP },
      () => {
        console.log('Ntr Connection attempted');
      }
    );

    this.sock.on('connect', () => {
      console.log('Ntr Connection established');
      this.setState({ connected: true });
      this.sendHeartbeat();
      this.startHeartbeat();
      EventRegister.emit('ntrStateChanged', 'Connected');
    });

    this.sock.on('data', (data: Buffer) => {
      this.readStream(data);
    });

    this.sock.on('error', (error: Error) => {
      console.error(error);
      this.disconnectFromDS();
    });

    this.sock.on('close', () => {
      console.log('Ntr Connection closed');
      this.setState({ connected: false });
      EventRegister.emit('ntrStateChanged', 'Disconnected');
      this.stopHeartbeat();
    });
  }

  disconnectFromDS = () => {
    if (this.sock) {
      this.sock.end();
      this.sock.destroy();
      this.sock = null;
    }
    this.setState({ connected: false });
    this.stopHeartbeat();
    this.remotePlayCalled = false;
  }

  sendPacket = (type: number, cmd: Command, args: number[] = [], len: number = 0) => {
    if (!this.sock) {
      console.warn("Socket is not connected.");
      return;
    }

    this.sequence += 1000;
    const pkt = new Uint32Array(21).fill(0);
    pkt[0] = 0x12345678;
    pkt[1] = this.sequence;
    pkt[2] = type;
    pkt[3] = cmd;
    args.forEach((arg, i) => {
      pkt[i + 4] = arg;
    });
    pkt[20] = len;
    this.sock.write(Buffer.from(pkt.buffer));
  }

  readStream = (data: Buffer) => {
    if (this.bufferlen === 0) {
      this.readPacket(data);
    } else {
      this.readToBuf(data);
    }
  }

  readPacket = (data: Buffer) => {
    const pkt = new Uint32Array(data.buffer.slice(0, 84));
    if (pkt[0] !== 0x12345678) {
      console.warn('Bad magic number, discarding packet');
      return;
    }
    this.bufferlen = pkt[20];
    this.recievedcmd = pkt[3];
    console.log("Ntr received cmd: " + pkt[3])
  }

  readToBuf = (data: Buffer) => {
    this.setState((prevState) => ({
      buffer: [...prevState.buffer, data],
    }));

    if (this.state.buffer.length >= this.bufferlen) {
      EventRegister.emit('bufferFilled', this.state.buffer);
      this.bufferlen = 0;
      this.setState({ buffer: [] });
    }
  }

  sendCommand = ({ command, args, len, data }: { command: Command, args: number[], len: number, data: string }) => {
    if (!this.state.connected) {
      console.warn("Not connected, can't send command");
      return;
    }

    switch (command) {
      case Command.Empty:
        this.sendHeartbeat();
        break;
      case Command.WriteSave:
        this.sendPacket(1, Command.WriteSave, args, len);
        this.sock.write(data);
        break;
      case Command.Hello:
        this.sendPacket(0, Command.Hello, args, len);
        break;
      case Command.Reload:
        this.sendPacket(0, Command.Reload, args, len);
        break;
      case Command.PidList:
        this.sendPacket(0, Command.PidList, args, len);
        break;
      case Command.AttachProc:
        this.sendPacket(0, Command.AttachProc, args, len);
        break;
      case Command.ThreadList:
        this.sendPacket(0, Command.ThreadList, args, len);
        break;
      case Command.MemLayout:
        this.sendPacket(0, Command.MemLayout, args, len);
        break;
      case Command.ReadMem:
        this.sendPacket(0, Command.ReadMem, args, len);
        break;
      case Command.WriteMem:
        this.sendPacket(0, Command.WriteMem, args, len);
        break;
      case Command.Resume:
        this.sendPacket(0, Command.Resume, args, len);
        break;
      case Command.QueryHandle:
        this.sendPacket(0, Command.QueryHandle, args, len);
        break;
      case Command.RemotePlay:
        this.remotePlay();
        break;
      default:
        break;
    }
  }

  remotePlay = () => {
    if (this.remotePlayCalled) {
      console.warn("RemotePlay has already been called for this connection");
      return;
    }
    this.remotePlayCalled = true;

    const pri = (1 << 8) | 5;
    const jpegq = 80;
    const qosvalue = 105 << 17;
    this.sendPacket(0, Command.RemotePlay, [pri, jpegq, qosvalue, 0], 0);
    this.disconnectFromDS();
    setTimeout(() => {
      this.connectToDS();
    }, 3000);
    this.disconnectFromDS();
    EventRegister.emit('streamReady');
  }

  render() {
    return null;
  }
}

export default Ntr;