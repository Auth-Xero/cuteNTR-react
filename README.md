# AdorableNTR

AdorableNTR is a mobile streaming application designed to connect to a Nintendo 3DS using custom firmware and BootNTR. It leverages a UDP server and TCP sockets to stream video data from the 3DS to your mobile device. Additionally, AdorableNTR allows you to record the stream directly from the application.

## Features

- **Real-time streaming**: Stream video data from your Nintendo 3DS to your mobile device.
- **Recording functionality**: Record the live stream with options to specify the save location.
- **Seamless connection**: Utilize UDP server and TCP sockets for efficient data transfer.

## Requirements

- Nintendo 3DS with custom firmware
- BootNTR running on the 3DS
- Java Development Kit (JDK)
- Node.js and npm
- React Native CLI
- Android Studio (for Android development)
- Xcode (for iOS development)

## Installation

1. **Clone the repository:**
    ```bash
    git clone https://github.com/Auth-Xero/cutentr-react.git
    cd cutentr-react
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Set up the JNI environment:**
    - Follow the instructions in the `jni/README.md` to set up the JNI environment for processing the JPEG data.

4. **Build the project:**
    ```bash
    npm run build
    ```

5. **Run the app:**
    ```bash
    npm start
    ```

6. **Run on your mobile device:**
    - **For Android:**
        - Connect your mobile device to your development machine.
        - Start the React Native packager:
            ```bash
            npx react-native start
            ```
        - In another terminal window, run:
            ```bash
            npx react-native run-android
            ```
    - **For iOS:**
        - Open the project in Xcode:
            ```bash
            npx react-native run-ios
            ```
        - Ensure your iOS device is connected to your development machine and select it as the build target in Xcode.
        - Click the "Run" button in Xcode to build and launch the app on your device.

## Usage

1. **Launch BootNTR on your Nintendo 3DS:**
    - Ensure your 3DS is connected to the same network as your mobile device.
    - Start BootNTR on your 3DS.

2. **Connect to the 3DS from AdorableNTR:**
    - Open the AdorableNTR application on your mobile device.
    - Enter the IP address of your 3DS in the connection settings.
    - Click "Connect" to start streaming.

3. **Recording the Stream:**
    - Toggle the "Enable Recording" switch in the application settings.
    - Use the "Start Recording" button to begin recording the stream.
    - Click "Stop Recording" to end the recording session.

## Troubleshooting

- **Connection issues:**
    - Ensure both the 3DS and your mobile device are on the same network.
    - Verify the IP address of your 3DS is correctly entered in the application.
    - If the stream does not start, try rebooting your 3DS and restarting the BootNTR app.

- **Recording problems:**
    - Check that you have write permissions to the specified save location.
    - Ensure the recording feature is enabled in the settings.

## Contributing

We welcome contributions to AdorableNTR! If you have suggestions, bug reports, or want to contribute code, please open an issue or submit a pull request on GitHub.

## License

AdorableNTR is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.

## Acknowledgments

Special thanks to the homebrew community and everyone who contributed to the development of custom firmware and BootNTR for the Nintendo 3DS.

---

Feel free to reach out with any questions or feedback. Happy streaming!

---

### Contact

- **GitHub**: [Auth-Xero](https://github.com/Auth-Xero)
- **Email**: authxero@gmail.com

---

This project is not affiliated with or endorsed by Nintendo. The Nintendo 3DS and other trademarks are properties of Nintendo.

---

**Note:** Ensure you have the necessary legal rights to use and distribute any firmware or software associated with this project.
