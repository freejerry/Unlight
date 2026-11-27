use std::convert::TryInto;

const INPUT_CAPACITY: usize = 1024 * 1024;
static mut INPUT: [u8; INPUT_CAPACITY] = [0; INPUT_CAPACITY];

#[no_mangle]
pub extern "C" fn input_capacity() -> usize {
    INPUT_CAPACITY
}

#[no_mangle]
pub extern "C" fn input_ptr() -> *mut u8 {
    core::ptr::addr_of_mut!(INPUT).cast()
}

#[no_mangle]
pub extern "C" fn find_jpeg(input_length: usize) -> u64 {
    if input_length > INPUT_CAPACITY {
        return 0;
    }
    // The host fills this bounded buffer before calling into this single-threaded module.
    let bytes = unsafe { core::slice::from_raw_parts(input_ptr(), input_length) };
    if let Some((offset, length)) = jpeg_range(bytes) {
        return (offset as u64) << 32 | length as u64;
    }
    0
}

fn jpeg_range(bytes: &[u8]) -> Option<(usize, usize)> {
    if bytes.get(..3)? != b"FWS" || (read_u32(bytes, 4)? as usize) != bytes.len() {
        return None;
    }

    // RECT contains its own bit width followed by the four coordinates.
    let coordinate_bits = (*bytes.get(8)? >> 3) as usize;
    let rect_len = (5 + 4 * coordinate_bits).div_ceil(8);
    let mut offset = 8 + rect_len + 4; // RECT, frame rate, and frame count.

    while let Some(header) = read_u16(bytes, offset) {
        let tag = header >> 6;
        let mut payload_len = (header & 0x3f) as usize;
        offset += 2;
        if payload_len == 0x3f {
            payload_len = read_u32(bytes, offset)? as usize;
            offset += 4;
        }
        let end = offset.checked_add(payload_len)?;
        let payload = bytes.get(offset..end)?;

        match tag {
            0 => return None,
            // A complete DefineBits JPEG follows the two-byte character ID in this asset.
            6 => {
                let jpeg = payload.get(2..)?;
                if jpeg.starts_with(&[0xff, 0xd8]) && jpeg.ends_with(&[0xff, 0xd9]) {
                    return Some((offset + 2, jpeg.len()));
                }
            }
            _ => {}
        }
        offset = end;
    }
    None
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}
