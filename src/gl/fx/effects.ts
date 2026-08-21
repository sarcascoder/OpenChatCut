import lumaKeyFrag from './luma-key.frag?raw';
import localMosaicFrag from './local-mosaic.frag?raw';
import magnifyFrag from './magnify.frag?raw';
import rectMaskFrag from './rect-mask.frag?raw';
import circleMaskFrag from './circle-mask.frag?raw';
import crtFrag from './crt.frag?raw';
import cameraShakeFrag from './camera-shake.frag?raw';
import tiltShiftPass1Frag from './tilt-shift-pass1.frag?raw';
import tiltShiftPass2Frag from './tilt-shift-pass2.frag?raw';
import asciiRainFrag from './ascii-rain.frag?raw';
import asciiRainBlurFrag from './ascii-rain-blur.frag?raw';
import asciiRainCompositeFrag from './ascii-rain-composite.frag?raw';
import lutFrag from './lut.frag?raw';
import chromaKeyFrag from './chroma-key.frag?raw';
import colorWheelsFrag from './color-wheels.frag?raw';
import levelsFrag from './levels.frag?raw';
import highlightsShadowsFrag from './highlights-shadows.frag?raw';
import clarityFrag from './clarity.frag?raw';
import hslQualifyFrag from './hsl-qualify.frag?raw';
import vignetteFrag from './vignette.frag?raw';
import filmGrainFrag from './film-grain.frag?raw';
import rgbSplitFrag from './rgb-split.frag?raw';
import glitchFrag from './glitch.frag?raw';
import bloomFrag from './bloom.frag?raw';
import pixelateFrag from './pixelate.frag?raw';
import posterizeFrag from './posterize.frag?raw';
import duotoneFrag from './duotone.frag?raw';
import mirrorFrag from './mirror.frag?raw';
import fisheyeFrag from './fisheye.frag?raw';
import kaleidoscopeFrag from './kaleidoscope.frag?raw';
import edgeGlowFrag from './edge-glow.frag?raw';
import softBlurFrag from './soft-blur.frag?raw';
import lightLeakFrag from './light-leak.frag?raw';
import lookTealOrangeFrag from './look-teal-orange.frag?raw';
import lookMonoFrag from './look-mono.frag?raw';
import lookWarmFrag from './look-warm.frag?raw';
import lookCoolFrag from './look-cool.frag?raw';
import lookSunsetFrag from './look-sunset.frag?raw';
import lookCyberFrag from './look-cyber.frag?raw';
import lookBleachFrag from './look-bleach.frag?raw';
import lookFujiChromeFrag from './look-fuji-chrome.frag?raw';
import lookFujiPortraFrag from './look-fuji-portra.frag?raw';
import lookFujiVelviaFrag from './look-fuji-velvia.frag?raw';
import lookRicohGrFrag from './look-ricoh-gr.frag?raw';
import lookKodakGoldFrag from './look-kodak-gold.frag?raw';
import lookDisposableFrag from './look-disposable.frag?raw';
import lookCinestillFrag from './look-cinestill.frag?raw';
import sepiaFrag from './sepia.frag?raw';
import invertFrag from './invert.frag?raw';
import halftoneFrag from './halftone.frag?raw';
import motionBlurFrag from './motion-blur.frag?raw';
import type { FxDef, SerializableFxDef } from './uniforms';
import type { FxPass } from '../runtime';

// invert is modeled as a 0/1 slider.
const INVERT = { key: 'invert', label: 'Invert', default: 0, min: 0, max: 1, step: 1 };

// Per-clip WebGL effects (builtin:fx-*): single-input renderPass, u_input +
// named uniforms (name, default, min, max), premultiplied-alpha out.
// `props` carry each uniform's defaults/ranges and drive both the
// uniform values and the inspector sliders. u_width/u_height/u_resolution are
// supplied by the runtime (canvas size), not user properties.

export type { FxDef, FxProperty } from './uniforms';
export { fxUniform, fxUniforms } from './uniforms';

