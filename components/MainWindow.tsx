import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, StyleSheet, Button, Switch, TouchableOpacity, ScrollView } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';

interface MainWindowProps {
  dsIP: string;
  qosValue: number;
  priMode: number;
  priFact: number;
  jpegQuality: number;
  debugging: boolean;
  streaming: boolean;
  startStream: () => void;
  stopStream: () => void;
  updateDsIP: (dsIP: string) => void;
  navigateToStreamWindow: (isTop: boolean, showFps: boolean) => void;
}

const MainWindow: React.FC<MainWindowProps> = (props) => {
  const [dsIP, setDsIP] = useState<string>(props.dsIP);
  const [qosValue, setQosValue] = useState<string>(props.qosValue.toString());
  const [jpegQuality, setJpegQuality] = useState<string>(props.jpegQuality.toString());
  const [priorityFactor, setPriorityFactor] = useState<number>(props.priFact);
  const [screenPriority, setScreenPriority] = useState<number>(0); // Default to Bottom
  const [showFps, setShowFps] = useState<boolean>(false);

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
    const jpegq = parseInt(jpegQuality, 10);
    const qosvalue = parseInt(qosValue, 10) * 2;

    EventRegister.emit('streamSettings', { screenPriority, priorityFactor, jpegq, qosvalue });

    if (props.streaming) {
      props.stopStream();
    } else {
      props.startStream();
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.label}>IP Address</Text>
        <TextInput
          style={styles.input}
          placeholder="DS IP Address"
          placeholderTextColor="#888"
          value={dsIP}
          onChangeText={setDsIP}
        />
        <TouchableOpacity style={styles.button} onPress={handleStartStopStream}>
          <Text style={styles.buttonText}>{props.streaming ? "Stop Stream" : "Start Stream"}</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Priority Factor</Text>
        <View style={styles.priorityContainer}>
          <Button title="-" onPress={() => setPriorityFactor(prev => Math.max(prev - 1, 0))} />
          <TextInput
            style={styles.priorityInput}
            value={priorityFactor.toString()}
            onChangeText={(text) => setPriorityFactor(parseInt(text, 10))}
            keyboardType="numeric"
          />
          <Button title="+" onPress={() => setPriorityFactor(prev => prev + 1)} />
        </View>

        <Text style={styles.label}>Screen Priority</Text>
        <View style={styles.screenPriorityContainer}>
          <TouchableOpacity
            style={[styles.screenPriorityButton, screenPriority === 0 && styles.selectedButton]}
            onPress={() => setScreenPriority(0)}
          >
            <Text style={styles.buttonText}>Top Screen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.screenPriorityButton, screenPriority === 1 && styles.selectedButton]}
            onPress={() => setScreenPriority(1)}
          >
            <Text style={styles.buttonText}>Bottom Screen</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>JPEG Quality</Text>
        <TextInput
          style={styles.input}
          placeholder="JPEG Quality"
          placeholderTextColor="#888"
          keyboardType="numeric"
          value={jpegQuality}
          onChangeText={(text) => setJpegQuality(text)}
        />

        <Text style={styles.label}>QoS Value</Text>
        <TextInput
          style={styles.input}
          placeholder="QoS Value"
          placeholderTextColor="#888"
          keyboardType="numeric"
          value={qosValue}
          onChangeText={(text) => setQosValue(text)}
        />

        <View style={styles.switchContainer}>
          <Text style={styles.label}>Show FPS</Text>
          <Switch value={showFps} onValueChange={setShowFps} />
        </View>

        <Button title="Go to Stream Window (Top)" onPress={() => props.navigateToStreamWindow(true, showFps)} />
        <Button title="Go to Stream Window (Bottom)" onPress={() => props.navigateToStreamWindow(false, showFps)} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  scrollContainer: {
    padding: 16,
  },
  input: {
    height: 40,
    borderColor: '#888',
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
    color: '#FFF',
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#8A2BE2',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginVertical: 10,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  priorityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  priorityInput: {
    height: 40,
    borderColor: '#888',
    borderWidth: 1,
    marginHorizontal: 8,
    paddingHorizontal: 8,
    color: '#FFF',
    flex: 1,
  },
  screenPriorityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  screenPriorityButton: {
    backgroundColor: '#8A2BE2',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  selectedButton: {
    backgroundColor: '#5D3FD3',
  },
});

export default MainWindow;
