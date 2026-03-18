import SwiftUI
import WebKit
import CoreLocation
import AVFoundation
import AuthenticationServices

// Request location permission so WKWebView can use navigator.geolocation
private class LocationPermissionManager: NSObject, CLLocationManagerDelegate {
    static let shared = LocationPermissionManager()
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
    }

    func requestPermission() {
        manager.requestWhenInUseAuthorization()
    }
}

struct ContentView: View {
    @State private var isLoading = true
    @State private var loadError: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            WebView(
                url: URL(string: "https://benjaminfranklinmusic.onrender.com")!,
                isLoading: $isLoading,
                loadError: $loadError
            )
            .ignoresSafeArea()
            .onAppear {
                LocationPermissionManager.shared.requestPermission()
            }

            if isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                        .tint(.yellow)
                    Text("Loading...")
                        .foregroundStyle(.white.opacity(0.5))
                        .font(.caption)
                }
            }

            if let error = loadError {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 48))
                        .foregroundStyle(.white.opacity(0.3))
                    Text("Cannot connect to server")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.6))
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.3))
                        .multilineTextAlignment(.center)
                    Text("Vérifiez votre connexion Internet")
                        .font(.caption2)
                        .foregroundStyle(.yellow.opacity(0.6))
                }
                .padding()
            }
        }
    }
}

#if os(macOS)
struct WebView: NSViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var loadError: String?

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, WKNavigationDelegate {
        let parent: WebView

        init(_ parent: WebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = true
                self.parent.loadError = nil
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = error.localizedDescription
            }
            // Retry after 2 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                webView.load(URLRequest(url: self.parent.url))
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url,
               navigationAction.navigationType == .linkActivated,
               url.host != "benjaminfranklinmusic.onrender.com" {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
#else
struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var loadError: String?

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        // Register native audio bridge message handler
        let audioHandler = NativeAudioMessageHandler()
        config.userContentController.add(audioHandler, name: "nativeAudio")

        // Inject JS bridge that the web page can call
        let bridgeScript = WKUserScript(source: """
            window.nativeAudio = {
                getStatus: function() {
                    return new Promise(function(resolve) {
                        window.webkit.messageHandlers.nativeAudio.postMessage({ action: 'getStatus' });
                        window._nativeAudioResolve = resolve;
                    });
                },
                selectUSB: function() {
                    window.webkit.messageHandlers.nativeAudio.postMessage({ action: 'selectUSB' });
                },
                selectMic: function() {
                    window.webkit.messageHandlers.nativeAudio.postMessage({ action: 'selectMic' });
                },
                toggleMic: function(enabled) {
                    window.webkit.messageHandlers.nativeAudio.postMessage({ action: 'toggleMic', enabled: enabled });
                },
                getInputs: function() {
                    return new Promise(function(resolve) {
                        window.webkit.messageHandlers.nativeAudio.postMessage({ action: 'getInputs' });
                        window._nativeAudioInputsResolve = resolve;
                    });
                }
            };
            console.log('[NativeAudio] Bridge injected');
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.scrollView.decelerationRate = .normal
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.scrollView.bouncesZoom = false
        webView.scrollView.delegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black

        // Connect WebView to USBAudioManager
        USBAudioManager.shared.webView = webView
        audioHandler.webView = webView

        // Allow web inspector in debug builds only
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        webView.load(URLRequest(url: url))
        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, UIScrollViewDelegate, ASWebAuthenticationPresentationContextProviding {
        let parent: WebView
        weak var webView: WKWebView?
        private var authSession: ASWebAuthenticationSession?

        init(_ parent: WebView) {
            self.parent = parent
        }

        // MARK: - ASWebAuthenticationPresentationContextProviding

        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
        }

        // MARK: - Google OAuth via system browser

        private func startGoogleAuth() {
            guard let webView = webView else { return }

            // Start from /api/auth/google?platform=ios — the server will encode _ios in the state
            // so the callback knows to redirect back via bfmusic:// URL scheme
            let authURL = URL(string: "https://benjaminfranklinmusic.onrender.com/api/auth/google?platform=ios")!

            let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: "bfmusic") { [weak self] callbackURL, error in
                self?.authSession = nil

                guard let callbackURL = callbackURL, error == nil else { return }

                // Parse token from bfmusic://auth-callback?token=JWT
                let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
                guard let token = components?.queryItems?.first(where: { $0.name == "token" })?.value else { return }

                // Inject auth-token cookie into WKWebView then reload the app
                let cookie = HTTPCookie(properties: [
                    .name: "auth-token",
                    .value: token,
                    .domain: "benjaminfranklinmusic.onrender.com",
                    .path: "/",
                    .secure: "TRUE",
                    .expires: Date().addingTimeInterval(7 * 24 * 60 * 60),
                ])!

                webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                    DispatchQueue.main.async {
                        webView.load(URLRequest(url: URL(string: "https://benjaminfranklinmusic.onrender.com")!))
                    }
                }
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            session.start()
        }

        // Prevent any zoom — WKWebView ignores scrollView min/max zoom settings
        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            return nil
        }

        func scrollViewDidEndZooming(_ scrollView: UIScrollView, with view: UIView?, atScale scale: CGFloat) {
            scrollView.setZoomScale(1.0, animated: false)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = true
                self.parent.loadError = nil
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
            }
            // Send current USB audio state to the freshly loaded page
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                USBAudioManager.shared.sendCurrentState()
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = error.localizedDescription
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                webView.load(URLRequest(url: self.parent.url))
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            let appHost = "benjaminfranklinmusic.onrender.com"

            // Intercept Google OAuth — redirect to system browser (ASWebAuthenticationSession)
            if url.host == appHost && url.path == "/api/auth/google" {
                decisionHandler(.cancel)
                startGoogleAuth()
                return
            }

            // Always allow same-domain navigations (any navigation type)
            if url.host == appHost || url.host?.hasSuffix("." + appHost) == true {
                decisionHandler(.allow)
                return
            }

            // Allow OAuth provider domains for Apple Sign-In (Google is handled above)
            let oauthHosts = ["appleid.apple.com"]
            if let host = url.host, oauthHosts.contains(host) {
                decisionHandler(.allow)
                return
            }

            // Allow about:blank, data: URLs, etc.
            if url.scheme == "about" || url.scheme == "data" || url.scheme == "blob" {
                decisionHandler(.allow)
                return
            }

            // Only open external links in Safari if user explicitly tapped a link
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        // Grant camera & microphone permissions only for our domain
        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            if origin.host == "benjaminfranklinmusic.onrender.com" {
                decisionHandler(.grant)
            } else {
                decisionHandler(.deny)
            }
        }

        // Accept self-signed certificates (for local dev HTTPS only)
        #if DEBUG
        func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
            if let trust = challenge.protectionSpace.serverTrust {
                completionHandler(.useCredential, URLCredential(trust: trust))
            } else {
                completionHandler(.performDefaultHandling, nil)
            }
        }
        #endif
    }
}
#endif

#Preview {
    ContentView()
}
