#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{io::{BufRead, BufReader}, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Engine(Mutex<Child>);
impl Drop for Engine {
    fn drop(&mut self) {
        if let Ok(child) = self.0.get_mut() { let _ = child.kill(); let _ = child.wait(); }
    }
}
fn main() {
    tauri::Builder::default().setup(|app| {
        let mut dir = app.path().resource_dir()?.join("engine");
        if !dir.join("server.py").exists() {
            dir = std::env::current_exe()?.parent().ok_or("Dossier introuvable")?.join("manager");
        }
        if !dir.join("server.py").exists() && cfg!(debug_assertions) {
            dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        }
        let mut command = Command::new(dir.join("python/python.exe"));
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.arg(dir.join("server.py")).arg("--shell").stdout(Stdio::piped()).spawn()?;
        let mut url = String::new();
        BufReader::new(child.stdout.take().unwrap()).read_line(&mut url)?;
        app.manage(Engine(Mutex::new(child)));
        let url: tauri::Url = url.trim().parse()?;
        if url.host_str() != Some("127.0.0.1") { return Err("Adresse locale invalide".into()); }
        WebviewWindowBuilder::new(app,"manager",WebviewUrl::External(url))
            .title("Biblio-Atlas Manager").inner_size(1320.0,860.0).build()?;
        Ok(())
    }).on_window_event(|window, event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(engine) = window.try_state::<Engine>() {
                if let Ok(mut child) = engine.0.lock() { let _ = child.kill(); let _ = child.wait(); }
            }
        }
    }).run(tauri::generate_context!()).expect("Échec du lancement");
}
