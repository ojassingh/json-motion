use ffmpeg::codec;
use ffmpeg::codec::encoder;
use ffmpeg::format;
use ffmpeg::frame;
use ffmpeg::software::scaling;
use ffmpeg::util::format::pixel::Pixel;
use ffmpeg::util::rational::Rational;
use ffmpeg_next as ffmpeg;
use std::time::{Duration, Instant};

#[cfg(feature = "gpu")]
use crate::gpu::WgpuBackend;
use crate::render::FrameBuffer;
#[cfg(feature = "gpu")]
use crate::scene::types::ResolvedFrame;
#[cfg(feature = "gpu")]
use crate::text::TextMeasurer;

pub struct EncodeTimings {
    pub encode: Duration,
    pub render: Duration,
}

#[cfg(feature = "gpu")]
pub(crate) struct WgpuInlineEncodeRequest<'a> {
    pub backend: &'a mut WgpuBackend,
    pub codec: &'a str,
    pub fps: f64,
    pub frame_count: usize,
    pub height: u32,
    pub measurer: &'a dyn TextMeasurer,
    pub output_path: &'a str,
    pub width: u32,
}

pub(crate) struct RgbaVideoEncoder {
    converted: frame::Video,
    encoder: encoder::Video,
    output: format::context::Output,
    output_time_base: Rational,
    rgba: frame::Video,
    scaler: scaling::Context,
    stream_index: usize,
    time_base: Rational,
    width: usize,
    height: usize,
}

pub fn pick_best_h264_encoder() -> String {
    for name in ["h264_nvenc", "h264_videotoolbox", "h264_qsv", "libx264"] {
        if encoder::find_by_name(name).is_some() {
            return name.to_string();
        }
    }
    "libx264".to_string()
}

fn choose_pixel_format(codec: ffmpeg::Codec) -> Result<Pixel, String> {
    let video = codec
        .video()
        .map_err(|error| format!("failed to inspect encoder {}: {error}", codec.name()))?;
    let Some(formats) = video.formats() else {
        return Ok(Pixel::YUV420P);
    };
    let mut supported = Vec::new();
    for format in formats {
        supported.push(format);
    }
    for candidate in [Pixel::NV12, Pixel::YUV420P, Pixel::YUVJ420P] {
        if supported.iter().copied().any(|format| format == candidate) {
            return Ok(candidate);
        }
    }
    supported
        .into_iter()
        .next()
        .ok_or_else(|| format!("encoder {} has no supported pixel formats", codec.name()))
}

