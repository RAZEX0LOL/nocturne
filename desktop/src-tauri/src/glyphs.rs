//! Значки для кнопок в превью окна на панели задач Windows: «назад», «играть», «пауза», «вперёд».
//!
//! Рисуются здесь же, в нужном системе размере, а не лежат картинками: панель задач берёт значки
//! размером с маленькую иконку, а он зависит от масштаба экрана (16 px при 100 %, 24 px при 150 %).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Glyph {
    Previous,
    Play,
    Pause,
    Next,
}

/// Фигуры значка в долях стороны квадрата: многоугольники, закрашенные целиком.
fn shapes(glyph: Glyph) -> Vec<Vec<(f32, f32)>> {
    let rect = |x0: f32, y0: f32, x1: f32, y1: f32| vec![(x0, y0), (x1, y0), (x1, y1), (x0, y1)];
    match glyph {
        Glyph::Play => vec![vec![(0.28, 0.18), (0.82, 0.5), (0.28, 0.82)]],
        Glyph::Pause => vec![rect(0.25, 0.18, 0.42, 0.82), rect(0.58, 0.18, 0.75, 0.82)],
        Glyph::Previous => vec![rect(0.18, 0.2, 0.3, 0.8), vec![(0.82, 0.2), (0.82, 0.8), (0.32, 0.5)]],
        Glyph::Next => vec![vec![(0.18, 0.2), (0.68, 0.5), (0.18, 0.8)], rect(0.7, 0.2, 0.82, 0.8)],
    }
}

/// Точка внутри многоугольника — правило чётности пересечений.
fn inside(polygon: &[(f32, f32)], x: f32, y: f32) -> bool {
    let mut result = false;
    let mut previous = polygon[polygon.len() - 1];
    for &point in polygon {
        let (x0, y0) = previous;
        let (x1, y1) = point;
        if (y0 > y) != (y1 > y) && x < x0 + (y - y0) * (x1 - x0) / (y1 - y0) {
            result = !result;
        }
        previous = point;
    }
    result
}

/// Белый значок на прозрачном фоне, BGRA построчно сверху вниз. Края сглажены выборкой 4×4.
pub fn render(glyph: Glyph, size: u32) -> Vec<u8> {
    const SAMPLES: u32 = 4;
    let figures = shapes(glyph);
    let mut pixels = Vec::with_capacity((size * size * 4) as usize);
    for row in 0..size {
        for column in 0..size {
            let mut covered = 0;
            for sy in 0..SAMPLES {
                for sx in 0..SAMPLES {
                    let x = (column as f32 + (sx as f32 + 0.5) / SAMPLES as f32) / size as f32;
                    let y = (row as f32 + (sy as f32 + 0.5) / SAMPLES as f32) / size as f32;
                    if figures.iter().any(|figure| inside(figure, x, y)) {
                        covered += 1;
                    }
                }
            }
            let alpha = (covered * 255 / (SAMPLES * SAMPLES)) as u8;
            pixels.extend_from_slice(&[255, 255, 255, alpha]);
        }
    }
    pixels
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alpha(pixels: &[u8], size: u32, x: u32, y: u32) -> u8 {
        pixels[((y * size + x) * 4 + 3) as usize]
    }

    #[test]
    fn play_is_filled_in_the_middle_and_empty_in_the_corners() {
        let pixels = render(Glyph::Play, 16);
        assert_eq!(pixels.len(), 16 * 16 * 4);
        assert_eq!(alpha(&pixels, 16, 7, 8), 255);
        assert_eq!(alpha(&pixels, 16, 0, 0), 0);
        assert_eq!(alpha(&pixels, 16, 15, 15), 0);
    }

    #[test]
    fn pause_has_a_gap_between_the_bars() {
        let pixels = render(Glyph::Pause, 24);
        assert_eq!(alpha(&pixels, 24, 12, 12), 0, "между полосками должно быть пусто");
        assert_eq!(alpha(&pixels, 24, 8, 12), 255);
        assert_eq!(alpha(&pixels, 24, 15, 12), 255);
    }

    #[test]
    fn previous_and_next_mirror_each_other() {
        let size = 20;
        let previous = render(Glyph::Previous, size);
        let next = render(Glyph::Next, size);
        let filled = |pixels: &[u8]| pixels.chunks(4).filter(|pixel| pixel[3] > 127).count();
        let difference = filled(&previous).abs_diff(filled(&next));
        assert!(difference <= size as usize, "значки должны быть почти одинаковой площади: {difference}");
        // Полоска «назад» слева, у «вперёд» — справа.
        assert_eq!(alpha(&previous, size, 4, 10), 255);
        assert_eq!(alpha(&next, size, 15, 10), 255);
    }
}
