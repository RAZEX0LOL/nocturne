//! Значки Mac — настоящие SF Symbols, а не векторы из веба.
//!
//! WebKit не умеет показывать SF Symbols: их рисует только AppKit, по имени (`play.fill`,
//! `music.note.list`). Поэтому значки отрисовываются здесь, в PNG тройной плотности, а окно
//! использует их как маску (`mask-image`) и красит в цвет текста или акцента — ровно как
//! шаблонные картинки в нативных приложениях Mac.

use std::collections::HashMap;
use std::sync::mpsc;

use base64::Engine;
use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_app_kit::{
    NSBitmapImageFileType, NSBitmapImageRep, NSCalibratedRGBColorSpace, NSFontWeightRegular, NSGraphicsContext, NSImage,
    NSImageSymbolConfiguration,
};
use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};
use tauri::AppHandle;

/// Сторона холста в пунктах и плотность: 3× — чётко на любом экране Retina при любом размере в окне.
const CANVAS: f64 = 32.0;
const POINT_SIZE: f64 = 22.0;
const SCALE: f64 = 3.0;

fn render(name: &str) -> Option<String> {
    let symbol = NSImage::imageWithSystemSymbolName_accessibilityDescription(&NSString::from_str(name), None)?;
    let config = NSImageSymbolConfiguration::configurationWithPointSize_weight(POINT_SIZE, unsafe { NSFontWeightRegular });
    let image = symbol.imageWithSymbolConfiguration(&config)?;
    let size = image.size();

    let pixels = (CANVAS * SCALE) as isize;
    let rep: Retained<NSBitmapImageRep> = unsafe {
        NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(),
            std::ptr::null_mut(),
            pixels,
            pixels,
            8,
            4,
            true,
            false,
            NSCalibratedRGBColorSpace,
            0,
            0,
        )?
    };
    rep.setSize(NSSize::new(CANVAS, CANVAS));

    let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&rep)?;
    let previous = NSGraphicsContext::currentContext();
    NSGraphicsContext::setCurrentContext(Some(&context));
    // Значок по центру холста в своём естественном размере: пропорции и оптика символа сохраняются.
    let origin = NSPoint::new((CANVAS - size.width) / 2.0, (CANVAS - size.height) / 2.0);
    image.drawInRect(NSRect::new(origin, size));
    context.flushGraphics();
    NSGraphicsContext::setCurrentContext(previous.as_deref());

    let png = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }?;
    let bytes = png.to_vec();
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Картинки значков по именам SF Symbols. Рисуются в главном потоке — AppKit этого требует.
#[tauri::command]
pub async fn system_symbols(app: AppHandle, names: Vec<String>) -> HashMap<String, String> {
    let (sender, receiver) = mpsc::channel();
    let posted = app.run_on_main_thread(move || {
        let images: HashMap<String, String> =
            names.into_iter().filter_map(|name| render(&name).map(|image| (name, image))).collect();
        let _ = sender.send(images);
    });
    if posted.is_err() {
        return HashMap::new();
    }
    tauri::async_runtime::spawn_blocking(move || receiver.recv().unwrap_or_default()).await.unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_real_symbol_is_drawn_and_a_made_up_one_is_not() {
        let play = render("play.fill").expect("play.fill есть в любой macOS начиная с 11");
        assert!(play.starts_with("data:image/png;base64,"));
        let bytes = base64::engine::general_purpose::STANDARD.decode(&play["data:image/png;base64,".len()..]).unwrap();
        let picture = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(picture.dimensions(), (96, 96), "холст 32 pt при плотности 3×");
        let opaque = picture.pixels().filter(|pixel| pixel[3] > 200).count();
        assert!(opaque > 500, "значок должен быть нарисован, а закрашено только {opaque} точек");
        assert!(picture.get_pixel(0, 0)[3] == 0, "фон прозрачный — это маска");
        assert_eq!(render("no.such.symbol.nocturne"), None);
    }
}
