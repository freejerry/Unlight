"""Read the original static bitmaps from the pinned source client assets."""

from struct import pack, unpack_from
from zlib import compress, crc32, decompress


# The registration allowlist and icon names come from REGIST_PARTS and
# AvatarPartIconImage.URLSet. The digests pin the original asset mirror bytes.
starter_icon_sources = {
    part_id: (f"public/image/avatar_parts/icon/{name}", digest)
    for part_id, name, digest in (
        (1, "icon_skin_a000a.swf", "b4968772e31658315563ba9e987664233a13292f8e55863c33138aa0bc79511b"),
        (2, "icon_skin_a000b.swf", "2a16aba7354c3510cc1d8111101ad3eb16c894984379c0f356227939e927dc33"),
        (3, "icon_skin_a000c.swf", "97825d6b13cd674f12556a5f0837ebfbda99668d8400c6a663d951892049cca9"),
        (5, "icon_eye_a000b.swf", "c98a2da3c5b01d9afce044e79c16fd82a171e82212669a2aff327c7479ff76eb"),
        (6, "icon_eye_a000c.swf", "151e7d860376e4664d187fd43c02a32749718c454e736bd648f3bc1a517f23af"),
        (7, "icon_eye_a000d.swf", "a3dbe4a997fa4a86774a26d166af1592626f00518bd4f730b5d34f807a5f1425"),
        (10, "icon_eye_a001b.swf", "565423f8b06237b86cd3a69a18f62629702100bd9bbbd4c894a0f38fc2c412f1"),
        (11, "icon_eye_a001c.swf", "2627032aebf29aa13e3e871bdb3ad4d5717345434938b1426e99b26b93a96275"),
        (12, "icon_eye_a001d.swf", "6724e41ff21c993b8a12179da60aaf964de2e9eb0bf2f9ca786fcd0e62eff5f8"),
        (15, "icon_eye_a002b.swf", "65314433d8152ab9a2779b8da5f1c5fea08cbe57d286e43b44a714c25b651b91"),
        (16, "icon_eye_a002c.swf", "daec4dfab2ebe17705f4b9bcb7d300b6af437eb84880b999abaf1b262f1c41eb"),
        (17, "icon_eye_a002d.swf", "6c12ed4508be844c14b0971b8217fb95aca7cd10c30dbf1d9996df2b87fdb9e5"),
        (24, "icon_mouth_a000a.swf", "c9129bc1873d2b95cd745e42dbbb2a94f219d85065ae75f6439bffcd615f35aa"),
        (25, "icon_mouth_a001a.swf", "67a8065beee97b421d32cf724b447fd9d671d4dcd285bbde4f381825b8c04c61"),
        (26, "icon_mouth_b000a.swf", "c960cb4b37788124cbba3c77762211f6082d5a2f0043be8b9c1f176c7bb6aff2"),
        (27, "icon_hair_a000a.swf", "1b3b87a6c51e015f2a6b884b5c769e56bc46b40c10e83e65ee53ba9815eca698"),
        (28, "icon_hair_a000b.swf", "89468d59686905a7b0b1756d76722effab0d01db65752139089447dd268ac6d4"),
        (29, "icon_hair_a000c.swf", "0b6de10ff5df6846d7c1652a5c78a405fa455ffffe4d02d255ef13d1a1deee1f"),
        (32, "icon_hair_b000a.swf", "c9e85a84a6a5fb1e089b6efed8da6a2d4d6ad1179234bdc3ac1dfddcca7cd1c2"),
        (33, "icon_hair_b000b.swf", "7ad96a80844a1badf1721fc547c5a64d525603580a46b364b7a658502d536840"),
        (34, "icon_hair_b000c.swf", "128a7cf1903c46ccbdb4ee71403f3e871a9130aad1e1be5840d5b2cec2c976d0"),
        (37, "icon_hair_d000a.swf", "3b6bc2a6ebadf928f9c42df41d2fd329e6a36afad82aeea0721d1b841aa940ba"),
        (38, "icon_hair_d000b.swf", "2fcc010272345cecb566d132d2af472986f52efac1ea48b9c6bac430e05366d7"),
        (39, "icon_hair_d000c.swf", "fe6515b0896b3c41fbe2a02872518af5b42eb4d86e79f740525d0d7d956b88c1"),
    )
}


starter_portrait_source = (
    "data/image/regist/make_3chara.swf",
    "4683e10b163031644b5da62bbefab0a1b2f36c6e0f5598eb47abe71ed3fe6989",
)

