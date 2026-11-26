use serde::{Deserialize, Serialize};

use crate::{Action, GameView};

#[derive(Deserialize)]
struct ReplayRequest {
    seed: u32,
    actions: Vec<Action>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum ReplayResponse {
    Success { ok: bool, view: GameView },
    Error { ok: bool, error: String },
}

#[no_mangle]
pub extern "C" fn allocate(len: u32) -> *mut u8 {
    export_buffer(vec![0; len as usize])
}

/// `ptr` and `len` must identify a live buffer returned by this module.
#[no_mangle]
pub unsafe extern "C" fn deallocate(ptr: *mut u8, len: u32) {
    if !ptr.is_null() {
        let buffer = std::ptr::slice_from_raw_parts_mut(ptr, len as usize);
        drop(unsafe { Box::from_raw(buffer) });
    }
}

/// The input is a live buffer from `allocate`. The output packs the new
/// buffer's pointer into the high 32 bits and its length into the low 32 bits.
#[no_mangle]
pub unsafe extern "C" fn replay(ptr: *const u8, len: u32) -> u64 {
    let result = if ptr.is_null() {
        Err("缺少回放資料。".to_owned())
    } else {
        let input = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
        serde_json::from_slice::<ReplayRequest>(input)
            .map_err(|error| format!("回放資料格式錯誤：{error}"))
            .and_then(|request| crate::replay(request.seed, request.actions))
    };
    let response = match result {
        Ok(view) => ReplayResponse::Success { ok: true, view },
        Err(error) => ReplayResponse::Error { ok: false, error },
    };
    let output = serde_json::to_vec(&response)
        .unwrap_or_else(|_| br#"{"ok":false,"error":"Failed to encode replay."}"#.to_vec());
    let len = output.len() as u64;
    let ptr = export_buffer(output) as u64;
    (ptr << 32) | len
}

fn export_buffer(bytes: Vec<u8>) -> *mut u8 {
    Box::into_raw(bytes.into_boxed_slice()).cast()
}
