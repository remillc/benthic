// SPDX-License-Identifier: GPL-2.0
// The depth and water temperature samples an Apple Watch Ultra writes into Apple Health
// (to-do #67), read only. The app cuts them into dives and turns them into a logbook file in
// JavaScript (app/src/lib/health-dives.js); nothing is written to Health.
import Capacitor
import Foundation
import HealthKit

extension OpenDivesCorePlugin {
    private static let healthStore = HKHealthStore()

    /// healthDives({ from, to }) — ms since 1970 — resolves { available, depth: [{ id, at, value }],
    /// temperature: [{ id, at, value }] }: metres and degrees Celsius. `available` is false where Health
    /// has no such data (iPad, iOS before 16). HealthKit never says whether reading was refused: a
    /// refusal looks like no data, which the screen explains.
    @objc func healthDives(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *), HKHealthStore.isHealthDataAvailable(),
           let depthType = HKObjectType.quantityType(forIdentifier: .underwaterDepth),
           let tempType = HKObjectType.quantityType(forIdentifier: .waterTemperature) {
            readHealthDives(call, depthType: depthType, tempType: tempType)
        } else {
            call.resolve(["available": false, "depth": [], "temperature": []])
        }
    }

    private func readHealthDives(_ call: CAPPluginCall, depthType: HKQuantityType, tempType: HKQuantityType) {
        let to = Date(timeIntervalSince1970: (call.getDouble("to") ?? Date().timeIntervalSince1970 * 1000) / 1000)
        let from = Date(timeIntervalSince1970: (call.getDouble("from") ?? 0) / 1000)
        let store = Self.healthStore
        store.requestAuthorization(toShare: nil, read: [depthType, tempType]) { _, error in
            if let error = error {
                call.reject("HEALTH_FAILED", "HEALTH_FAILED", error)
                return
            }
            let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
            let byStart = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            let group = DispatchGroup()
            var depth: [[String: Any]] = []
            var temperature: [[String: Any]] = []
            var failure: Error?
            // The two queries answer on their own threads.
            let lock = NSLock()
            func read(_ type: HKQuantityType, _ unit: HKUnit, _ done: @escaping ([[String: Any]]) -> Void) {
                group.enter()
                let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: byStart) { _, samples, error in
                    let values: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map { sample in
                        [
                            "id": sample.uuid.uuidString,
                            "at": sample.startDate.timeIntervalSince1970 * 1000,
                            "value": sample.quantity.doubleValue(for: unit),
                        ]
                    }
                    lock.lock()
                    if let error = error { failure = error }
                    done(values)
                    lock.unlock()
                    group.leave()
                }
                store.execute(query)
            }
            read(depthType, .meter()) { depth = $0 }
            read(tempType, .degreeCelsius()) { temperature = $0 }
            group.notify(queue: .main) {
                if let failure = failure, depth.isEmpty {
                    call.reject("HEALTH_FAILED", "HEALTH_FAILED", failure)
                    return
                }
                call.resolve(["available": true, "depth": depth, "temperature": temperature])
            }
        }
    }
}
