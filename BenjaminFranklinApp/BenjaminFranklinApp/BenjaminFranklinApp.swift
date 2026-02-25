import SwiftUI

@main
struct BenjaminFranklinApp: App {
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
        #endif
    }
}
