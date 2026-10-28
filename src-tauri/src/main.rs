// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--help" || arg == "-h") {
        println!("PhrasePoP — a clipboard-first writing assistant\n\nUsage: phrasepop [--clipboard] [--minimized]\n\n--clipboard  Request copied text without replacing an existing draft\n--minimized  Start in the tray when available\n--version    Show the version");
        return;
    }
    if std::env::args().any(|arg| arg == "--version" || arg == "-V") {
        println!("PhrasePoP {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    app_lib::run();
}
