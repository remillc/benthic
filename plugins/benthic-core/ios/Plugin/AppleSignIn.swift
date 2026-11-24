import AuthenticationServices
import UIKit

/// Sign in with Apple (AuthenticationServices, no library). The app's JavaScript makes the nonce and sends its SHA-256
/// here; the Benthic server checks the identity token (signature, audience, nonce) and makes the session. Nothing is kept
/// on the device. Calls `done` once with {action: "cancelled"}, {action: "failed", message} or {action: "done",
/// identityToken, authorizationCode, email, givenName, familyName} (the address and the name come on the first sign-in only).
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let anchor: UIWindow
    private let done: ([String: Any]) -> Void
    private var finished = false
    /// Keeps this object alive while Apple's sheet is shown (the controller's delegate is weak).
    private var selfRetain: AppleSignIn?

    init(anchor: UIWindow, done: @escaping ([String: Any]) -> Void) {
        self.anchor = anchor
        self.done = done
        super.init()
        selfRetain = self
    }

    func start(nonceHash: String) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonceHash
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    private func finish(_ result: [String: Any]) {
        guard !finished else { return }
        finished = true
        done(result)
        selfRetain = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            finish(["action": "failed", "message": "No identity token"])
            return
        }
        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        finish([
            "action": "done",
            "identityToken": token,
            "authorizationCode": code,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? "",
        ])
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            finish(["action": "cancelled"])
        } else {
            finish(["action": "failed", "message": error.localizedDescription])
        }
    }
}
