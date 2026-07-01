//! Native printing support.
//!
//! On Windows the frontend triggers `window.print()` directly (WebView2 supports it).
//! On macOS WKWebView `window.print()` is a no-op, so the frontend invokes this
//! command which drives the WKWebView's native print operation via AppKit. The
//! rendered output is shaped by the app's `@media print` stylesheet, so it prints
//! the active document content only.

/// Trigger the native print dialog for the given window's webview.
///
/// macOS only performs real work here; on every other platform this is a no-op that
/// returns `Ok(())`, so the command is always safe to invoke.
#[tauri::command]
pub async fn print_document(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::mpsc;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        window
            .with_webview(move |webview| {
                let result = unsafe { macos_print(&webview) };
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;

        // `with_webview` dispatches the closure onto the main thread; wait for it.
        rx.recv().map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
unsafe fn macos_print(webview: &tauri::webview::PlatformWebview) -> Result<(), String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSPrintInfo, NSWindow};
    use objc2_web_kit::WKWebView;

    // `with_webview` runs its closure on the main thread.
    if MainThreadMarker::new().is_none() {
        return Err("print must run on the main thread".into());
    }

    let wk_ptr = webview.inner() as *mut WKWebView;
    let window_ptr = webview.ns_window() as *mut NSWindow;

    if wk_ptr.is_null() || window_ptr.is_null() {
        return Err("webview or window handle was null".into());
    }

    let wk_webview: &WKWebView = &*wk_ptr;
    let ns_window: &NSWindow = &*window_ptr;

    let print_info = NSPrintInfo::sharedPrintInfo();
    let operation = wk_webview.printOperationWithPrintInfo(&print_info);

    // Present the standard print panel as a sheet on the document window.
    operation.setShowsPrintPanel(true);
    operation.setShowsProgressPanel(true);
    operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
        ns_window,
        None,
        None,
        std::ptr::null_mut(),
    );

    Ok(())
}