impl RgbaVideoEncoder {
    pub(crate) fn new(
        width: u32,
        height: u32,
        fps: f64,
        codec_name: &str,
        output_path: &str,
    ) -> Result<Self, String> {
        ffmpeg::init().map_err(|error| format!("failed to initialize ffmpeg: {error}"))?;

        i32::try_from(width).map_err(|_| format!("invalid width {width}"))?;
        i32::try_from(height).map_err(|_| format!("invalid height {height}"))?;
        let fps_value = fps.round();
        if !(1.0..=(i32::MAX as f64)).contains(&fps_value) {
            return Err(format!("unsupported fps {fps}"));
        }
        let fps_i32 = fps_value as i32;
        let time_base = Rational(1, fps_i32);

        let codec = encoder::find_by_name(codec_name)
            .ok_or_else(|| format!("unknown encoder: {codec_name}"))?;
        let pixel_format = choose_pixel_format(codec)?;

        let mut output = format::output(&output_path)
            .map_err(|error| format!("failed to open output {output_path}: {error}"))?;
        let global_header = output
            .format()
            .flags()
            .contains(format::Flags::GLOBAL_HEADER);

        let mut stream = output
            .add_stream(Some(codec))
            .map_err(|error| format!("failed to add output stream: {error}"))?;

        let mut encoder = codec::context::Context::new_with_codec(codec)
            .encoder()
            .video()
            .map_err(|error| format!("failed to create video encoder: {error}"))?;

        encoder.set_width(width);
        encoder.set_height(height);
        encoder.set_format(pixel_format);
        encoder.set_time_base(time_base);
        encoder.set_frame_rate(Some(Rational(fps_i32, 1)));

        if global_header {
            encoder.set_flags(codec::Flags::GLOBAL_HEADER);
        }

        stream.set_time_base(time_base);
        stream.set_parameters(&encoder);

        let encoder = encoder
            .open()
            .map_err(|error| format!("failed to open encoder {}: {error}", codec.name()))?;

        stream.set_time_base(time_base);
        stream.set_rate(Rational(fps_i32, 1));
        stream.set_avg_frame_rate(Rational(fps_i32, 1));
        stream.set_parameters(&encoder);

        let stream_index = stream.index();

        output
            .write_header()
            .map_err(|error| format!("failed to write mp4 header: {error}"))?;
        let output_time_base = output
            .stream(stream_index)
            .ok_or_else(|| "failed to read output stream after header write".to_string())?
            .time_base();

        let scaler = scaling::Context::get(
            Pixel::RGBA,
            width,
            height,
            pixel_format,
            width,
            height,
            scaling::flag::Flags::BILINEAR,
        )
        .map_err(|error| format!("failed to create pixel converter: {error}"))?;

        Ok(Self {
            converted: frame::Video::new(pixel_format, width, height),
            encoder,
            output,
            output_time_base,
            rgba: frame::Video::new(Pixel::RGBA, width, height),
            scaler,
            stream_index,
            time_base,
            width: width as usize,
            height: height as usize,
        })
    }

    pub(crate) fn encode_rgba_pixels(&mut self, pixels: &[u8], pts: i64) -> Result<(), String> {
        copy_rgba_frame(&mut self.rgba, pixels, self.width, self.height)?;
        self.scaler
            .run(&self.rgba, &mut self.converted)
            .map_err(|error| format!("failed to convert frame {pts}: {error}"))?;
        self.converted.set_pts(Some(pts));

        self.encoder
            .send_frame(&self.converted)
            .map_err(|error| format!("failed to send frame {pts} to encoder: {error}"))?;
        drain_packets(
            &mut self.encoder,
            &mut self.output,
            self.stream_index,
            self.time_base,
            self.output_time_base,
        )
    }

    pub(crate) fn finish(mut self) -> Result<(), String> {
        self.encoder
            .send_eof()
            .map_err(|error| format!("failed to flush encoder: {error}"))?;
        drain_packets(
            &mut self.encoder,
            &mut self.output,
            self.stream_index,
            self.time_base,
            self.output_time_base,
        )?;

        self.output
            .write_trailer()
            .map_err(|error| format!("failed to finalize mp4: {error}"))
    }
}

fn copy_rgba_frame(
    frame: &mut frame::Video,
    pixels: &[u8],
    width: usize,
    height: usize,
) -> Result<(), String> {
    let expected_len = width
        .checked_mul(height)
        .and_then(|value| value.checked_mul(4))
        .ok_or_else(|| "frame dimensions overflow".to_string())?;
    if pixels.len() != expected_len {
        return Err(format!(
            "invalid frame buffer size: expected {expected_len}, got {}",
            pixels.len()
        ));
    }

    let stride = frame.stride(0);
    let plane = frame.data_mut(0);
    let row_len = width * 4;

    for row in 0..height {
        let src_offset = row * row_len;
        let dst_offset = row * stride;
        let dst_row = &mut plane[dst_offset..dst_offset + row_len];
        let src_row = &pixels[src_offset..src_offset + row_len];
        dst_row.copy_from_slice(src_row);
    }

    Ok(())
}

