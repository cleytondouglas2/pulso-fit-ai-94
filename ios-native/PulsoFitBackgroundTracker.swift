import CoreLocation
import Foundation
import UIKit
import UserNotifications

/// Records actual GPS fixes using native iOS location services. The web page
/// may be suspended in background, so fixes are buffered for delivery on resume.
/// No network upload occurs here. Users start/stop tracking from Outdoor Live.
final class PulsoFitBackgroundTracker: NSObject, CLLocationManagerDelegate {
    var deliver: ((String, [String: Any]) -> Void)?

    private let manager = CLLocationManager()
    private var tracking = false
    private var paused = false
    private var startedAt: Date?
    private var pausedAt: Date?
    private var pausedDuration: TimeInterval = 0
    private var lastFix: CLLocation?
    private var distanceMeters: Double = 0
    private var lastNotice: Date = .distantPast
    private var queuedFixes: [[String: Any]] = []
    private var notificationsAllowed = false
    private let maxQueued = 2200

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
    }

    func start() {
        guard CLLocationManager.locationServicesEnabled() else {
            error("Ative os Serviços de Localização do iPhone.")
            return
        }
        if !tracking {
            distanceMeters = 0
            lastFix = nil
            queuedFixes.removeAll()
            startedAt = Date()
            pausedDuration = 0
        } else if let pausedAt {
            pausedDuration += Date().timeIntervalSince(pausedAt)
        }
        tracking = true
        paused = false
        pausedAt = nil
        requestNotificationPermission()
        authorizeAndTrack()
    }

    func pause() {
        guard tracking && !paused else { return }
        paused = true
        pausedAt = Date()
        manager.stopUpdatingLocation()
    }

    func finish() {
        tracking = false
        paused = false
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        lastFix = nil
        queuedFixes.removeAll()
        startedAt = nil
    }

    private func authorizeAndTrack() {
        let permission = manager.authorizationStatus
        switch permission {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            // An explicit Always grant is needed for reliable locked-screen GPS.
            manager.requestAlwaysAuthorization()
            manager.allowsBackgroundLocationUpdates = false
            manager.startUpdatingLocation()
            error("A localização está autorizada apenas durante o uso. Permita 'Sempre' em Ajustes para acompanhar com a tela bloqueada.")
        case .authorizedAlways:
            // Requires UIBackgroundModes = location in the signed native app.
            manager.allowsBackgroundLocationUpdates = true
            manager.startUpdatingLocation()
        case .denied, .restricted:
            tracking = false
            error("Permita o acesso à localização nos Ajustes do iOS.")
        @unknown default:
            tracking = false
            error("Não foi possível verificar a permissão de GPS.")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if tracking && !paused { authorizeAndTrack() }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        self.error("GPS indisponível: verifique sinal e permissões.")
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard tracking && !paused else { return }
        for location in locations {
            guard location.horizontalAccuracy >= 0,
                  location.horizontalAccuracy <= 80,
                  Date().timeIntervalSince(location.timestamp) < 120 else { continue }
            if let previous = lastFix {
                let seconds = location.timestamp.timeIntervalSince(previous.timestamp)
                let meters = location.distance(from: previous)
                if seconds <= 0 || meters < 3 { continue }
                // Reject impossible jumps rather than inflate walking/running distance.
                if meters / seconds > 23 { continue }
                if seconds <= 150 { distanceMeters += meters }
            }
            lastFix = location
            let data: [String: Any] = [
                "timestamp": Int(location.timestamp.timeIntervalSince1970 * 1000),
                "coords": [
                    "latitude": location.coordinate.latitude,
                    "longitude": location.coordinate.longitude,
                    "accuracy": location.horizontalAccuracy,
                    "altitude": location.verticalAccuracy >= 0 ? location.altitude : NSNull(),
                    "altitudeAccuracy": location.verticalAccuracy >= 0 ? location.verticalAccuracy : NSNull()
                ] as [String: Any]
            ]
            queuedFixes.append(data)
            if queuedFixes.count > maxQueued { queuedFixes.removeFirst(queuedFixes.count - maxQueued) }
            if UIApplication.shared.applicationState == .active {
                flushBufferedPositions()
            } else {
                notifyProgressIfDue()
            }
        }
    }

    func flushBufferedPositions() {
        guard tracking, UIApplication.shared.applicationState == .active else { return }
        let queued = queuedFixes
        queuedFixes.removeAll(keepingCapacity: true)
        for point in queued {
            deliver?("pulso-native-location", point)
        }
    }

    private func error(_ message: String) {
        deliver?("pulso-native-location-error", ["message": message])
    }

    private func elapsedSeconds() -> Int {
        guard let start = startedAt else { return 0 }
        let effectiveEnd = pausedAt ?? Date()
        return max(0, Int(effectiveEnd.timeIntervalSince(start) - pausedDuration))
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            DispatchQueue.main.async { self?.notificationsAllowed = granted }
        }
    }

    private func notifyProgressIfDue() {
        guard notificationsAllowed,
              Date().timeIntervalSince(lastNotice) >= 300 else { return }
        lastNotice = Date()
        let seconds = elapsedSeconds()
        let duration = String(format: "%02d:%02d:%02d", seconds / 3600,
                              (seconds % 3600) / 60, seconds % 60)
        let content = UNMutableNotificationContent()
        content.title = "⏱ PulsoFit • Atividade em andamento"
        content.body = "Tempo: \(duration) · Distância GPS: \(String(format: "%.2f", distanceMeters / 1000)) km"
        content.sound = nil
        // Group progress messages; do not continuously replace the lock-screen UI.
        content.threadIdentifier = "pulsofit-outdoor-live"
        let request = UNNotificationRequest(identifier: "pulsofit-progress-\(Int(Date().timeIntervalSince1970))",
                                             content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
}
