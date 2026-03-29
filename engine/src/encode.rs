use ffmpeg_next as ffmpeg;
use ffmpeg::codec;
use ffmpeg::codec::encoder;
use ffmpeg::format;
use ffmpeg::frame;
use ffmpeg::software::scaling;
use ffmpeg::util::format::pixel::Pixel;
use ffmpeg::util::rational::Rational;

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

fn copy_rgba_frame(frame: &mut frame::Video, pixels: &[u8], width: usize, height: usize) -> Result<(), String> {
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

pub fn encode(
    width: u32,
    height: u32,
    fps: f64,
    codec: &str,
    output_path: &str,
    frames: impl Iterator<Item = Result<Vec<u8>, String>>,
) -> Result<(), String> {
    ffmpeg::init().map_err(|error| format!("failed to initialize ffmpeg: {error}"))?;

    i32::try_from(width).map_err(|_| format!("invalid width {width}"))?;
    i32::try_from(height).map_err(|_| format!("invalid height {height}"))?;
    let fps_value = fps.round();
    if !(1.0..=(i32::MAX as f64)).contains(&fps_value) {
        return Err(format!("unsupported fps {fps}"));
    }
    let fps_i32 = fps_value as i32;
    let time_base = Rational(1, fps_i32);

    let codec = encoder::find_by_name(codec)
        .ok_or_else(|| format!("unknown encoder: {codec}"))?;
    let pixel_format = choose_pixel_format(codec)?;

    let mut output =
        format::output(&output_path).map_err(|error| format!("failed to open output {output_path}: {error}"))?;
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

    let mut encoder = encoder
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

    let mut scaler = scaling::Context::get(
        Pixel::RGBA,
        width,
        height,
        pixel_format,
        width,
        height,
        scaling::flag::Flags::BILINEAR,
    )
    .map_err(|error| format!("failed to create pixel converter: {error}"))?;

    for (index, frame_result) in frames.enumerate() {
        let frame_data = frame_result?;
        let mut rgba = frame::Video::new(Pixel::RGBA, width, height);
        copy_rgba_frame(&mut rgba, &frame_data, width as usize, height as usize)?;

        let mut converted = frame::Video::new(pixel_format, width, height);
        scaler
            .run(&rgba, &mut converted)
            .map_err(|error| format!("failed to convert frame {index}: {error}"))?;
        converted.set_pts(Some(index as i64));

        encoder
            .send_frame(&converted)
            .map_err(|error| format!("failed to send frame {index} to encoder: {error}"))?;
        drain_packets(
            &mut encoder,
            &mut output,
            stream_index,
            time_base,
            output_time_base,
        )?;
    }

    encoder
        .send_eof()
        .map_err(|error| format!("failed to flush encoder: {error}"))?;
    drain_packets(
        &mut encoder,
        &mut output,
        stream_index,
        time_base,
        output_time_base,
    )?;

    output
        .write_trailer()
        .map_err(|error| format!("failed to finalize mp4: {error}"))
}
