#if os(iOS)
import AVFoundation
import WebKit

/// Manages USB/external audio device detection and audio session configuration.
/// Communicates with the WKWebView via JavaScript injection.
final class USBAudioManager: NSObject {
    static let shared = USBAudioManager()

    private(set) var isUSBConnected = false
    private(set) var connectedDeviceName: String = ""
    private(set) var connectedPortType: String = ""
    private(set) var isMicEnabled = true

    /// Reference to the web view — set by ContentView once loaded
    weak var webView: WKWebView?

    private override init() {
        super.init()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Audio Session Setup

    func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            print("[USBAudio] Audio session configured: playAndRecord")
        } catch {
            print("[USBAudio] Failed to configure audio session: \(error)")
        }

        // Check current route on startup
        checkCurrentRoute()
    }

    // MARK: - Route Detection

    private func checkCurrentRoute() {
        let session = AVAudioSession.sharedInstance()
        let route = session.currentRoute

        var foundUSB = false
        var deviceName = "Internal Mic"
        var portType = "builtInMic"

        for input in route.inputs {
            print("[USBAudio] Input: \(input.portName) type: \(input.portType.rawValue) channels: \(input.channels?.count ?? 0)")

            if input.portType == .usbAudio {
                foundUSB = true
                deviceName = input.portName
                portType = input.portType.rawValue
                // Auto-select USB as preferred input
                setPreferredInput(input)
                break
            } else if input.portType == .bluetoothHFP ||
                      input.portType == .bluetoothA2DP ||
                      input.portType == .bluetoothLE {
                deviceName = input.portName
                portType = input.portType.rawValue
            } else if input.portType == .headsetMic ||
                      input.portType == .lineIn {
                deviceName = input.portName
                portType = input.portType.rawValue
            }
        }

        let wasUSBConnected = isUSBConnected
        isUSBConnected = foundUSB
        connectedDeviceName = deviceName
        connectedPortType = portType

        // Log all available inputs
        if let availableInputs = session.availableInputs {
            for input in availableInputs {
                let channels = input.channels?.count ?? 0
                let dataSources = input.dataSources?.count ?? 0
                print("[USBAudio] Available: \(input.portName) type: \(input.portType.rawValue) channels: \(channels) dataSources: \(dataSources)")
            }
        }

        // Notify WebView
        if foundUSB && !wasUSBConnected {
            print("[USBAudio] USB device connected: \(deviceName)")
            notifyWebView(event: "usbConnected", deviceName: deviceName, portType: portType)
        } else if !foundUSB && wasUSBConnected {
            print("[USBAudio] USB device disconnected")
            notifyWebView(event: "usbDisconnected", deviceName: "Internal Mic", portType: "builtInMic")
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        let reasonString: String
        switch reason {
        case .newDeviceAvailable:     reasonString = "NewDeviceAvailable"
        case .oldDeviceUnavailable:   reasonString = "OldDeviceUnavailable"
        case .categoryChange:         reasonString = "CategoryChange"
        case .override:               reasonString = "Override"
        case .wakeFromSleep:          reasonString = "WakeFromSleep"
        case .noSuitableRouteForCategory: reasonString = "NoSuitableRoute"
        case .routeConfigurationChange:   reasonString = "RouteConfigChange"
        default:                      reasonString = "Unknown(\(reasonValue))"
        }

        print("[USBAudio] Route changed: \(reasonString)")
        checkCurrentRoute()
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        if type == .ended {
            print("[USBAudio] Interruption ended — reactivating session")
            try? AVAudioSession.sharedInstance().setActive(true)
            checkCurrentRoute()
        }
    }

    // MARK: - Input Switching

    /// Switch preferred input to USB device
    func selectUSBInput() {
        let session = AVAudioSession.sharedInstance()
        guard let availableInputs = session.availableInputs else { return }

        if let usb = availableInputs.first(where: { $0.portType == .usbAudio }) {
            setPreferredInput(usb)
            print("[USBAudio] Switched to USB: \(usb.portName)")
            notifyWebView(event: "inputChanged", deviceName: usb.portName, portType: usb.portType.rawValue)
        }
    }

    /// Switch preferred input to built-in microphone
    func selectBuiltInMic() {
        let session = AVAudioSession.sharedInstance()
        guard let availableInputs = session.availableInputs else { return }

        if let mic = availableInputs.first(where: { $0.portType == .builtInMic }) {
            setPreferredInput(mic)
            print("[USBAudio] Switched to built-in mic: \(mic.portName)")
            notifyWebView(event: "inputChanged", deviceName: mic.portName, portType: mic.portType.rawValue)
        }
    }

    /// Toggle mic on/off (when USB is primary, this controls whether to also send mic audio)
    func setMicEnabled(_ enabled: Bool) {
        isMicEnabled = enabled
        print("[USBAudio] Mic enabled: \(enabled)")
        notifyWebView(event: "micToggled", deviceName: connectedDeviceName, portType: connectedPortType)
    }

    private func setPreferredInput(_ input: AVAudioSessionPortDescription) {
        do {
            try AVAudioSession.sharedInstance().setPreferredInput(input)
        } catch {
            print("[USBAudio] Failed to set preferred input: \(error)")
        }
    }

    // MARK: - WebView Bridge

    private func notifyWebView(event: String, deviceName: String, portType: String) {
        let escapedName = deviceName.replacingOccurrences(of: "'", with: "\\'")
        let js = """
        if (window.onNativeAudioEvent) {
            window.onNativeAudioEvent({
                event: '\(event)',
                deviceName: '\(escapedName)',
                portType: '\(portType)',
                isUSB: \(isUSBConnected ? "true" : "false"),
                isMicEnabled: \(isMicEnabled ? "true" : "false")
            });
        }
        window.dispatchEvent(new CustomEvent('nativeAudioRoute', {
            detail: {
                event: '\(event)',
                deviceName: '\(escapedName)',
                portType: '\(portType)',
                isUSB: \(isUSBConnected ? "true" : "false"),
                isMicEnabled: \(isMicEnabled ? "true" : "false")
            }
        }));
        """

        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js) { _, error in
                if let error = error {
                    print("[USBAudio] JS injection error: \(error)")
                }
            }
        }
    }

    /// Send current state to WebView (called after page loads)
    func sendCurrentState() {
        let event = isUSBConnected ? "usbConnected" : "usbDisconnected"
        notifyWebView(event: event, deviceName: connectedDeviceName, portType: connectedPortType)
    }

    /// Get available inputs as JSON for the WebView
    func getAvailableInputsJSON() -> String {
        let session = AVAudioSession.sharedInstance()
        guard let inputs = session.availableInputs else { return "[]" }

        let inputList = inputs.map { input -> [String: Any] in
            return [
                "portName": input.portName,
                "portType": input.portType.rawValue,
                "isUSB": input.portType == .usbAudio,
                "channels": input.channels?.count ?? 0
            ]
        }

        guard let data = try? JSONSerialization.data(withJSONObject: inputList),
              let json = String(data: data, encoding: .utf8) else {
            return "[]"
        }
        return json
    }
}