export const FX_EFFECTS: Record<string, FxDef> = {
  'builtin:fx-luma-key': {
    id: 'builtin:fx-luma-key',
    name: 'Luma Key',
    desc: 'Turns black backgrounds transparent while keeping highlights, like a Screen blend — for overlaying fire/smoke/light-leak/particle footage shot on black.',
    frag: lumaKeyFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'threshold', label: 'Threshold', default: 0.03, min: 0, max: 0.2, step: 0.005 },
      { key: 'softness', label: 'Softness', default: 0.3, min: 0.05, max: 0.8, step: 0.01 },
      { key: 'gamma', label: 'Gamma', default: 0.7, min: 0.3, max: 2, step: 0.05 },
    ],
  },
  'builtin:fx-local-mosaic': {
    id: 'builtin:fx-local-mosaic',
    name: 'Local Mosaic',
    desc: 'Pixelates a rectangular region; adjustable position/size/block size/feather.',
    frag: localMosaicFrag,
    props: [
      { key: 'center_x', label: 'Center X', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'center_y', label: 'Center Y', default: 0.3, min: 0, max: 1, step: 0.01 },
      { key: 'width_ratio', label: 'Width', default: 0.2, min: 0, max: 1, step: 0.01 },
      { key: 'height_ratio', label: 'Height', default: 0.2, min: 0, max: 1, step: 0.01 },
      { key: 'block_size', label: 'Block Size', default: 20, min: 1, max: 200, step: 1 },
      { key: 'feather', label: 'Feather', default: 4, min: 0, max: 100, step: 1 },
    ],
  },
  'builtin:fx-magnify': {
    id: 'builtin:fx-magnify',
    name: 'Magnifier',
    desc: 'Adds a magnifying lens at a given center; adjustable radius/magnification/border.',
    frag: magnifyFrag,
    props: [
      { key: 'center_x', label: 'Center X', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'center_y', label: 'Center Y', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'radius', label: 'Radius', default: 0.15, min: 0.01, max: 1, step: 0.01 },
      { key: 'magnification', label: 'Magnification', default: 2, min: 1, max: 8, step: 0.1 },
      { key: 'border_width', label: 'Border', default: 4, min: 0, max: 20, step: 1 },
    ],
  },
  'builtin:fx-rect-mask': {
    id: 'builtin:fx-rect-mask',
    name: 'Rectangle Mask',
    desc: 'Crops the frame to a rounded rectangle; adjustable position/size/corner radius/feather/invert.',
    frag: rectMaskFrag,
    props: [
      { key: 'center_x', label: 'Center X', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'center_y', label: 'Center Y', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'width', label: 'Width', default: 0.5, min: 0, max: 1, step: 0.01, uniform: 'u_rect_width' },
      { key: 'height', label: 'Height', default: 0.5, min: 0, max: 1, step: 0.01, uniform: 'u_rect_height' },
      { key: 'corner_radius', label: 'Corner Radius', default: 0, min: 0, max: 1000, step: 1 },
      { key: 'feather', label: 'Feather', default: 2, min: 0, max: 200, step: 1 },
      INVERT,
    ],
  },
  'builtin:fx-circle-mask': {
    id: 'builtin:fx-circle-mask',
    name: 'Circle Mask',
    desc: 'Crops the frame to a soft-edged circle; adjustable center/radius/feather/invert.',
    frag: circleMaskFrag,
    props: [
      { key: 'center_x', label: 'Center X', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'center_y', label: 'Center Y', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'radius', label: 'Radius', default: 0.3, min: 0, max: 1, step: 0.01 },
      { key: 'feather', label: 'Feather', default: 2, min: 0, max: 200, step: 1 },
      INVERT,
    ],
  },
  'builtin:fx-crt': {
    id: 'builtin:fx-crt',
    name: 'Retro CRT',
    desc: 'Simulates a CRT tube: scanlines/screen curvature/RGB shift/noise/vignette. Animated.',
    frag: crtFrag,
    props: [
      { key: 'scanlineIntensity', label: 'Scanlines', default: 0.4, min: 0, max: 1, step: 0.01 },
      { key: 'curvature', label: 'Curvature', default: 0.15, min: 0, max: 1, step: 0.01 },
      { key: 'noiseAmount', label: 'Noise', default: 0.05, min: 0, max: 1, step: 0.01 },
      { key: 'rgbShift', label: 'RGB Shift', default: 0.002, min: 0, max: 0.05, step: 0.001 },
      { key: 'brightness', label: 'Brightness', default: 1.1, min: 0, max: 3, step: 0.05 },
    ],
  },
  'builtin:fx-ascii-rain': {
    id: 'builtin:fx-ascii-rain',
    name: 'ASCII Rain',
    desc: 'Generates glowing blue ASCII rain over the bright parts of the video.',
    frag: asciiRainFrag,
    pipeline: (uniforms) => {
      const blurRadius = typeof uniforms.u_blurRadius === 'number' ? uniforms.u_blurRadius : 2;
      const passes: FxPass[] = [
        { frag: asciiRainFrag, uniforms },
        { frag: asciiRainBlurFrag, uniforms: { u_direction: [blurRadius, 0] } },
        { frag: asciiRainBlurFrag, uniforms: { u_direction: [0, blurRadius] } },
        { frag: asciiRainCompositeFrag, inputFrom: 0, samplers: { u_bloom: 2 }, uniforms },
      ];
      return passes;
    },
    props: [
      { key: 'gridSize', label: 'Glyph Size', default: 8, min: 4, max: 32, step: 1 },
      { key: 'glow', label: 'Glow', default: 1.5, min: 0, max: 4, step: 0.1 },
      { key: 'blurRadius', label: 'Bloom Radius', default: 2, min: 0, max: 8, step: 0.5 },
      { key: 'color', label: 'Glyph Color', kind: 'color', default: [0, 0.7490196078431373, 1], uniform: 'u_color' },
    ],
  },
  'builtin:fx-shake': {
    id: 'builtin:fx-shake',
    name: 'Handheld Camera',
    desc: 'fbm noise jitter + rotation/zoom/breathing to simulate handheld camera motion. Animated.',
    frag: cameraShakeFrag,
    props: [
      { key: 'strength', label: 'Intensity', default: 1.2, min: 0, max: 5, step: 0.1 },
      { key: 'speed', label: 'Speed', default: 1.8, min: 0, max: 10, step: 0.1 },
      { key: 'zoom', label: 'Zoom', default: 1.15, min: 1, max: 2, step: 0.01 },
      { key: 'rotation', label: 'Rotation', default: 0.9, min: 0, max: 5, step: 0.1 },
      { key: 'breathe', label: 'Breathe', default: 0.7, min: 0, max: 3, step: 0.1 },
    ],
  },
  'builtin:fx-tilt-shift': {
    id: 'builtin:fx-tilt-shift',
    name: 'Tilt-Shift',
    desc: 'Simulates a tilt-shift lens: a sharp focus band blurring above and below + saturation/vignette. Two-pass separable Gaussian blur.',
    frag: tiltShiftPass1Frag,
    passes: [tiltShiftPass1Frag, tiltShiftPass2Frag],
    props: [
      { key: 'focusY', label: 'Focus Position', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'focusWidth', label: 'Focus Width', default: 0.2, min: 0, max: 1, step: 0.01 },
      { key: 'tiltAngle', label: 'Tilt Angle', default: 0, min: -3.14159, max: 3.14159, step: 0.01 },
      { key: 'blurStrength', label: 'Blur Strength', default: 12, min: 0, max: 40, step: 0.5 },
      { key: 'blurSide', label: 'Blur Side (0 both / 1 top / 2 bottom)', default: 0, min: 0, max: 2, step: 1 },
      { key: 'saturation', label: 'Saturation', default: 1.3, min: 0, max: 3, step: 0.05 },
      { key: 'vignette', label: 'Vignette', default: 0.2, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-chroma-key': {
    id: 'builtin:fx-chroma-key',
    name: 'Chroma Key / Green Screen',
    desc: 'Keys out the background by key color (green screen by default); adjustable similarity/feather/spill suppression.',
    frag: chromaKeyFrag,
    props: [
      { key: 'keyColor', label: 'Key Color', kind: 'color', default: [0, 1, 0], uniform: 'u_keyColor' },
      { key: 'similarity', label: 'Similarity', default: 0.18, min: 0, max: 0.6, step: 0.01 },
      { key: 'smoothness', label: 'Feather', default: 0.08, min: 0.001, max: 0.4, step: 0.005 },
      { key: 'spill', label: 'Spill Suppression', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },

  // ── Professional colorist toolkit ─────────────────────────────────────────
  'builtin:fx-color-wheels': {
    id: 'builtin:fx-color-wheels',
    name: 'Three-Way Color Wheels',
    desc: 'Colorist three-way wheels: lift shifts the shadows, gamma the midtones, gain the highlights; 0.5 grey is neutral and each acts per channel.',
    frag: colorWheelsFrag,
    props: [
      { key: 'liftColor', label: 'Shadows Lift', kind: 'color', default: [0.5, 0.5, 0.5], uniform: 'u_liftColor' },
      { key: 'gammaColor', label: 'Midtones Gamma', kind: 'color', default: [0.5, 0.5, 0.5], uniform: 'u_gammaColor' },
      { key: 'gainColor', label: 'Highlights Gain', kind: 'color', default: [0.5, 0.5, 0.5], uniform: 'u_gainColor' },
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-levels': {
    id: 'builtin:fx-levels',
    name: 'Levels',
    desc: 'Input black/white point remap + midtone Gamma + output black/white point (per channel); pair it with the black/white point readings from inspect_color.',
    frag: levelsFrag,
    props: [
      { key: 'inBlack', label: 'Input Black', default: 0, min: 0, max: 0.5, step: 0.005 },
      { key: 'inWhite', label: 'Input White', default: 1, min: 0.5, max: 1, step: 0.005 },
      { key: 'gamma', label: 'Gamma', default: 1, min: 0.2, max: 3, step: 0.02 },
      { key: 'outBlack', label: 'Output Black', default: 0, min: 0, max: 0.5, step: 0.005 },
      { key: 'outWhite', label: 'Output White', default: 1, min: 0.5, max: 1, step: 0.005 },
    ],
  },
  'builtin:fx-highlights-shadows': {
    id: 'builtin:fx-highlights-shadows',
    name: 'Highlights/Shadows',
    desc: 'Adjusts each separately through a soft luminance mask: lift the shadows (protecting highlights), recover or boost the highlights.',
    frag: highlightsShadowsFrag,
    props: [
      { key: 'shadows', label: 'Shadows', default: 0, min: -1, max: 1, step: 0.02 },
      { key: 'highlights', label: 'Highlights', default: 0, min: -1, max: 1, step: 0.02 },
      { key: 'shadowRange', label: 'Shadow Range', default: 0.35, min: 0.1, max: 0.7, step: 0.01 },
      { key: 'highlightRange', label: 'Highlight Range', default: 0.35, min: 0.1, max: 0.7, step: 0.01 },
    ],
  },
  'builtin:fx-clarity': {
    id: 'builtin:fx-clarity',
    name: 'Clarity',
    desc: 'Midtone local contrast (luma unsharp): positive values add texture, negative values soften skin.',
    frag: clarityFrag,
    props: [
      { key: 'amount', label: 'Intensity', default: 0.35, min: -1, max: 1, step: 0.02 },
      { key: 'radius', label: 'Radius (px)', default: 24, min: 4, max: 64, step: 1 },
    ],
  },
  'builtin:fx-hsl-qualify': {
    id: 'builtin:fx-hsl-qualify',
    name: 'HSL Qualifier',
    desc: 'Secondary grade: shifts hue/saturation/luminance only inside the selected hue range (center ± width + feather); targeted fixes for skin, sky, or brand colors.',
    frag: hslQualifyFrag,
    props: [
      { key: 'hueCenter', label: 'Hue Center (°)', default: 25, min: 0, max: 360, step: 1 },
      { key: 'hueWidth', label: 'Selection Width (°)', default: 25, min: 5, max: 90, step: 1 },
      { key: 'softness', label: 'Feather (°)', default: 20, min: 1, max: 60, step: 1 },
      { key: 'hueShift', label: 'Hue Shift (°)', default: 0, min: -60, max: 60, step: 1 },
      { key: 'satMul', label: 'Saturation ×', default: 1, min: 0, max: 2, step: 0.02 },
      { key: 'lumaMul', label: 'Luminance ×', default: 1, min: 0.5, max: 1.5, step: 0.01 },
    ],
  },

  // ── Extended generated library ──────────────────────────────────────────
  'builtin:fx-vignette': {
    id: 'builtin:fx-vignette',
    name: 'Vignette',
    desc: 'Darkens the edges to emphasize the center subject. Adjustable amount/softness/roundness.',
    frag: vignetteFrag,
    props: [
      { key: 'amount', label: 'Intensity', default: 0.55, min: 0, max: 1, step: 0.01 },
      { key: 'softness', label: 'Softness', default: 0.45, min: 0.05, max: 1, step: 0.01 },
      { key: 'roundness', label: 'Roundness', default: 1, min: 0.5, max: 2, step: 0.01 },
    ],
  },
  'builtin:fx-film-grain': {
    id: 'builtin:fx-film-grain',
    name: 'Film Grain',
    desc: 'Dynamic film-grain texture. Animated.',
    frag: filmGrainFrag,
    props: [
      { key: 'amount', label: 'Intensity', default: 0.18, min: 0, max: 0.6, step: 0.01 },
      { key: 'size', label: 'Grain Size', default: 1.2, min: 0.5, max: 4, step: 0.1 },
    ],
  },
  'builtin:fx-rgb-split': {
    id: 'builtin:fx-rgb-split',
    name: 'RGB Split',
    desc: 'Channel-offset chromatic aberration — cyber/glitch feel.',
    frag: rgbSplitFrag,
    props: [
      { key: 'amount', label: 'Offset', default: 0.008, min: 0, max: 0.05, step: 0.001 },
      { key: 'angle', label: 'Direction', default: 0, min: 0, max: 6.2832, step: 0.05 },
    ],
  },
  'builtin:fx-glitch': {
    id: 'builtin:fx-glitch',
    name: 'Glitch',
    desc: 'Horizontal slice displacement + occasional inversion/color fringing. Animated.',
    frag: glitchFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.7, min: 0, max: 2, step: 0.05 },
      { key: 'blockSize', label: 'Slice Density', default: 28, min: 4, max: 80, step: 1 },
    ],
  },
  'builtin:fx-bloom': {
    id: 'builtin:fx-bloom',
    name: 'Bloom',
    desc: 'Highlight bloom for a cinematic glow.',
    frag: bloomFrag,
    props: [
      { key: 'threshold', label: 'Threshold', default: 0.55, min: 0, max: 1, step: 0.01 },
      { key: 'intensity', label: 'Intensity', default: 0.85, min: 0, max: 3, step: 0.05 },
      { key: 'radius', label: 'Radius', default: 2.5, min: 0.5, max: 8, step: 0.1 },
    ],
  },
  'builtin:fx-pixelate': {
    id: 'builtin:fx-pixelate',
    name: 'Pixelate',
    desc: 'Full-frame pixel-block stylization.',
    frag: pixelateFrag,
    props: [
      { key: 'blockSize', label: 'Block Size', default: 12, min: 2, max: 80, step: 1 },
    ],
  },
  'builtin:fx-posterize': {
    id: 'builtin:fx-posterize',
    name: 'Posterize',
    desc: 'Reduces color levels for an illustration/poster look.',
    frag: posterizeFrag,
    props: [
      { key: 'levels', label: 'Levels', default: 5, min: 2, max: 16, step: 1 },
      { key: 'contrast', label: 'Contrast', default: 1.15, min: 0.5, max: 2.5, step: 0.05 },
    ],
  },
  'builtin:fx-duotone': {
    id: 'builtin:fx-duotone',
    name: 'Duotone',
    desc: 'Maps shadows and highlights to two colors by luminance.',
    frag: duotoneFrag,
    props: [
      { key: 'shadowColor', label: 'Shadow Color', kind: 'color', default: [0.08, 0.12, 0.35], uniform: 'u_shadowColor' },
      { key: 'highlightColor', label: 'Highlight Color', kind: 'color', default: [1.0, 0.72, 0.35], uniform: 'u_highlightColor' },
      { key: 'contrast', label: 'Contrast', default: 1.2, min: 0.5, max: 2.5, step: 0.05 },
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-mirror': {
    id: 'builtin:fx-mirror',
    name: 'Mirror',
    desc: 'Horizontal/vertical mirror tiling. mode: 0 left→right, 1 right→left, 2 top→bottom, 3 bottom→top.',
    frag: mirrorFrag,
    props: [
      { key: 'mode', label: 'Mode', default: 0, min: 0, max: 3, step: 1 },
      { key: 'axis', label: 'Axis', default: 0.5, min: 0.1, max: 0.9, step: 0.01 },
    ],
  },
  'builtin:fx-fisheye': {
    id: 'builtin:fx-fisheye',
    name: 'Fisheye',
    desc: 'Barrel-distortion wide-angle effect.',
    frag: fisheyeFrag,
    props: [
      { key: 'strength', label: 'Intensity', default: 0.55, min: 0, max: 1.5, step: 0.01 },
      { key: 'zoom', label: 'Zoom', default: 1.05, min: 0.5, max: 2, step: 0.01 },
    ],
  },
  'builtin:fx-kaleidoscope': {
    id: 'builtin:fx-kaleidoscope',
    name: 'Kaleidoscope',
    desc: 'Radial segment mirroring — kaleidoscope pattern.',
    frag: kaleidoscopeFrag,
    props: [
      { key: 'segments', label: 'Segments', default: 6, min: 2, max: 16, step: 1 },
      { key: 'angle', label: 'Rotation', default: 0, min: 0, max: 6.2832, step: 0.05 },
      { key: 'zoom', label: 'Zoom', default: 1, min: 0.4, max: 2, step: 0.01 },
    ],
  },
  'builtin:fx-edge-glow': {
    id: 'builtin:fx-edge-glow',
    name: 'Edge Glow',
    desc: 'Sobel edge detection with a colored glow outline.',
    frag: edgeGlowFrag,
    props: [
      { key: 'strength', label: 'Intensity', default: 1.4, min: 0, max: 4, step: 0.05 },
      { key: 'threshold', label: 'Threshold', default: 0.08, min: 0, max: 0.5, step: 0.01 },
      { key: 'color', label: 'Color', kind: 'color', default: [0.4, 0.9, 1.0], uniform: 'u_color' },
    ],
  },
  'builtin:fx-soft-blur': {
    id: 'builtin:fx-soft-blur',
    name: 'Soft Blur',
    desc: 'Lightweight full-frame soft focus.',
    frag: softBlurFrag,
    props: [
      { key: 'amount', label: 'Blur Amount', default: 2.5, min: 0, max: 12, step: 0.1 },
    ],
  },
  'builtin:fx-light-leak': {
    id: 'builtin:fx-light-leak',
    name: 'Light Leak',
    desc: 'Film light-leak color band with a subtle breathing animation.',
    frag: lightLeakFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.55, min: 0, max: 1.5, step: 0.01 },
      { key: 'angle', label: 'Angle', default: 0.7, min: 0, max: 6.2832, step: 0.05 },
      { key: 'spread', label: 'Width', default: 0.35, min: 0.05, max: 1, step: 0.01 },
      { key: 'tint', label: 'Tint', kind: 'color', default: [1.0, 0.45, 0.2], uniform: 'u_tint' },
    ],
  },
  'builtin:fx-sepia': {
    id: 'builtin:fx-sepia',
    name: 'Sepia',
    desc: 'Classic sepia vintage tint.',
    frag: sepiaFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 },
      { key: 'contrast', label: 'Contrast', default: 1.1, min: 0.5, max: 2, step: 0.05 },
    ],
  },
  'builtin:fx-invert': {
    id: 'builtin:fx-invert',
    name: 'Invert',
    desc: 'RGB inversion — negative/glitch style.',
    frag: invertFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-halftone': {
    id: 'builtin:fx-halftone',
    name: 'Halftone',
    desc: 'Print halftone / comic-dot style.',
    frag: halftoneFrag,
    props: [
      { key: 'dotSize', label: 'Dot Size', default: 8, min: 2, max: 32, step: 1 },
      { key: 'contrast', label: 'Contrast', default: 1.3, min: 0.5, max: 2.5, step: 0.05 },
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-motion-blur': {
    id: 'builtin:fx-motion-blur',
    name: 'Motion Blur',
    desc: 'Directional smearing to convey speed.',
    frag: motionBlurFrag,
    props: [
      { key: 'amount', label: 'Blur Amount', default: 2.5, min: 0, max: 12, step: 0.1 },
      { key: 'angle', label: 'Direction', default: 0, min: 0, max: 6.2832, step: 0.05 },
    ],
  },
};

