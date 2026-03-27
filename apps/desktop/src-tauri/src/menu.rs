use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter,
};

/// Build the native menu bar for the application.
pub fn build_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let menu = Menu::new(app)?;

    // --- File menu ---
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new_file", "New File").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("new_notebook", "New Notebook").accelerator("CmdOrCtrl+Shift+N").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open_file", "Open File…").accelerator("CmdOrCtrl+O").build(app)?)
        .item(&MenuItemBuilder::with_id("open_folder", "Open Notebook Folder…").accelerator("CmdOrCtrl+Shift+O").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("close_tab", "Close Tab").accelerator("CmdOrCtrl+W").build(app)?)
        .close_window()
        .build()?;

    // --- Edit menu (use predefined items for clipboard/undo) ---
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&MenuItemBuilder::with_id("find", "Find…").accelerator("CmdOrCtrl+F").build(app)?)
        .build()?;

    // --- View menu ---
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar").accelerator("CmdOrCtrl+B").build(app)?)
        .item(&MenuItemBuilder::with_id("toggle_dark", "Toggle Dark Mode").accelerator("CmdOrCtrl+Shift+D").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    // --- Help menu ---
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("about", "About Notebook.md").build(app)?)
        .item(&MenuItemBuilder::with_id("check_updates", "Check for Updates…").build(app)?)
        .item(&MenuItemBuilder::with_id("docs", "Documentation").build(app)?)
        .build()?;

    // macOS app menu (standard)
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Notebook.md")
            .about(None)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        menu.append(&app_menu)?;
    }

    menu.append(&file_menu)?;
    menu.append(&edit_menu)?;
    menu.append(&view_menu)?;
    menu.append(&help_menu)?;

    Ok(menu)
}

/// Handle menu item click events — emit them to the frontend.
pub fn handle_menu_event(app: &AppHandle, event_id: &str) {
    let _ = app.emit("menu-action", event_id);
}