// MARK: - WKScriptMessageHandler for WebView → Native communication

final class NativeAudioMessageHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }

        let manager = USBAudioManager.shared

        switch action {
        case "getStatus":
            let status: [String: Any] = [
                "isUSB": manager.isUSBConnected,
                "deviceName": manager.connectedDeviceName,
                "portType": manager.connectedPortType,
                "isMicEnabled": manager.isMicEnabled
            ]
            if let data = try? JSONSerialization.data(withJSONObject: status),
               let json = String(data: data, encoding: .utf8) {
                let js = "if (window._nativeAudioResolve) { window._nativeAudioResolve(\(json)); window._nativeAudioResolve = null; }"
                DispatchQueue.main.async { [weak self] in
                    self?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }
            }

        case "selectUSB":
            manager.selectUSBInput()

        case "selectMic":
            manager.selectBuiltInMic()

        case "toggleMic":
            let enabled = body["enabled"] as? Bool ?? true
            manager.setMicEnabled(enabled)

        case "getInputs":
            let json = manager.getAvailableInputsJSON()
            let js = "if (window._nativeAudioInputsResolve) { window._nativeAudioInputsResolve(\(json)); window._nativeAudioInputsResolve = null; }"
            DispatchQueue.main.async { [weak self] in
                self?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }

        default:
            print("[NativeAudio] Unknown action: \(action)")
        }
    }
}
#endif