/** Core library order first, followed by extended effects. */
export const FX_ORDER = [
  'builtin:fx-rect-mask',
  'builtin:fx-circle-mask',
  'builtin:fx-local-mosaic',
  'builtin:fx-magnify',
  'builtin:fx-tilt-shift',
  'builtin:fx-crt',
  'builtin:fx-ascii-rain',
  'builtin:fx-shake',
  'builtin:fx-luma-key',
  'builtin:fx-chroma-key',
  'builtin:fx-color-wheels',
  'builtin:fx-levels',
  'builtin:fx-highlights-shadows',
  'builtin:fx-clarity',
  'builtin:fx-hsl-qualify',
  'builtin:fx-vignette',
  'builtin:fx-film-grain',
  'builtin:fx-rgb-split',
  'builtin:fx-glitch',
  'builtin:fx-bloom',
  'builtin:fx-pixelate',
  'builtin:fx-posterize',
  'builtin:fx-duotone',
  'builtin:fx-mirror',
  'builtin:fx-fisheye',
  'builtin:fx-kaleidoscope',
  'builtin:fx-edge-glow',
  'builtin:fx-soft-blur',
  'builtin:fx-light-leak',
  'builtin:fx-sepia',
  'builtin:fx-invert',
  'builtin:fx-halftone',
  'builtin:fx-motion-blur',
] as const;

