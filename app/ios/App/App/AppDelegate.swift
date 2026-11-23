import UIKit
import Capacitor
import BenthicCore
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Before the end of the launch, or iOS refuses it: resumes an offline map download in the background.
        MapsManager.registerBackgroundTask()
        registerAccessRequestCategory()
        return true
    }

    // MARK: - Push notifications of access requests (inbox task 2026-11-23-356)
    //
    // The server sends an APNs alert push when a new device asks a paired device for the data key (category ACCESS_REQUEST, thread
    // access-requests, collapse id = the request id, loc-keys ACCESS_REQUEST_TITLE and ACCESS_REQUEST_BODY of Localizable.strings),
    // and a background push ({"type": "access-request-done", "requestId": ...}) when it was answered, refused or cleaned up.

    /** The category of the notification, with its one action « Répondre » (it opens the app: no « Autoriser », the code is compared in the app). */
    private func registerAccessRequestCategory() {
        let answer = UNNotificationAction(
            identifier: "answer",
            title: NSLocalizedString("ACCESS_REQUEST_ACTION", comment: "Answer an access request"),
            options: [.foreground]
        )
        let category = UNNotificationCategory(identifier: "ACCESS_REQUEST", actions: [answer], intentIdentifiers: [], options: [])
        let center = UNUserNotificationCenter.current()
        // The categories the web layer registered stay: the list is merged, not replaced (lib/action-types.js does the same).
        center.getNotificationCategories { existing in
            var all = existing.filter { $0.identifier != category.identifier }
            all.insert(category)
            center.setNotificationCategories(all)
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // The push plugin turns it into its "registration" event.
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    /**
     * A background push (content-available). « access-request-done »: the request was answered on another device or refused, so its
     * notification leaves the lock screen and the notification centre. iOS may not wake a force-quit app for it: the notification then
     * stays until it is touched (the app shows « Cette demande n’existe plus ») or removed by the diver.
     */
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        guard (userInfo["type"] as? String) == "access-request-done", let requestId = userInfo["requestId"] as? String else {
            completionHandler(.noData)
            return
        }
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let ids = delivered
                .filter { ($0.request.content.userInfo["requestId"] as? String) == requestId || $0.request.identifier == requestId }
                .map { $0.request.identifier }
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
            completionHandler(ids.isEmpty ? .noData : .newData)
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
