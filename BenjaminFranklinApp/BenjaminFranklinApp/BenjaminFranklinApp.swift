import SwiftUI
import UserNotifications

@main
struct BenjaminFranklinApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    #endif

    var body: some Scene {
        #if os(macOS)
        WindowGroup {
            ContentView()
                .frame(minWidth: 1024, minHeight: 700)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1280, height: 900)
        #else
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                UIApplication.shared.applicationIconBadgeNumber = 0
                UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            }
        }
        #endif
    }
}

#if os(iOS)
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    private let serverBase = "https://benjaminfranklinmusic.onrender.com"

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        requestPushPermission(application)
        return true
    }

    private func requestPushPermission(_ application: UIApplication) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if let error = error {
                print("[Push] Permission error: \(error)")
                return
            }
            guard granted else {
                print("[Push] Permission denied")
                return
            }
            print("[Push] Permission granted")
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
    }

    // APNs registration succeeded — send device token to server
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("[Push] Device token: \(token)")
        sendTokenToServer(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] Registration failed: \(error)")
    }

    private func sendTokenToServer(_ token: String) {
        guard let url = URL(string: "\(serverBase)/api/push/register-device") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Include cookies from WKWebView shared storage for auth
        let cookieStore = HTTPCookieStorage.shared
        if let cookies = cookieStore.cookies(for: URL(string: serverBase)!) {
            let headers = HTTPCookie.requestHeaderFields(with: cookies)
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        let body: [String: Any] = [
            "token": token,
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "com.benjaminfranklin.app"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[Push] Token send error: \(error)")
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[Push] Token sent to server, status: \(status)")
        }.resume()
    }

    // Show notifications even when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound])
    }

    // Handle notification tap — clear badge
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
        completionHandler()
    }
}
#endif