fn drain_packets(
    encoder: &mut encoder::Video,
    output: &mut format::context::Output,
    stream_index: usize,
    input_time_base: Rational,
    output_time_base: Rational,
) -> Result<(), String> {
    let mut packet = ffmpeg::Packet::empty();

    loop {
        match encoder.receive_packet(&mut packet) {
            Ok(()) => {
                packet.set_stream(stream_index);
                packet.rescale_ts(input_time_base, output_time_base);
                packet
                    .write_interleaved(output)
                    .map_err(|error| format!("failed to write packet: {error}"))?;
            }
            Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::util::error::EAGAIN => {
                break;
            }
            Err(ffmpeg::Error::Eof) => {
                break;
            }
            Err(error) => {
                return Err(format!("failed to receive packet: {error}"));
            }
        }
    }

    Ok(())
}

pub fn encode<F>(
    width: u32,
    height: u32,
    fps: f64,
    codec: &str,
    output_path: &str,
    frame_count: usize,
    mut render_frame: F,
) -> Result<EncodeTimings, String>
where
    F: FnMut(usize, &mut FrameBuffer) -> Result<(), String>,
{
    let mut encoder = RgbaVideoEncoder::new(width, height, fps, codec, output_path)?;

    let mut render_duration = Duration::ZERO;
    let mut encode_duration = Duration::ZERO;

    let mut fb_a = FrameBuffer::new(width, height);
    let mut fb_b = FrameBuffer::new(width, height);
    if frame_count > 0 {
        let render_start = Instant::now();
        render_frame(0, &mut fb_a)?;
        render_duration += render_start.elapsed();
    }

    for index in 0..frame_count {
        let render_start = Instant::now();
        if index + 1 < frame_count {
            render_frame(index + 1, &mut fb_b)?;
        }
        render_duration += render_start.elapsed();

        let encode_start = Instant::now();
        encoder.encode_rgba_pixels(fb_a.pixels(), index as i64)?;
        encode_duration += encode_start.elapsed();

        std::mem::swap(&mut fb_a, &mut fb_b);
    }

    let flush_start = Instant::now();
    encoder.finish()?;
    encode_duration += flush_start.elapsed();

    Ok(EncodeTimings {
        encode: encode_duration,
        render: render_duration,
    })
}

#[cfg(feature = "gpu")]
pub(crate) fn encode_wgpu_inline<F>(
    request: WgpuInlineEncodeRequest<'_>,
    mut resolve_frame: F,
) -> Result<EncodeTimings, String>
where
    F: FnMut(usize) -> Result<ResolvedFrame, String>,
{
    let WgpuInlineEncodeRequest {
        backend,
        codec,
        fps,
        frame_count,
        height,
        measurer,
        output_path,
        width,
    } = request;

    let mut encoder = RgbaVideoEncoder::new(width, height, fps, codec, output_path)?;
    let mut render_duration = Duration::ZERO;
    let mut encode_duration = Duration::ZERO;
    let mut buffers = [
        FrameBuffer::new(width, height),
        FrameBuffer::new(width, height),
    ];
    let mut buffer_index = 0usize;
    let mut submitted = 0usize;
    let mut encoded = 0usize;

    while submitted < frame_count && backend.can_accept_frame() {
        let render_start = Instant::now();
        let frame = resolve_frame(submitted)?;
        backend.submit_frame(&frame, measurer)?;
        render_duration += render_start.elapsed();
        submitted += 1;
    }

    while encoded < frame_count {
        let render_start = Instant::now();
        backend.collect_frame(&mut buffers[buffer_index])?;
        render_duration += render_start.elapsed();

        while submitted < frame_count && backend.can_accept_frame() {
            let render_start = Instant::now();
            let frame = resolve_frame(submitted)?;
            backend.submit_frame(&frame, measurer)?;
            render_duration += render_start.elapsed();
            submitted += 1;
        }

        let encode_start = Instant::now();
        encoder.encode_rgba_pixels(buffers[buffer_index].pixels(), encoded as i64)?;
        encode_duration += encode_start.elapsed();

        buffer_index = (buffer_index + 1) % buffers.len();
        encoded += 1;
    }

    let flush_start = Instant::now();
    encoder.finish()?;
    encode_duration += flush_start.elapsed();

    Ok(EncodeTimings {
        encode: encode_duration,
        render: render_duration,
    })
}
