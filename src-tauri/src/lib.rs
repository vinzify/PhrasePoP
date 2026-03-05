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
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
        
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

#[derive(serde::Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(serde::Deserialize)]
struct OllamaGenerateResponse {
    response: String,
}

#[tauri::command]
async fn generate_ollama(ollama_url: String, model: String, prompt: String) -> Result<String, String> {
    let url = format!("{}/api/generate", ollama_url.trim_end_matches('/'));
    
    // Large models (e.g. Qwen 3.5, Llama 3 70B) take significant time to load from disk to VRAM. 
    // Expanding the timeout to 120 seconds prevents "Failed to reach Ollama" proxy errors during cold boots.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
        
    let res = client.post(&url)
        .json(&OllamaGenerateRequest {
            model,
            prompt,
            stream: false,
        })
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        
    if !res.status().is_success() {
        return Err(format!("Ollama returned error: {}", res.status()));
    }
    
    let json: OllamaGenerateResponse = res.json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
        
    Ok(json.response)
}

#[tauri::command]
async fn get_openai_models(url: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(format!("{}/models", url.trim_end_matches('/')));
    
    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            request = request.bearer_auth(key);
        }
    }
    
    let res = request.send()
        .await
        .map_err(|e| format!("Failed to connect to AI provider: {}", e))?;
        
    if !res.status().is_success() {
        return Err(format!("AI provider returned error: {}", res.status()));
    }
    
    let json: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
        
    let mut models = Vec::new();
    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        for model in data {
            if let Some(id) = model.get("id").and_then(|i| i.as_str()) {
                models.push(id.to_string());
            }
        }
    }
    
    Ok(models)
}

#[tauri::command]
async fn generate_openai(url: String, model: String, prompt: String, api_key: Option<String>) -> Result<String, String> {
    let base_url = url.trim_end_matches('/');
    let full_url = if base_url.ends_with("/chat/completions") {
        base_url.to_string()
    } else {
        format!("{}/chat/completions", base_url)
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
        
    let mut request = client.post(&full_url)
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}]
        }));
        
    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            request = request.bearer_auth(key);
        }
    }
        
    let res = request.send()
        .await
        .map_err(|e| format!("Failed to connect to AI provider: {}", e))?;
        
    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("AI provider error: {}", error_text));
    }
    
    let parsed: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
        
    if let Some(choices) = parsed.get("choices") {
        if let Some(first_choice) = choices.get(0) {
            if let Some(message) = first_choice.get("message") {
                if let Some(content) = message.get("content") {
                    return Ok(content.as_str().unwrap_or_default().trim().to_string());
                }
            }
        }
    }
    Err("Unexpected response structure from AI provider".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let _ = app.get_webview_window("main").expect("no main window").show();
        let _ = app.get_webview_window("main").expect("no main window").set_focus();
    }))
    .plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts(["ctrl+alt+c"])
            .expect("Failed to register shortcut")
            .with_handler(|app, shortcut, event| {
                if event.state() == ShortcutState::Released {
                    if let Some(window) = app.get_webview_window("main") {
                        std::thread::spawn(move || {
                            // Ensure Ctrl+C goes to the active window BEFORE we steal focus
                            let text = capture_text().unwrap_or_else(|_| "".to_string());
                            
                            // Now we safely show the phrasePop window with the captured text
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("open-phrase-pop", text);
                        });
                    }
                }
            })
            .build(),
    )
    .invoke_handler(tauri::generate_handler![
        capture_text, 
        set_clipboard, 
        hide_window, 
        get_ollama_models, 
        generate_ollama,
        get_openai_models,
        generate_openai
    ])
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