export const FX_IDS = [
  ...FX_ORDER.filter((id) => id in FX_EFFECTS),
  ...Object.keys(FX_EFFECTS).filter((id) => !(FX_ORDER as readonly string[]).includes(id)),
];

// LUTs: camera-log → Rec.709 color transforms. Kept
// separate from FX so the library shows them under their own LUT tab, but they
// render through the same per-clip GL pipeline. intensity mixes original↔graded
// through propertyOverrides.intensity.
export const LUT_EFFECTS: Record<string, FxDef> = {
  'builtin:slog3-s709': {
    id: 'builtin:slog3-s709',
    name: 'Sony S-Log3 → s709',
    desc: 'Sony S-Log3 / S-Gamut3.Cine → Rec.709. Real .cube 3D LUT (Sony_Slog3_s709.cube, 33³) + shared lut.frag (sampler3D, wrapped in BT.709 encode/decode)',
    frag: lutFrag,
    cube: '/luts/Sony_Slog3_s709.cube',
    props: [{ key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 }],
  },
  'builtin:canon-log3-709': {
    id: 'builtin:canon-log3-709',
    name: 'Canon Log 3 → BT.709',
    desc: 'Canon Cinema Gamut / Canon Log 3 → Canon 709. Real .cube 3D LUT (CinemaGamut_CanonLog3-to-Canon709_33_Ver.1.0.cube, 33³) + shared lut.frag',
    frag: lutFrag,
    cube: '/luts/CinemaGamut_CanonLog3-to-Canon709_33_Ver.1.0.cube',
    props: [{ key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 }],
  },
  // creative looks (formula grades — not camera-log cubes)
  'builtin:look-teal-orange': {
    id: 'builtin:look-teal-orange',
    name: 'Teal & Orange',
    desc: 'Hollywood grade: teal shadows, orange highlights.',
    frag: lookTealOrangeFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.85, min: 0, max: 1, step: 0.01 },
      { key: 'contrast', label: 'Contrast', default: 1.1, min: 0.6, max: 1.8, step: 0.02 },
    ],
  },
  'builtin:look-mono': {
    id: 'builtin:look-mono',
    name: 'B&W Film',
    desc: 'High-contrast black & white + subtle animated grain.',
    frag: lookMonoFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 },
      { key: 'contrast', label: 'Contrast', default: 1.25, min: 0.6, max: 2.2, step: 0.02 },
      { key: 'grain', label: 'Grain', default: 0.08, min: 0, max: 0.4, step: 0.01 },
    ],
  },
  'builtin:look-warm': {
    id: 'builtin:look-warm',
    name: 'Warm Vintage',
    desc: 'Warm color temperature with a light fade — vintage feel.',
    frag: lookWarmFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 1, step: 0.01 },
      { key: 'temperature', label: 'Temperature', default: 0.7, min: 0, max: 1.5, step: 0.02 },
      { key: 'fade', label: 'Fade', default: 0.35, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:look-cool': {
    id: 'builtin:look-cool',
    name: 'Cool Blue',
    desc: 'Cool color temperature with blue pushed into the shadows.',
    frag: lookCoolFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.85, min: 0, max: 1, step: 0.01 },
      { key: 'temperature', label: 'Coolness', default: 0.75, min: 0, max: 1.5, step: 0.02 },
      { key: 'shadows', label: 'Shadow Blue', default: 0.55, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:look-sunset': {
    id: 'builtin:look-sunset',
    name: 'Golden Sunset',
    desc: 'Golden highlights and warm shadows — dusk feel.',
    frag: lookSunsetFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 1, step: 0.01 },
      { key: 'warmth', label: 'Warmth', default: 1, min: 0, max: 1.5, step: 0.02 },
    ],
  },
  'builtin:look-cyber': {
    id: 'builtin:look-cyber',
    name: 'Cyber Neon',
    desc: 'Neon sci-fi grade: teal-blue shadows, magenta highlights.',
    frag: lookCyberFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.85, min: 0, max: 1, step: 0.01 },
      { key: 'contrast', label: 'Contrast', default: 1.2, min: 0.6, max: 2, step: 0.02 },
    ],
  },
  'builtin:look-bleach': {
    id: 'builtin:look-bleach',
    name: 'Bleach Bypass',
    desc: 'Desaturated + lifted blacks — bleach-bypass cinematic look.',
    frag: lookBleachFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 1, step: 0.01 },
      { key: 'fade', label: 'Fade', default: 0.45, min: 0, max: 1, step: 0.01 },
    ],
  },
  // ── film / camera aesthetics (formula looks, not licensed cubes) ─────────
  'builtin:look-fuji-chrome': {
    id: 'builtin:look-fuji-chrome',
    name: 'Fuji Classic Chrome',
    desc: 'Low saturation, soft contrast, cool mid-grays — travel/street documentary feel (inspired by Fujifilm film simulations, not an official LUT).',
    frag: lookFujiChromeFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.92, min: 0, max: 1, step: 0.01 },
      { key: 'fade', label: 'Fade', default: 0.4, min: 0, max: 1, step: 0.01 },
      { key: 'grain', label: 'Grain', default: 0.06, min: 0, max: 0.35, step: 0.01 },
    ],
  },
  'builtin:look-fuji-portra': {
    id: 'builtin:look-fuji-portra',
    name: 'Fuji Portrait Pro Neg',
    desc: 'Creamy skin tones, soft pink highlights, lifted shadows — portrait/lifestyle feel (inspired by Portra / Pro Neg).',
    frag: lookFujiPortraFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 1, step: 0.01 },
      { key: 'warmth', label: 'Warmth', default: 0.85, min: 0, max: 1.5, step: 0.02 },
      { key: 'softness', label: 'Softness', default: 0.7, min: 0, max: 1, step: 0.02 },
      { key: 'grain', label: 'Grain', default: 0.05, min: 0, max: 0.3, step: 0.01 },
    ],
  },
  'builtin:look-fuji-velvia': {
    id: 'builtin:look-fuji-velvia',
    name: 'Fuji Velvia Landscape',
    desc: 'Saturated greens/blues with crisp contrast — scenic/nature landscapes (inspired by Velvia slide film).',
    frag: lookFujiVelviaFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.88, min: 0, max: 1, step: 0.01 },
      { key: 'saturation', label: 'Saturation', default: 1.1, min: 0.4, max: 1.8, step: 0.02 },
      { key: 'contrast', label: 'Contrast', default: 1.15, min: 0.7, max: 1.8, step: 0.02 },
      { key: 'grain', label: 'Grain', default: 0.04, min: 0, max: 0.25, step: 0.01 },
    ],
  },
  'builtin:look-ricoh-gr': {
    id: 'builtin:look-ricoh-gr',
    name: 'Ricoh GR Street',
    desc: 'Slightly harder contrast, cool neutral grays, urban documentary — GR snapshot feel (inspired by Ricoh street aesthetics).',
    frag: lookRicohGrFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 1, step: 0.01 },
      { key: 'contrast', label: 'Contrast', default: 1.22, min: 0.8, max: 1.8, step: 0.02 },
      { key: 'cool', label: 'Cool Tone', default: 0.75, min: 0, max: 1.5, step: 0.02 },
      { key: 'grain', label: 'Grain', default: 0.07, min: 0, max: 0.35, step: 0.01 },
    ],
  },
  'builtin:look-kodak-gold': {
    id: 'builtin:look-kodak-gold',
    name: 'Kodak Gold',
    desc: 'Nostalgic warm yellow-greens, soft contrast — Y2K snapshot / family-album feel (inspired by Kodak Gold).',
    frag: lookKodakGoldFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 1, step: 0.01 },
      { key: 'yellow', label: 'Golden', default: 1, min: 0, max: 1.5, step: 0.02 },
      { key: 'fade', label: 'Fade', default: 0.4, min: 0, max: 1, step: 0.01 },
      { key: 'grain', label: 'Grain', default: 0.08, min: 0, max: 0.4, step: 0.01 },
    ],
  },
  'builtin:look-disposable': {
    id: 'builtin:look-disposable',
    name: 'Instant / Disposable',
    desc: 'Soft blur, green cast, coarse grain, vignette — that instant / disposable-camera vibe.',
    frag: lookDisposableFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.92, min: 0, max: 1, step: 0.01 },
      { key: 'cast', label: 'Color Cast', default: 0.9, min: 0, max: 1.5, step: 0.02 },
      { key: 'grain', label: 'Grain', default: 0.16, min: 0, max: 0.5, step: 0.01 },
      { key: 'vignette', label: 'Vignette', default: 0.45, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:look-cinestill': {
    id: 'builtin:look-cinestill',
    name: 'CineStill Night',
    desc: 'Tungsten cool cyan with slight highlight halation — night streets/neon (inspired by CineStill 800T).',
    frag: lookCinestillFrag,
    props: [
      { key: 'intensity', label: 'Intensity', default: 0.88, min: 0, max: 1, step: 0.01 },
      { key: 'cyan', label: 'Cyan', default: 0.95, min: 0, max: 1.5, step: 0.02 },
      { key: 'contrast', label: 'Contrast', default: 1.18, min: 0.7, max: 1.8, step: 0.02 },
      { key: 'grain', label: 'Grain', default: 0.09, min: 0, max: 0.4, step: 0.01 },
    ],
  },
};
export const LUT_ORDER = [
  'builtin:slog3-s709',
  'builtin:canon-log3-709',
  // film / camera aesthetics first for the library tab
  'builtin:look-fuji-chrome',
  'builtin:look-fuji-portra',
  'builtin:look-fuji-velvia',
  'builtin:look-ricoh-gr',
  'builtin:look-kodak-gold',
  'builtin:look-disposable',
  'builtin:look-cinestill',
  'builtin:look-teal-orange',
  'builtin:look-mono',
  'builtin:look-warm',
  'builtin:look-cool',
  'builtin:look-sunset',
  'builtin:look-cyber',
  'builtin:look-bleach',
] as const;
export const LUT_IDS = [
  ...LUT_ORDER.filter((id) => id in LUT_EFFECTS),
  ...Object.keys(LUT_EFFECTS).filter((id) => !(LUT_ORDER as readonly string[]).includes(id)),
];

