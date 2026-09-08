import Quartz
import WebKit

/// macOS Quick Look Preview Extension
final class PreviewViewController: NSViewController, QLPreviewingController, WKNavigationDelegate,
    WKScriptMessageHandler, WKURLSchemeHandler
{
    private static let previewScheme = "visionscope-preview"
    private var webView: WKWebView!
    private var securityScopedURL: URL?
    private var previewFileURL: URL?
    private var previewFilename: String?
    private var pendingQLHandler: ((Error?) -> Void)?
    private var isWebReady = false
    private var isPreviewDelivered = false
    private var hasNotifiedQuickLook = false

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        config.userContentController.add(self, name: "visionscope")
        config.setURLSchemeHandler(self, forURLScheme: Self.previewScheme)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        view = webView

        // 默认 16:9，避免 Quick Look 首次布局使用系统默认尺寸
        applyPreviewLayout(GeneratedQuickLookConfig.PreviewLayoutGroup.threeD.preferredSize)
    }

    deinit {
        if let url = securityScopedURL {
            url.stopAccessingSecurityScopedResource()
        }
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        if let previous = securityScopedURL {
            previous.stopAccessingSecurityScopedResource()
            securityScopedURL = nil
        }

        isWebReady = false
        isPreviewDelivered = false
        hasNotifiedQuickLook = false
        previewFileURL = nil
        previewFilename = nil
        pendingQLHandler = handler

        _ = url.startAccessingSecurityScopedResource()
        securityScopedURL = url

        previewFileURL = url
        previewFilename = url.lastPathComponent

        let ext = url.pathExtension.lowercased()
        guard GeneratedQuickLookConfig.unionExtensions.contains(ext) else {
            finishQL(with: PreviewError.unsupportedType)
            return
        }

        let layout = GeneratedQuickLookConfig.PreviewLayoutGroup.forExtension(ext)
        applyPreviewLayout(layout.preferredSize)
        guard loadWebPreview() else { return }
        // 立即告知 Quick Look 预览尺寸；3D/文档在 WebView 内异步加载，避免先默认大小再跳到 16:9
        notifyQuickLookReady()
    }

    private func applyPreviewLayout(_ size: NSSize) {
        preferredContentSize = size
        view.setFrameSize(size)
        webView.setFrameSize(size)
    }

    private func notifyQuickLookReady() {
        guard !hasNotifiedQuickLook else { return }
        hasNotifiedQuickLook = true
        finishQL(with: nil)
    }

    @discardableResult
    private func loadWebPreview() -> Bool {
        guard let htmlURL = Bundle.main.url(forResource: "quicklook", withExtension: "html", subdirectory: "web") else {
            finishQL(with: PreviewError.missingWebAssets)
            return false
        }

        let webRoot = htmlURL.deletingLastPathComponent()
        webView.loadFileURL(htmlURL, allowingReadAccessTo: webRoot)
        return true
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "visionscope", let body = message.body as? String else { return }

        switch body {
        case "ready":
            isWebReady = true
            deliverPreviewFile()
        case "loaded":
            isPreviewDelivered = true
        case "error":
            if !hasNotifiedQuickLook {
                finishQL(with: PreviewError.previewRenderFailed)
            }
        default:
            break
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // 只等 JS 发 ready，不在 HTML didFinish 时过早投递（ES module 尚未加载完）
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[VisionScope Quick Look] navigation error: \(error.localizedDescription)")
        finishQL(with: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[VisionScope Quick Look] provisional navigation error: \(error.localizedDescription)")
        finishQL(with: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[VisionScope Quick Look] WebContent process terminated")
        finishQL(with: PreviewError.webContentTerminated)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let requestURL = urlSchemeTask.request.url!

        // `visionscope-preview://web/<path>` → serve static assets from the .appex `Resources/web/`
        // (DuckDB worker/wasm 等资源走此 scheme，绕过 WKWebView 对 file:// fetch 的 HTTP 0 限制)
        if requestURL.host == "web" {
            serveWebAsset(requestURL, for: urlSchemeTask)
            return
        }

        guard let fileURL = previewFileURL else {
            urlSchemeTask.didFailWithError(PreviewError.missingFileData)
            return
        }

        let mimeType = mimeTypeForPreviewFile()
        
        do {
            let fileHandle = try FileHandle(forReadingFrom: fileURL)
            let fileSize = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            
            // Parse Range header
            var startOffset: UInt64 = 0
            var endOffset: UInt64 = UInt64(fileSize - 1)
            var statusCode = 200
            
            if let rangeHeader = urlSchemeTask.request.value(forHTTPHeaderField: "Range") {
                // Parse "bytes=start-end" format using NSRegularExpression for macOS 12 compatibility
                let pattern = "bytes=(\\d+)-(\\d*)"
                if let regex = try? NSRegularExpression(pattern: pattern, options: []),
                   let match = regex.firstMatch(in: rangeHeader, options: [], range: NSRange(rangeHeader.startIndex..., in: rangeHeader)) {
                    
                    if let startRange = Range(match.range(at: 1), in: rangeHeader),
                       let start = UInt64(rangeHeader[startRange]) {
                        startOffset = start
                    }
                    
                    if match.range(at: 2).location != NSNotFound,
                       let endRange = Range(match.range(at: 2), in: rangeHeader),
                       !rangeHeader[endRange].isEmpty,
                       let end = UInt64(rangeHeader[endRange]) {
                        endOffset = min(end, UInt64(fileSize - 1))
                    }
                    
                    statusCode = 206 // Partial Content
                }
            }
            
            let contentLength = endOffset - startOffset + 1
            
            var headers = [
                "Content-Type": mimeType,
                "Content-Length": String(contentLength),
                "Accept-Ranges": "bytes"
            ]
            
            if statusCode == 206 {
                headers["Content-Range"] = "bytes \(startOffset)-\(endOffset)/\(fileSize)"
            }
            
            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            
            urlSchemeTask.didReceive(response)
            
            // Stream data in chunks
            try fileHandle.seek(toOffset: startOffset)
            let chunkSize = 1024 * 1024 // 1MB chunks
            var remaining = contentLength
            
            while remaining > 0 {
                let chunkLength = min(UInt64(chunkSize), remaining)
                if let chunk = try fileHandle.read(upToCount: Int(chunkLength)) {
                    urlSchemeTask.didReceive(chunk)
                    remaining -= UInt64(chunk.count)
                } else {
                    break
                }
            }
            
            try fileHandle.close()
            urlSchemeTask.didFinish()
            
        } catch {
            NSLog("[VisionScope Quick Look] streaming error: \(error.localizedDescription)")
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func deliverPreviewFile() {
        guard !isPreviewDelivered, isWebReady else { return }

        if previewFileURL == nil || previewFilename == nil {
            finishQL(with: PreviewError.missingFileData)
            return
        }

        let escapedName = jsEscape(previewFilename!)
        let previewURL = "\(Self.previewScheme)://file/\(escapedName)"
        let script = "window.__visionScopeQuickLook?.previewFileFromUrl('\(previewURL)', '\(escapedName)')"
        webView.evaluateJavaScript(script) { _, error in
            if let error {
                NSLog("[VisionScope Quick Look] JS preview error: \(error.localizedDescription)")
                if !self.hasNotifiedQuickLook {
                    self.finishQL(with: PreviewError.previewRenderFailed)
                }
            }
        }
    }

    /// Serve a static asset from the .appex `Resources/web/` directory (DuckDB worker/wasm 等)。
    private func serveWebAsset(_ requestURL: URL, for urlSchemeTask: WKURLSchemeTask) {
        // path = /<relative path under web/>
        var relativePath = requestURL.path
        if relativePath.hasPrefix("/") {
            relativePath = String(relativePath.dropFirst())
        }
        relativePath = (relativePath as NSString).standardizingPath
        if relativePath.hasPrefix("..") || relativePath.hasPrefix("/") {
            urlSchemeTask.didFailWithError(PreviewError.missingWebAssets)
            return
        }

        guard
            let webRoot = Bundle.main.url(forResource: "quicklook", withExtension: "html", subdirectory: "web")?.deletingLastPathComponent(),
            let assetURL = URL(string: relativePath, relativeTo: webRoot)
        else {
            urlSchemeTask.didFailWithError(PreviewError.missingWebAssets)
            return
        }

        let mime = Self.mimeType(forPathExtension: (relativePath as NSString).pathExtension)

        do {
            let fileHandle = try FileHandle(forReadingFrom: assetURL)
            let fileSize = try assetURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0

            var startOffset: UInt64 = 0
            var endOffset: UInt64 = UInt64(max(fileSize - 1, 0))
            var statusCode = 200

            if let rangeHeader = urlSchemeTask.request.value(forHTTPHeaderField: "Range") {
                let pattern = "bytes=(\\d+)-(\\d*)"
                if let regex = try? NSRegularExpression(pattern: pattern, options: []),
                   let match = regex.firstMatch(in: rangeHeader, options: [], range: NSRange(rangeHeader.startIndex..., in: rangeHeader)) {
                    if let startRange = Range(match.range(at: 1), in: rangeHeader),
                       let start = UInt64(rangeHeader[startRange]) {
                        startOffset = start
                    }
                    if match.range(at: 2).location != NSNotFound,
                       let endRange = Range(match.range(at: 2), in: rangeHeader),
                       !rangeHeader[endRange].isEmpty,
                       let end = UInt64(rangeHeader[endRange]) {
                        endOffset = min(end, UInt64(max(fileSize - 1, 0)))
                    }
                    statusCode = 206
                }
            }

            let contentLength = endOffset - startOffset + 1
            var headers = [
                "Content-Type": mime,
                "Content-Length": String(contentLength),
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*"
            ]
            if statusCode == 206 {
                headers["Content-Range"] = "bytes \(startOffset)-\(endOffset)/\(fileSize)"
            }

            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            urlSchemeTask.didReceive(response)

            try fileHandle.seek(toOffset: startOffset)
            let chunkSize = 1024 * 1024
            var remaining = contentLength
            while remaining > 0 {
                let chunkLength = min(UInt64(chunkSize), remaining)
                if let chunk = try fileHandle.read(upToCount: Int(chunkLength)) {
                    urlSchemeTask.didReceive(chunk)
                    remaining -= UInt64(chunk.count)
                } else {
                    break
                }
            }
            try fileHandle.close()
            urlSchemeTask.didFinish()
        } catch {
            NSLog("[VisionScope Quick Look] serveWebAsset error: \(error.localizedDescription)")
            urlSchemeTask.didFailWithError(error)
        }
    }

    private static func mimeType(forPathExtension ext: String) -> String {
        switch ext.lowercased() {
        case "js", "mjs": return "text/javascript"
        case "wasm": return "application/wasm"
        case "css": return "text/css"
        case "json": return "application/json"
        case "html": return "text/html"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "map": return "application/json"
        default: return "application/octet-stream"
        }
    }

    private func mimeTypeForPreviewFile() -> String {
        guard let name = previewFilename else { return "application/octet-stream" }
        let ext = (name as NSString).pathExtension.lowercased()
        return GeneratedQuickLookConfig.previewMimeTypes[ext] ?? "application/octet-stream"
    }

    private func finishQL(with error: Error?) {
        guard let handler = pendingQLHandler else { return }
        pendingQLHandler = nil
        handler(error)
    }

    private func jsEscape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
    }

    private enum PreviewError: Error {
        case unsupportedType
        case missingWebAssets
        case missingFileData
        case webContentTerminated
        case previewRenderFailed
    }
}
