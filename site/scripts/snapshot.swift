// Renders a local HTML file to a PNG at exact pixel size with WebKit (used by gen-og.ts).
// Usage: swift snapshot.swift <in.html> <out.png> <width> <height>
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count == 5, Double(args[3]) != nil, Double(args[4]) != nil else {
  FileHandle.standardError.write("usage: snapshot.swift <in.html> <out.png> <width> <height>\n".data(using: .utf8)!)
  exit(2)
}
let w = Double(args[3])!
let h = Double(args[4])!
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

final class Snapper: NSObject, WKNavigationDelegate {
  func webView(_ web: WKWebView, didFinish _: WKNavigation!) {
    // Wait for web fonts (display=block) before taking the picture.
    web.evaluateJavaScript("document.fonts.ready.then(() => true)") { _, _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        let cfg = WKSnapshotConfiguration()
        cfg.rect = CGRect(x: 0, y: 0, width: w, height: h)
        web.takeSnapshot(with: cfg) { image, error in
          guard let image, let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            FileHandle.standardError.write("snapshot failed: \(error?.localizedDescription ?? "no image")\n".data(using: .utf8)!)
            exit(1)
          }
          // Draw into an exact w×h bitmap so Retina screens don't double the size.
          let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(w), pixelsHigh: Int(h), bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0, bitsPerPixel: 0)!
          NSGraphicsContext.saveGraphicsState()
          NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
          NSGraphicsContext.current?.imageInterpolation = .high
          NSGraphicsContext.current?.cgContext.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
          NSGraphicsContext.restoreGraphicsState()
          do {
            try rep.representation(using: .png, properties: [:])!.write(to: output)
            exit(0)
          } catch {
            FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!)
            exit(1)
          }
        }
      }
    }
  }

  func webView(_: WKWebView, didFail _: WKNavigation!, withError error: Error) {
    FileHandle.standardError.write("load failed: \(error)\n".data(using: .utf8)!)
    exit(1)
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let web = WKWebView(frame: CGRect(x: 0, y: 0, width: w, height: h))
let snapper = Snapper()
web.navigationDelegate = snapper
web.loadFileURL(input, allowingReadAccessTo: input.deletingLastPathComponent())
DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
  FileHandle.standardError.write("timed out\n".data(using: .utf8)!)
  exit(1)
}
app.run()
