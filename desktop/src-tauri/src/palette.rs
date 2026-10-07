//! Цвета обложки: акцент «из обложки» и живой фон полноэкранного плеера.
//!
//! Алгоритм тот же, что на iPhone (`Appearance.vibrantColor`): картинка уменьшается до 24×24,
//! яркие насыщенные пиксели раскладываются по 12 корзинам оттенка с весом «насыщенность × яркость»,
//! побеждает самая тяжёлая корзина. Так акцент на компьютере совпадает с телефоном.

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    /// Акцент для тёмной темы: светлая пастель того же оттенка, читается на тёмном фоне.
    pub accent: String,
    /// До трёх ярких цветов обложки — для фона полноэкранного плеера, от главного к второстепенным.
    pub colors: Vec<String>,
    /// Средний цвет обложки, затемнённый: подложка фона, если ярких цветов нет вовсе.
    pub base: String,
}

fn rgb_to_hsb(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    let hue = if delta == 0.0 {
        0.0
    } else if max == r {
        ((g - b) / delta).rem_euclid(6.0) / 6.0
    } else if max == g {
        ((b - r) / delta + 2.0) / 6.0
    } else {
        ((r - g) / delta + 4.0) / 6.0
    };
    let saturation = if max == 0.0 { 0.0 } else { delta / max };
    (hue, saturation, max)
}

fn hsb_to_hex(hue: f32, saturation: f32, brightness: f32) -> String {
    let h = (hue.rem_euclid(1.0)) * 6.0;
    let c = brightness * saturation;
    let x = c * (1.0 - ((h % 2.0) - 1.0).abs());
    let (r, g, b) = match h as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = brightness - c;
    let channel = |value: f32| ((value + m).clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", channel(r), channel(g), channel(b))
}

/// Цвета по пикселям RGBA (уже уменьшенной картинки).
pub fn from_pixels(rgba: &[u8]) -> Option<Palette> {
    #[derive(Clone, Copy, Default)]
    struct Bucket {
        weight: f32,
        hue: f32,
        saturation: f32,
    }
    let mut buckets = [Bucket::default(); 12];
    let (mut sum_r, mut sum_g, mut sum_b, mut count) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for pixel in rgba.chunks_exact(4) {
        let (r, g, b) = (pixel[0] as f32 / 255.0, pixel[1] as f32 / 255.0, pixel[2] as f32 / 255.0);
        sum_r += r;
        sum_g += g;
        sum_b += b;
        count += 1.0;
        let (hue, saturation, brightness) = rgb_to_hsb(r, g, b);
        if saturation <= 0.15 || brightness <= 0.2 {
            continue;
        }
        let weight = saturation * brightness;
        let slot = ((hue * 12.0) as usize).min(11);
        buckets[slot].weight += weight;
        buckets[slot].hue += hue * weight;
        buckets[slot].saturation += saturation * weight;
    }
    if count == 0.0 {
        return None;
    }
    let (_, base_saturation, _) = rgb_to_hsb(sum_r / count, sum_g / count, sum_b / count);
    let (base_hue, _, _) = rgb_to_hsb(sum_r / count, sum_g / count, sum_b / count);
    let base = hsb_to_hex(base_hue, base_saturation.min(0.6), 0.22);

    let mut ranked: Vec<Bucket> = buckets.into_iter().filter(|bucket| bucket.weight > 0.5).collect();
    ranked.sort_by(|a, b| b.weight.total_cmp(&a.weight));
    let best = ranked.first()?;
    let hue = best.hue / best.weight;
    let saturation = best.saturation / best.weight;
    Some(Palette {
        accent: hsb_to_hex(hue, saturation.min(0.5), 0.98),
        colors: ranked
            .iter()
            .take(3)
            .map(|bucket| hsb_to_hex(bucket.hue / bucket.weight, (bucket.saturation / bucket.weight).min(0.85), 0.7))
            .collect(),
        base,
    })
}

/// Цвета по файлу картинки любого из обычных форматов.
pub fn from_image(bytes: &[u8]) -> Option<Palette> {
    let image = image::load_from_memory(bytes).ok()?;
    let small = image.resize_exact(24, 24, image::imageops::FilterType::Triangle).to_rgba8();
    from_pixels(small.as_raw())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(r: u8, g: u8, b: u8) -> Vec<u8> {
        [r, g, b, 255].repeat(24 * 24)
    }

    #[test]
    fn a_red_cover_gives_a_light_red_accent() {
        let palette = from_pixels(&solid(200, 30, 30)).unwrap();
        // Тот же оттенок, насыщенность урезана до 0,5, яркость 0,98 — как на iPhone.
        assert_eq!(palette.accent, "#fa7d7d");
        assert_eq!(palette.colors.len(), 1);
    }

    #[test]
    fn a_grey_cover_has_no_vivid_colour() {
        assert_eq!(from_pixels(&solid(128, 128, 128)), None);
        assert_eq!(from_pixels(&solid(5, 5, 40)), None, "тёмные пиксели не считаются яркими");
    }

    #[test]
    fn the_biggest_colour_wins_and_the_rest_follow() {
        let mut pixels = solid(20, 160, 60);
        // Четверть картинки — синяя.
        for pixel in pixels.chunks_exact_mut(4).take(24 * 6) {
            pixel.copy_from_slice(&[40, 80, 220, 255]);
        }
        let palette = from_pixels(&pixels).unwrap();
        assert_eq!(palette.colors.len(), 2);
        let (hue, _, _) = rgb_to_hsb(
            u8::from_str_radix(&palette.colors[0][1..3], 16).unwrap() as f32 / 255.0,
            u8::from_str_radix(&palette.colors[0][3..5], 16).unwrap() as f32 / 255.0,
            u8::from_str_radix(&palette.colors[0][5..7], 16).unwrap() as f32 / 255.0,
        );
        assert!((0.3..0.45).contains(&hue), "главный цвет должен быть зелёным, а вышел оттенок {hue}");
    }

    #[test]
    fn hsb_round_trips() {
        assert_eq!(hsb_to_hex(0.0, 1.0, 1.0), "#ff0000");
        assert_eq!(hsb_to_hex(1.0 / 3.0, 1.0, 1.0), "#00ff00");
        assert_eq!(hsb_to_hex(0.0, 0.0, 0.5), "#808080");
    }

    #[test]
    fn a_real_image_file_is_decoded() {
        let mut png = Vec::new();
        let picture = image::RgbaImage::from_pixel(64, 64, image::Rgba([30, 120, 230, 255]));
        image::DynamicImage::ImageRgba8(picture)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        assert!(from_image(&png).is_some());
        assert!(from_image(b"not an image").is_none());
    }
}
