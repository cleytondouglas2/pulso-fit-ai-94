import SwiftUI
import UIKit
import WebKit

@main
struct PulsoFitNativeApp: App {
    var body: some Scene {
        WindowGroup {
            PulsoFitBrowser()
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}

/// WKWebView hosts the existing PulsoFit website and exposes a strictly scoped
/// CoreLocation bridge. It is not a PWA: background updates come from native iOS.
struct PulsoFitBrowser: UIViewRepresentable {
    private let site = URL(string: "https://pulso-fit-ai-95-online.onrender.com")!

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "pulsoLocation")
        controller.addUserScript(WKUserScript(
            source: "window.PulsoFitNative = Object.freeze({isAvailable:true, platform:'ios'});",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.attach(web)
        web.load(URLRequest(url: site, cachePolicy: .useProtocolCachePolicy))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) { }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private weak var web: WKWebView?
        private let tracker = PulsoFitBackgroundTracker()

        override init() {
            super.init()
            tracker.deliver = { [weak self] event, data in
                self?.send(event: event, data: data)
            }
            NotificationCenter.default.addObserver(
                self, selector: #selector(onForeground),
                name: UIApplication.didBecomeActiveNotification, object: nil
            )
        }

        func attach(_ webView: WKWebView) { web = webView }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "pulsoLocation",
                  message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == "pulso-fit-ai-95-online.onrender.com",
                  message.frameInfo.securityOrigin.protocol == "https",
                  let object = message.body as? [String: Any],
                  let action = object["action"] as? String else { return }
            switch action {
            case "start", "resume": tracker.start()
            case "pause": tracker.pause()
            case "finish": tracker.finish()
            default: break
            }
        }

        private func send(event: String, data: [String: Any]) {
            guard let web, UIApplication.shared.applicationState == .active,
                  let bytes = try? JSONSerialization.data(withJSONObject: data),
                  let payload = String(data: bytes, encoding: .utf8) else { return }
            let js = "window.dispatchEvent(new CustomEvent(" +
                String(data: try! JSONSerialization.data(withJSONObject: event, options: .fragmentsAllowed),
                       encoding: .utf8)! + ",{detail:" + payload + "}));"
            web.evaluateJavaScript(js, completionHandler: nil)
        }

        @objc private func onForeground() {
            tracker.flushBufferedPositions()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            tracker.flushBufferedPositions()
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Keep only the trusted service inside the app. Open external links
            // in Safari instead of loading arbitrary origins into the GPS bridge.
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel); return
            }
            if url.scheme == "https" && url.host == "pulso-fit-ai-95-online.onrender.com" {
                decisionHandler(.allow)
            } else {
                if ["http", "https"].contains(url.scheme ?? "") {
                    UIApplication.shared.open(url)
                }
                decisionHandler(.cancel)
            }
        }

        deinit { NotificationCenter.default.removeObserver(self) }
    }
}