// every per-clip GL effect (fx + lut) — ClipFx / agent / inspector resolve here
export const ALL_FX: Record<string, FxDef> = { ...FX_EFFECTS, ...LUT_EFFECTS };

// ── Runtime custom fx (submit_shader's LLM generated product) registry ──────────────────────
// effect-tools.ts captures ALL_FX with "reference" when loading the module (`const FX_EFFECTS = ALL_FX`),
// So just write "in place" to the ALL_FX object, manage_effects' `assetId in FX_EFFECTS`
// Use describe() to instantly find custom fx - no need to change effect-tools.ts. CUSTOM_FXSave another copy
// Customized entries for easy differentiation/enumeration/testing. Built-in fx and LUTs remain unchanged.
// ponytail: The essence of the registry is to share the runtime state. This is the only place where it must be "changed in place" (the only place where it can be changed
// The way effect-tools that captures the reference sees the new fx); the rest still adheres to the immutable contract.
export const CUSTOM_FX: Record<string, FxDef> = {};

/** Generic lut.frag source code (the plugin LUT def is assembled with it + its own .cube URL). */
export const LUT_FRAG = lutFrag;

/** When applying special effects, take the serializable def of non-built-in assetId (plugin:/custom:), along with setItemEffects
 * Snapshot into state.fxDefs - refresh/headless export (no memory registry) to render. The built-in returns null. */
export function serializableDefsFor(effects: Array<{ assetId: string }>): SerializableFxDef[] {
  const out: SerializableFxDef[] = [];
  for (const { assetId } of effects) {
    if (assetId.startsWith('builtin:')) continue;
    const def = ALL_FX[assetId];
    if (!def || def.pipeline) continue;
    out.push({
      id: def.id, name: def.name, desc: def.desc, frag: def.frag, props: def.props,
      ...(def.passes ? { passes: def.passes } : {}),
      ...(def.cube ? { cube: def.cube } : {}),
    });
  }
  return out;
}

/** Register a runtime custom fx: write CUSTOM_FX and merge it into ALL_FX in place for effect-tools to find. */
export function registerCustomFx(def: FxDef): FxDef {
  CUSTOM_FX[def.id] = def;
  ALL_FX[def.id] = def;
  return def;
}

/** Uninstall custom/plugin fx (CUSTOM_FX entry only; built-in not uninstallable). */
export function unregisterCustomFx(id: string): boolean {
  if (!(id in CUSTOM_FX)) return false;
  delete CUSTOM_FX[id];
  delete ALL_FX[id];
  return true;
}
