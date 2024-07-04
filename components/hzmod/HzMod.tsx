import React, { useState, useEffect } from 'react';
import { EventRegister } from 'react-native-event-listeners';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer, constants } from 'buffer';

interface HzModProps {
    cpuLimit: number;
    jpegQuality: number;
    dsIP: string;
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
            SocketSingleton.instance.destroy();
            SocketSingleton.instance = null;
            console.log('SocketSingleton: Instance destroyed');
        }
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

const HzMod: React.FC<HzModProps> = ({ cpuLimit, jpegQuality, dsIP }) => {
    const [connected, setConnected] = useState<boolean>(false);
    const packetManager = new PacketManager();

    useEffect(() => {
        const startStreamListener = EventRegister.addEventListener('hzStream', startStream);
        const stopStreamListener = EventRegister.addEventListener('stopHzStream', stopStream);
        const listener = EventRegister.addEventListener('completePacket', handlePacket);

        return () => {
            EventRegister.removeEventListener('hzStream');
            EventRegister.removeEventListener('stopHzStream');
            EventRegister.removeEventListener('completePacket');
            stopStream();
        };
    }, []);

    const startStream = async () => {
        console.log('HzMod: startStream called');
        if (!connected) {
            const socket = SocketSingleton.getInstance(dsIP);

            socket.on('connect', async () => {
                setConnected(true);
                EventRegister.emit('stateChanged', 'Connected');
                console.log(`HzMod: Socket connected to ${dsIP} on port 6464`);
                await hzModInit(jpegQuality, cpuLimit);
            });

            socket.on('data', async (data) => {
                packetManager.processData(data);
            });

            socket.on('error', (err: Error) => {
                console.error('HzMod: Socket error:', err);
                stopStream();
            });

            socket.on('close', () => {
                setConnected(false);
                EventRegister.emit('stateChanged', 'Disconnected');
                console.log('HzMod: Socket closed');
            });
        }
    };
    const stopStream = async () => {
        console.log('HzMod: stopStream called');
        SocketSingleton.destroyInstance();
        setConnected(false);
        EventRegister.emit('stateChanged', 'Disconnected');
        console.log('HzMod: Socket closed and stream stopped');
    };

    const handlePacket = async (packet: Packet) => {
        const { packetid, data } = packet;
        if (!data) { return; }

        switch (packetid) {
            case 0x01:
                handleErrorPacket(data);
                break;
            case 0x02:
                handleModeSetPacket(data);
                break;
            case 0x03:
                handleTGAPacket(data);
                break;
            case 0x04:
                await handleJPEGPacket(data);
                break;
            case 0x7E:
                console.log("Received CFGBLK_IN packet");
                break;
            case 0xFF:
                handleDebugPacket(data);
                break;
            default:
                console.log(`Unknown packet: ${packetid?.toString(16)}`);
                break;
        }
    };

    const handleErrorPacket = (data: Buffer) => {
        console.log(`Disconnected by error (${data[0]}):`);
        for (let i = 1; i < data.length; i++) {
            process.stdout.write(String.fromCharCode(data[i]));
        }
        process.stdout.write('\n');
        process.exit(1);
    };

    const handleModeSetPacket = (data: Buffer) => {
        const pdata = new Uint32Array(data.buffer);

        console.log(`ModeTOP: ${pdata[0].toString(16)} (o: ${pdata[0] & 7}, bytesize: ${pdata[1]})`);
        console.log(`ModeBOT: ${pdata[2].toString(16)} (o: ${pdata[2] & 7}, bytesize: ${pdata[3]})`);

    };

    const handleTGAPacket = (data: Buffer) => {
        //TODO?
    };
    
    const handleJPEGPacket = (packetData: Buffer) => {

        const jpegData = packetData.slice(8);

        const base64Image = jpegData.toString('base64');
        const uri = `data:image/jpeg;base64,${base64Image}`;
        console.log(uri);

        EventRegister.emit('frameReady', { uri, isTop: true });
    };

    const handleDebugPacket = (data: Buffer) => {
        console.log(`DebugMSG (0x${data.length.toString(16)}):`);
        for (let i = 0; i < data.length; i += 4) {
            console.log(` ${data.readUInt32LE(i).toString(16)}`);
        }
        console.log('\n');
    };

    const hzModInit = (quality: number, cpuLimit: number) => {
        console.log('HzMod: _HzModInit called');
        const socket = SocketSingleton.getInstance(dsIP);
        if (cpuLimit > 255) cpuLimit = 255;
        const streamStartPacket = Buffer.from([0x7E, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
        const limitCPUPacket = Buffer.concat([Buffer.from([0x7E, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00]), Buffer.from([cpuLimit])]);

        console.log('HzMod: Initializing with CPU limit:', cpuLimit, 'and quality:', quality);

        if (cpuLimit > 0) {
            socket.write(limitCPUPacket);
            console.log('HzMod: Setting CPU cycle cap to', cpuLimit);
        }
        hzModChangeQuality(quality);
        socket.write(streamStartPacket);
        console.log('HzMod: Stream started');
    };

    const hzModChangeQuality = (quality: number) => {
        console.log('HzMod: _HzModChangeQuality called');
        const socket = SocketSingleton.getInstance(dsIP);
        if (quality < 1) quality = 1;
        if (quality > 100) quality = 100;
        const qualityPacket = Buffer.concat([Buffer.from([0x7E, 0x05, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]), Buffer.from([quality])]);

        socket.write(qualityPacket);
        console.log('HzMod: Setting quality to', quality);
    };

    return null;
};

interface Pixel {
    b: number;
    g: number;
    r: number;
}

class ImageConverter {
    
    static convertBuffer(inputBuffer: Buffer): Buffer {
        const pixels = ImageConverter.readPixelsFromBuffer(inputBuffer);
        const convertedPixels = ImageConverter.bgrToRgb(pixels);
        return ImageConverter.writePixelsToBuffer(convertedPixels);
    }

    private static readPixelsFromBuffer(buffer: Buffer): Pixel[] {
        const pixels: Pixel[] = [];

        for (let i = 0; i < buffer.length; i += 3) {
            pixels.push({
                b: buffer[i],
                g: buffer[i + 1],
                r: buffer[i + 2],
            });
        }

        return pixels;
    }

    private static bgrToRgb(pixels: Pixel[]): Pixel[] {
        return pixels.map(pixel => ({
            r: pixel.b,
            g: pixel.g,
            b: pixel.r,
        }));
    }

    private static writePixelsToBuffer(pixels: Pixel[]): Buffer {
        const pixelData = Buffer.alloc(pixels.length * 3);

        for (let i = 0; i < pixels.length; i++) {
            pixelData[i * 3] = pixels[i].b;
            pixelData[i * 3 + 1] = pixels[i].g;
            pixelData[i * 3 + 2] = pixels[i].r;
        }

        return pixelData;
    }
}
export default HzMod;