pub fn parse_hex(hex: &str) -> (u8, u8, u8) {
    let h = hex.trim().trim_start_matches('#');
    let expanded = if h.len() == 3 {
        let mut s = String::with_capacity(6);
        for c in h.chars() {
            s.push(c);
            s.push(c);
        }
        s
    } else {
        h.to_string()
    };
    (
        u8::from_str_radix(&expanded[0..2], 16).unwrap_or(0),
        u8::from_str_radix(&expanded[2..4], 16).unwrap_or(0),
        u8::from_str_radix(&expanded[4..6], 16).unwrap_or(0),
    )
}

fn srgb_to_linear(c: f64) -> f64 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn linear_to_srgb(c: f64) -> f64 {
    if c <= 0.003_130_8 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

fn hex_to_rgb(hex: &str) -> (f64, f64, f64) {
    let (r, g, b) = parse_hex(hex);
    (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0)
}

fn rgb_to_hex(r: f64, g: f64, b: f64) -> String {
    format!(
        "#{:02x}{:02x}{:02x}",
        (r.clamp(0.0, 1.0) * 255.0).round() as u8,
        (g.clamp(0.0, 1.0) * 255.0).round() as u8,
        (b.clamp(0.0, 1.0) * 255.0).round() as u8,
    )
}

fn rgb_to_oklab(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let lr = srgb_to_linear(r);
    let lg = srgb_to_linear(g);
    let lb = srgb_to_linear(b);

    let l = (0.412_221_470_8 * lr + 0.536_332_536_3 * lg + 0.051_445_992_9 * lb).cbrt();
    let m = (0.211_903_498_2 * lr + 0.680_699_545_1 * lg + 0.107_396_956_6 * lb).cbrt();
    let s = (0.088_302_461_9 * lr + 0.281_718_837_6 * lg + 0.629_978_700_5 * lb).cbrt();

    (
        0.210_454_255_3 * l + 0.793_617_785_0 * m - 0.004_072_046_8 * s,
        1.977_998_495_1 * l - 2.428_592_205_0 * m + 0.450_593_709_9 * s,
        0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766_0 * s,
    )
}

fn oklab_to_rgb(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    let lc = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
    let mc = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
    let sc = (l - 0.089_484_177_5 * a - 1.291_485_548_0 * b).powi(3);

    (
        linear_to_srgb(4.076_741_662_1 * lc - 3.307_711_591_3 * mc + 0.230_969_929_2 * sc),
        linear_to_srgb(-1.268_438_004_6 * lc + 2.609_757_401_1 * mc - 0.341_319_396_5 * sc),
        linear_to_srgb(-0.004_196_086_3 * lc - 0.703_418_614_7 * mc + 1.707_614_701_0 * sc),
    )
}

fn oklab_to_oklch(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    (l, (a * a + b * b).sqrt(), b.atan2(a).to_degrees())
}

fn oklch_to_oklab(l: f64, c: f64, h: f64) -> (f64, f64, f64) {
    let hr = h.to_radians();
    (l, c * hr.cos(), c * hr.sin())
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

fn lerp_hue(a: f64, b: f64, t: f64) -> f64 {
    let a = if a.is_finite() { a } else { b };
    let b = if b.is_finite() { b } else { a };
    let delta = ((b - a) % 360.0 + 540.0) % 360.0 - 180.0;
    a + delta * t
}

pub fn lerp_oklch(hex_a: &str, hex_b: &str, t: f64) -> String {
    let (r1, g1, b1) = hex_to_rgb(hex_a);
    let (r2, g2, b2) = hex_to_rgb(hex_b);

    let (l1, a1, b1_ok) = rgb_to_oklab(r1, g1, b1);
    let (l2, a2, b2_ok) = rgb_to_oklab(r2, g2, b2);
    let (l1, c1, h1) = oklab_to_oklch(l1, a1, b1_ok);
    let (l2, c2, h2) = oklab_to_oklch(l2, a2, b2_ok);

    let (l, a, b) = oklch_to_oklab(lerp(l1, l2, t), lerp(c1, c2, t), lerp_hue(h1, h2, t));
    let (r, g, b) = oklab_to_rgb(l, a, b);
    rgb_to_hex(r, g, b)
}
