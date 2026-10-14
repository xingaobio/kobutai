//! Dependency-light core of the Kobutai desktop shell: pure logic and the Rust <-> front-end wire types.
//! Kept apart from the Tauri binary so its unit tests run on any OS.

pub mod logic;
pub mod payload;