# CardSelector sends these IDs in the order of the named chara_a–chara_e clips.
# Each clip references the corresponding portrait bitmap and a separate name.
_STARTER_PORTRAITS = {
    1: (1, (379, 466)),
    21: (6, (379, 468)),
    31: (11, (428, 464)),
    101: (16, (364, 424)),
    111: (21, (385, 515)),
}
starter_portrait_ids = tuple(_STARTER_PORTRAITS)


def tags(path):
    swf = path.read_bytes()
    if swf.startswith(b"CWS"):
        data = decompress(swf[8:])
    elif swf.startswith(b"FWS"):
        data = swf[8:]
    else:
        raise ValueError(f"Unsupported SWF signature in {path.name}")
    if len(data) + 8 != unpack_from("<I", swf, 4)[0]:
        raise ValueError(f"Incorrect SWF length in {path.name}")

    offset = (5 + 4 * (data[0] >> 3) + 7) // 8 + 4  # RECT, frame rate, frame count
    while offset + 2 <= len(data):
        header = unpack_from("<H", data, offset)[0]
        offset += 2
        kind, length = header >> 6, header & 63
        if length == 63:
            length = unpack_from("<I", data, offset)[0]
            offset += 4
        end = offset + length
        if end > len(data) or kind == 0:
            return
        yield kind, data[offset:end]
        offset = end


def jpeg(path):
    for kind, data in tags(path):
        if kind == 6 and data[2:4] == b"\xff\xd8" and data.endswith(b"\xff\xd9"):
            return data[2:]
    raise ValueError(f"No complete JPEG in {path.name}")


def png_chunk(kind, data):
    return pack(">I", len(data)) + kind + data + pack(">I", crc32(kind + data))


def straight_component(value, alpha):
    return (value * 255 + alpha // 2) // alpha if alpha else 0


def indexed_png(path, *, size=(760, 496), bitmap_id=1, with_alpha=False):
    tag = 36 if with_alpha else 20  # DefineBitsLossless2 or DefineBitsLossless
    bitmap = pack("<HB", bitmap_id, 3)  # Indexed bitmap format
    channels = 4 if with_alpha else 3
    for kind, data in tags(path):
        if kind != tag or data[:3] != bitmap:
            continue
        width, height, palette_last = unpack_from("<HHB", data, 3)
        palette_end = channels * (palette_last + 1)
        pixels = decompress(data[8:])
        stride = (width + 3) & ~3
        if (width, height) != size or len(pixels) != palette_end + stride * height:
            raise ValueError(f"Incorrect indexed bitmap dimensions in {path.name}")
        palette = pixels[:palette_end]
        transparency = b""
        if with_alpha:
            colors = zip(palette[::4], palette[1::4], palette[2::4], palette[3::4])
            rgb = bytearray()
            alpha = bytearray()
            for r, g, b, opacity in colors:
                if max(r, g, b) > opacity:
                    raise ValueError(f"Invalid premultiplied palette in {path.name}")
                rgb.extend(straight_component(value, opacity) for value in (r, g, b))
                alpha.append(opacity)
            palette = rgb
            transparency = png_chunk(b"tRNS", bytes(alpha))
        rows = b"".join(
            b"\0" + pixels[offset:offset + width]  # PNG filter 0; omit the SWF row padding.
            for offset in range(palette_end, len(pixels), stride)
        )
        return b"\x89PNG\r\n\x1a\n" + b"".join((
            png_chunk(b"IHDR", pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0)),
            png_chunk(b"PLTE", bytes(palette)),
            transparency,
            png_chunk(b"IDAT", compress(rows)),
            png_chunk(b"IEND", b""),
        ))
    raise ValueError(f"No indexed bitmap in {path.name}")


def decode_starter_icon(part_id, path):
    if part_id not in starter_icon_sources:
        raise ValueError(f"Unknown starter appearance part {part_id}")
    if part_id in (37, 38, 39):
        return indexed_png(path, size=(128, 128)), "image/png"
    return jpeg(path), "image/jpeg"


def decode_starter_portrait(card_id, path):
    if card_id not in _STARTER_PORTRAITS:
        raise ValueError(f"Unknown starter character card {card_id}")
    bitmap_id, size = _STARTER_PORTRAITS[card_id]
    return indexed_png(path, size=size, bitmap_id=bitmap_id, with_alpha=True)
