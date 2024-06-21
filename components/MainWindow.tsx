import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, StyleSheet, Button, Switch } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';

interface MainWindowProps {
  dsIP: string;
  qosValue: number;
  priMode: number;
  priFact: number;
  jpegQuality: number;
  tScale: number;
  bScale: number;
  smooth: boolean;
  nfcPatchType: number;
  debugging: boolean;
  streaming: boolean;
  startStream: () => void;
  stopStream: () => void;
  sendNfcPatch: () => void;
  updateDsIP: (dsIP: string) => void;
}

const MainWindow: React.FC<MainWindowProps> = (props) => {
  const [dsIP, setDsIP] = useState<string>(props.dsIP);
  const [qosValue, setQosValue] = useState<string>(props.qosValue.toString());
  const [jpegQuality, setJpegQuality] = useState<string>(props.jpegQuality.toString());
  const [tScale, setTScale] = useState<string>(props.tScale.toString());
  const [bScale, setBScale] = useState<string>(props.bScale.toString());
  const [smooth, setSmooth] = useState<boolean>(props.smooth);

  useEffect(() => {
    const handleStateChanged = (state: string) => {
      console.log('Stream state changed:', state);
    };

    const stateChangedListener = EventRegister.addEventListener('stateChanged', handleStateChanged);
    return () => {
      if (typeof stateChangedListener === 'string') {
        EventRegister.removeEventListener(stateChangedListener);
      }
    };
  }, []);

  const handleStartStopStream = () => {
    console.log('handleStartStopStream called');
    props.updateDsIP(dsIP);
    if (props.streaming) {
      props.stopStream();
    } else {
      props.startStream();
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="DS IP Address"
        placeholderTextColor="#888"
        value={dsIP}
        onChangeText={setDsIP}
      />
      <Button title={props.streaming ? "Stop Stream" : "Start Stream"} onPress={handleStartStopStream} />
      <Text style={styles.label}>QoS Value</Text>
      <TextInput
        style={styles.input}
        placeholder="QoS Value"
        placeholderTextColor="#888"
        keyboardType="numeric"
        value={qosValue}
        onChangeText={(text) => setQosValue(text)}
      />
      <Text style={styles.label}>JPEG Quality</Text>
      <TextInput
        style={styles.input}
        placeholder="JPEG Quality"
        placeholderTextColor="#888"
        keyboardType="numeric"
        value={jpegQuality}
        onChangeText={(text) => setJpegQuality(text)}
      />
      <Text style={styles.label}>Top Scale</Text>
      <TextInput
        style={styles.input}
        placeholder="Top Scale"
        placeholderTextColor="#888"
        keyboardType="numeric"
        value={tScale}
        onChangeText={(text) => setTScale(text)}
      />
      <Text style={styles.label}>Bottom Scale</Text>
      <TextInput
        style={styles.input}
        placeholder="Bottom Scale"
        placeholderTextColor="#888"
        keyboardType="numeric"
        value={bScale}
        onChangeText={(text) => setBScale(text)}
      />
      <View style={styles.switchContainer}>
        <Text style={styles.label}>Smooth</Text>
        <Switch value={smooth} onValueChange={setSmooth} />
      </View>
      <Button title="Send NFC Patch" onPress={props.sendNfcPatch} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  input: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
    color: '#000',
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
});

export default MainWindow;
