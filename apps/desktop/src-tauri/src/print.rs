//! Native printing support.
//!
//! On Windows the frontend triggers `window.print()` directly (WebView2 supports it).
//! On macOS WKWebView `window.print()` is a no-op, so the frontend invokes this
//! command which drives the WKWebView's native print operation via AppKit. The
//! rendered output is shaped by the app's `@media print` stylesheet, so it prints
//! the active document content only.

/// Trigger the native print dialog for the given window's webview.
///
/// `margins` is the user's margin preference (`narrow` | `regular` | `wide`); on
/// macOS it configures `NSPrintInfo` margins, since WKWebView ignores CSS `@page`
/// margins. Only macOS performs real work here; on every other platform this is a
/// no-op that returns `Ok(())`, so the command is always safe to invoke.
#[tauri::command]
pub async fn print_document(
    window: tauri::WebviewWindow,
    margins: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::mpsc;

        let margin_points = margin_points(margins.as_deref());
        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        window
            .with_webview(move |webview| {
                let result = unsafe { macos_print(&webview, margin_points) };
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;

        // `with_webview` dispatches the closure onto the main thread; wait for it.
        rx.recv().map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, margins);
        Ok(())
    }
}

/// Map a margin preference to a page-margin size in points (72pt = 1 inch).
#[cfg(target_os = "macos")]
fn margin_points(margins: Option<&str>) -> f64 {
    match margins {
        Some("narrow") => 36.0, // 0.5"
        Some("wide") => 72.0,   // 1.0"
        _ => 54.0,              // 0.75" (regular / default)
    }
}

#[cfg(target_os = "macos")]
unsafe fn macos_print(
    webview: &tauri::webview::PlatformWebview,
    margin_points: f64,
) -> Result<(), String> {
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

    // WKWebView's print operation ignores CSS `@page` margins, so drive them here.
    print_info.setTopMargin(margin_points);
    print_info.setBottomMargin(margin_points);
    print_info.setLeftMargin(margin_points);
    print_info.setRightMargin(margin_points);

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
