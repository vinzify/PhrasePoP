use arboard::Clipboard;
use enigo::{Enigo, Key, Keyboard, Settings, Direction};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, Emitter};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::ShortcutState;

#[tauri::command]
fn capture_text() -> Result<String, String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    
    // Explicitly release the shortcut triggers so they don't break the global copy command
    let _ = enigo.key(Key::Alt, Direction::Release);
    let _ = enigo.key(Key::Control, Direction::Release);
    let _ = enigo.key(Key::Shift, Direction::Release);

    // Give it a tiny moment to un-register physically held keys
    thread::sleep(Duration::from_millis(50));

    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::Unicode('c'), Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
    
    // Give the OS a tiny moment to copy the text to clipboard
    thread::sleep(Duration::from_millis(150));
    
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let text = clipboard.get_text().map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
fn set_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[derive(serde::Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(serde::Deserialize)]
struct OllamaModel {
    name: String,
}

#[tauri::command]
async fn get_ollama_models(ollama_url: String) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", ollama_url.trim_end_matches('/'));
    
    let client = reqwest::Client::new();
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        
    if !res.status().is_success() {
        return Err(format!("Ollama returned error: {}", res.status()));
    }
    
    let json: OllamaTagsResponse = res.json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
        
    let models = json.models.into_iter().map(|m| m.name).collect();
    Ok(models)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let _ = app.get_webview_window("main").expect("no main window").show();
        let _ = app.get_webview_window("main").expect("no main window").set_focus();
    }))
    .plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts(["ctrl+alt+c"])
            .expect("Failed to register shortcut")
            .with_handler(|app, shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit("open-phrase-pop", ());
                    }
                }
            })
            .build(),
    )
    .invoke_handler(tauri::generate_handler![capture_text, set_clipboard, hide_window, get_ollama_models])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
      let open_i = MenuItem::with_id(app, "open", "Open PhrasePop", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&open_i, &settings_i, &quit_i])?;

      let _tray = TrayIconBuilder::new()
          .menu(&menu)
          .show_menu_on_left_click(true)
          .icon(app.default_window_icon().cloned().expect("Failed to get default icon"))
          .on_menu_event(|app, event| match event.id.as_ref() {
              "quit" => {
                  app.exit(0);
              }
              "open" => {
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.set_focus();
                  }
              }
              "settings" => {
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.set_focus();
                      // Emit event to frontend to open settings
                      let _ = app.emit("open-settings", ());
                  }
              }
              _ => {}
          })
          .on_tray_icon_event(|tray, event| match event {
              TrayIconEvent::Click {
                  button: MouseButton::Left,
                  button_state: MouseButtonState::Up,
                  ..
              } => {
                  let app = tray.app_handle();
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.set_focus();
                  }
              }
              _ => {}
          })
          .build(app)?;

      if let Some(window) = app.get_webview_window("main") {
          let window_clone = window.clone();
          window.on_window_event(move |event| {
              if let tauri::WindowEvent::Focused(focused) = event {
                  if !focused {
                      let _ = window_clone.hide();
                  }
              }
          });
          
          // Fix 1: Show the window explicitly on initial launch
          let _ = window.show();
          let _ = window.set_focus();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
