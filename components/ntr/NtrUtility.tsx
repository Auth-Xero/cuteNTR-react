import React, { Component } from 'react';
import { Alert } from 'react-native';
import Ntr from './Ntr';
import { EventRegister } from 'react-native-event-listeners';

interface NtrUtilityProps {
  dsIP: string;
}

interface NtrUtilityState {
  pidlist: string[];
  lastmessage: string;
}

class NtrUtility extends Component<NtrUtilityProps, NtrUtilityState> {
  private ntr: Ntr;
  private eventListener: any;

  constructor(props: NtrUtilityProps) {
    super(props);
    this.state = {
      pidlist: [],
      lastmessage: '',
    };

    this.ntr = new Ntr({ dsIP: props.dsIP });

    this.eventListener = EventRegister.addEventListener('bufferFilled', this.handleInfo);
  }

  componentWillUnmount() {
    EventRegister.removeEventListener(this.eventListener);
  }

  getPid(pname: string): number {
    this.sendNtrCommand(5); 
    const line = this.state.pidlist.find((str) => str.includes(pname));

    if (!line) {
      console.warn(`Process ${pname} not running`);
      return 0;
    }

    const pid = parseInt(line.slice(5, 15), 16);

    if (isNaN(pid)) {
      console.warn('String conversion for pid failed');
      return 0;
    }

    return pid;
  }

  writeNfcPatch(type: number) {
    let pid = 0;
    let offset;
    let len;
    let patch = '';

    switch (type) {
      case 1: 
        pid = this.getPid('niji_loc');
        offset = 0x3e14c0;
        patch = '\xe3\xa0\x10\x00';
        break;
      default: 
        pid = 0x1a;
        offset = 0x105ae4;
        patch = '\x70\x47';
        break;
    }

    len = patch.length;
    if (pid !== 0) {
      this.sendNtrCommand(10, [pid, offset, len], len, patch); 
    } else {
      Alert.alert(
        'Warning',
        "Can't find pid. Make sure the title is running, then wait and try again"
      );
    }
  }

  handleInfo = (info: Buffer) => {
    const infoStr = info.toString();
    if (infoStr.startsWith('pid')) {
      const pidlist = infoStr.split('\n');
      this.setState({ pidlist });
      console.log('Updated pid list:', pidlist.length, 'entries');
    } else {
      this.setState({ lastmessage: infoStr });
    }
  }

  sendNtrCommand = (command: number, args: number[] = [], len: number = 0, data: string = '') => {
    EventRegister.emit('ntrCommand', { command, args, len, data });
  }

  render() {
    return null;
  }
}

export default NtrUtility;