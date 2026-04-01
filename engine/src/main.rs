use std::process;

fn main() {
    if let Err(error) = engine::run() {
        eprintln!("{error}");
        process::exit(1);
    }
}
