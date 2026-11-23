import Foundation

/// Offline maps were removed. Versions before it stored downloaded regions in Application Support
/// (`maps/`, `maps-state.json`). `remove()` deletes what is left of them; it does nothing on a device
/// that never had them, so it runs at every start.
enum LegacyOfflineMaps {
    static func remove() {
        let fm = FileManager.default
        guard let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
        for name in ["maps", "maps-state.json", "maps-state.json.tmp"] {
            let url = base.appendingPathComponent(name)
            if fm.fileExists(atPath: url.path) { try? fm.removeItem(at: url) }
        }
    }
}
