import UIKit
import Vision
import VisionKit

/// Scans one certification card (inbox task 2026-11-18-277): VisionKit's document camera does the framing,
/// the capture, the crop and the straightening; Vision then reads the text on the device (French and English).
/// Calls `done` once with {action: "cancelled"} or {action: "done", image (base64 JPEG), text (lines, one per line)}.
/// Every rule about what the text means is in the app's JavaScript (app/src/lib/card-scan.js).
final class DocumentScanController: NSObject, VNDocumentCameraViewControllerDelegate {
    static var isSupported: Bool { VNDocumentCameraViewController.isSupported }

    let viewController = VNDocumentCameraViewController()
    private let done: ([String: Any]) -> Void
    private var finished = false
    /// Keeps this controller alive while the camera is shown (the delegate is weak).
    private var selfRetain: DocumentScanController?

    init(done: @escaping ([String: Any]) -> Void) {
        self.done = done
        super.init()
        selfRetain = self
        viewController.delegate = self
    }

    private func finish(_ result: [String: Any]) {
        guard !finished else { return }
        finished = true
        done(result)
        selfRetain = nil
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        finish(["action": "cancelled"])
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true)
        finish(["action": "cancelled"])
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        controller.dismiss(animated: true)
        guard scan.pageCount > 0 else { return finish(["action": "cancelled"]) }
        // One page: the card.
        let image = scan.imageOfPage(at: 0)
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let text = DocumentScanController.recognise(image)
            let jpeg = image.jpegData(compressionQuality: 0.9)
            DispatchQueue.main.async {
                guard let jpeg else { return self.finish(["action": "cancelled"]) }
                self.finish(["action": "done", "image": jpeg.base64EncodedString(), "text": text])
            }
        }
    }

    /// The recognised lines; '' when nothing is read.
    private static func recognise(_ image: UIImage) -> String {
        guard let cgImage = image.cgImage else { return "" }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["fr-FR", "en-US"]
        request.usesLanguageCorrection = false
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: CGImagePropertyOrientation(image.imageOrientation), options: [:])
        do {
            try handler.perform([request])
        } catch {
            return ""
        }
        let observations = request.results ?? []
        return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}

private extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
