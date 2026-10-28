use arboard::Clipboard;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct ClipboardState(Arc<Mutex<Option<Clipboard>>>);
#[derive(Clone, Serialize)]
struct DesktopInfo {
    platform: String,
    wayland: bool,
    shortcut_supported: bool,
    shortcut: String,
    shortcut_note: String,
    clipboard_requested: bool,
}
struct DesktopState(Mutex<DesktopInfo>);

fn wayland(session: Option<&str>, display: Option<&str>) -> bool {
    session == Some("wayland") || display.is_some_and(|value| !value.is_empty())
}

fn valid_text(text: String) -> Result<String, String> {
    if text.len() > 200_000 {
        return Err("Clipboard text is too large. Paste a shorter excerpt (up to 200 KB).".into());
    }
    if text.trim().is_empty() {
        return Err(
            "No text is available. Copy some text first, or paste/type directly in PhrasePoP."
                .into(),
        );
    }
    Ok(text)
}

#[tauri::command]
async fn read_clipboard(state: tauri::State<'_, ClipboardState>) -> Result<String, String> {
    let state = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut clipboard = state.lock().map_err(|_| "Clipboard is busy.")?;
        if clipboard.is_none() { *clipboard = Some(Clipboard::new().map_err(|_| "Clipboard access is unavailable. Paste into the input field instead.")?); }
        let text = clipboard.as_mut().ok_or("Clipboard unavailable.")?.get_text()
            .map_err(|_| "No readable clipboard text. Copy some text first, or paste directly into the input field.")?;
        valid_text(text)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_clipboard(
    text: String,
    state: tauri::State<'_, ClipboardState>,
) -> Result<(), String> {
    let state = state.0.clone();
    let text = valid_text(text)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut clipboard = state.lock().map_err(|_| "Clipboard is busy.")?;
        if clipboard.is_none() {
            *clipboard = Some(Clipboard::new().map_err(|_| {
                "Clipboard access is unavailable. Select and copy the result manually."
            })?);
        }
        clipboard
            .as_mut()
            .ok_or("Clipboard unavailable.")?
            .set_text(text)
            .map_err(|_| {
                "Could not write to the clipboard. Select and copy the result manually.".into()
            })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_desktop_info(state: tauri::State<'_, DesktopState>) -> Result<DesktopInfo, String> {
    state
        .0
        .lock()
        .map(|info| info.clone())
        .map_err(|_| "Desktop preferences are busy.".into())
}

fn preferences(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("shortcut.json"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_shortcut(
    app: AppHandle,
    shortcut: String,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    let mut info = state
        .0
        .lock()
        .map_err(|_| "Desktop preferences are busy.")?;
    if !info.shortcut_supported {
        return Err(info.shortcut_note.clone());
    }
    let parsed: tauri_plugin_global_shortcut::Shortcut = shortcut
        .parse()
        .map_err(|_| "Enter a valid shortcut, for example Ctrl+Alt+C.")?;
    if !info.shortcut.is_empty() {
        app.global_shortcut()
            .unregister(info.shortcut.as_str())
            .map_err(|e| e.to_string())?;
    }
    if let Err(error) = app.global_shortcut().register(parsed) {
        if !info.shortcut.is_empty() {
            let _ = app.global_shortcut().register(info.shortcut.as_str());
        }
        return Err(format!(
            "Could not register shortcut: {error}. Choose an unused combination."
        ));
    }
    let path = preferences(&app)?;
    let saved = (|| {
        std::fs::create_dir_all(path.parent().ok_or("Invalid settings path.")?)
            .map_err(|e| e.to_string())?;
        std::fs::write(
            &path,
            serde_json::to_vec(&shortcut).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    })();
    if let Err(error) = saved {
        let _ = app.global_shortcut().unregister(parsed);
        if !info.shortcut.is_empty() {
            let _ = app.global_shortcut().register(info.shortcut.as_str());
        }
        return Err(error);
    }
    info.shortcut = shortcut;
    Ok(())
}

fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let session = std::env::var("XDG_SESSION_TYPE").ok();
    let display = std::env::var("WAYLAND_DISPLAY").ok();
    let is_wayland = cfg!(target_os = "linux") && wayland(session.as_deref(), display.as_deref());
    let clipboard_requested = std::env::args().any(|arg| arg == "--clipboard");
    let info = DesktopInfo {
        platform: std::env::consts::OS.into(),
        wayland: is_wayland,
        shortcut_supported: !is_wayland,
        shortcut: String::new(),
        shortcut_note: if is_wayland {
            "On Wayland, assign a desktop shortcut to phrasepop --clipboard. Automatic cross-app selection capture is not used.".into()
        } else {
            "Copy text first. The shortcut opens PhrasePoP and requests the clipboard; it does not simulate keystrokes.".into()
        },
        clipboard_requested,
    };
    tauri::Builder::default()
        .manage(ClipboardState(Arc::new(Mutex::new(None))))
        .manage(DesktopState(Mutex::new(info)))
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            show(app);
            if args.iter().any(|arg| arg == "--clipboard") { let _ = app.emit("clipboard-requested", ()); }
        }))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .invoke_handler(tauri::generate_handler![read_clipboard, set_clipboard, get_desktop_info, set_shortcut])
        .setup(move |app| {
            if !is_wayland {
                let plugin = tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Released { show(app); let _ = app.emit("clipboard-requested", ()); }
                }).build();
                let installed = app.handle().plugin(plugin);
                let initialized = installed.is_ok();
                let default = if cfg!(target_os = "macos") { "Command+Alt+C" } else { "Ctrl+Alt+C" };
                let shortcut = preferences(app.handle()).ok().and_then(|path| std::fs::read(path).ok())
                    .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok()).unwrap_or(default.into());
                let registered = installed.map_err(|e| e.to_string()).and_then(|_| app.global_shortcut().register(shortcut.as_str()).map_err(|e| e.to_string()));
                if let Ok(mut info) = app.state::<DesktopState>().0.lock() {
                    match registered {
                        Ok(()) => info.shortcut = shortcut,
                        Err(error) => { info.shortcut_supported = initialized; info.shortcut_note = if initialized { format!("Default shortcut unavailable: {error}. Choose another combination in Settings.") } else { format!("Global shortcut unavailable: {error}. Open the app normally and paste text.") }; }
                    }
                }
            }
            let open = MenuItem::with_id(app, "open", "Open PhrasePoP", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &settings, &quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(true).on_menu_event(|app, event| match event.id.as_ref() {
                "quit" => app.exit(0),
                "settings" => { show(app); let _ = app.emit("open-settings", ()); },
                _ => show(app),
            });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            let tray_available = match tray.build(app) {
                Ok(tray) => { app.manage(tray); true },
                Err(error) => { eprintln!("Tray unavailable; using a normal desktop window: {error}"); false },
            };
            if let Some(window) = app.get_webview_window("main") {
                if std::env::args().any(|arg| arg == "--minimized") && tray_available { let _ = window.hide(); }
                else { let _ = window.show(); }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PhrasePoP");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_scope_accepts_default_and_custom_ports() {
        use tauri_plugin_http::reqwest::Url;
        use urlpattern::{UrlPattern, UrlPatternMatchInput};
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let scope = capability["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["identifier"] == "http:default")
            .unwrap();
        let patterns: Vec<UrlPattern> = scope["allow"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| {
                let init = urlpattern::UrlPatternInit::parse_constructor_string::<regex::Regex>(
                    entry["url"].as_str().unwrap(),
                    None,
                )
                .unwrap();
                UrlPattern::parse(init, Default::default()).unwrap()
            })
            .collect();
        let allowed = |address: &str| {
            patterns.iter().any(|pattern| {
                pattern
                    .test(UrlPatternMatchInput::Url(Url::parse(address).unwrap()))
                    .unwrap()
            })
        };
        for address in [
            "http://localhost:11434/api/generate",
            "http://127.0.0.1:1234/v1/models",
            "http://[::1]:11434/api/tags",
            "http://127.0.0.1:46797/api/generate",
            "https://api.openai.com/v1/chat/completions",
            "https://provider.example:8443/v1/models",
            "http://provider.example/api/tags",
        ] {
            assert!(allowed(address), "Provider endpoint blocked: {address}");
        }
        assert!(!allowed("file:///tmp/example"));
        assert!(!allowed("ftp://provider.example/model"));
    }
    #[test]
    fn wayland_detection_does_not_depend_on_xwayland_display() {
        assert!(wayland(Some("wayland"), None));
        assert!(wayland(None, Some("wayland-0")));
        assert!(!wayland(Some("x11"), None));
        assert!(!wayland(None, Some("")));
    }
    #[test]
    fn clipboard_limits_are_explicit() {
        assert!(valid_text(" ".into()).is_err());
        assert!(valid_text("a".repeat(200_001)).is_err());
        assert_eq!(valid_text("  hello è  ".into()).unwrap(), "  hello è  ");
    }
    #[test]
    fn shortcut_validation_uses_native_parser() {
        assert!("Ctrl+Alt+C"
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .is_ok());
        assert!("not a shortcut"
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .is_err());
    }
}
