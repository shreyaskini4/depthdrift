/**
 * Color Modes GLSL Shader Chunk
 * Handles color transformations: TRUE, NEGATIVE, and ON_WHITE,
 * along with point disc rasterization and alpha attenuation.
 */

export const colorModesGLSL = /* glsl */ `
#define COLOR_TRUE 0
#define COLOR_NEGATIVE 1
#define COLOR_ON_WHITE 2

uniform int uColorMode;
uniform vec3 uBackgroundColor;

// Standard luminance calculation according to ITU-R BT.709
float getLuminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * Transforms base particle color according to active ColorMode
 * @param baseColor Original RGBA from image texture
 * @param colorMode COLOR_TRUE (0), COLOR_NEGATIVE (1), COLOR_ON_WHITE (2)
 * @param depth Normalized depth [0..1]
 * @param alphaMod Dynamic alpha modifier from mode animations
 * @return Processed RGBA color
 */
vec4 applyColorMode(vec4 baseColor, int colorMode, float depth, float alphaMod) {
  vec3 rgb = baseColor.rgb;
  float alpha = baseColor.a * alphaMod;

  if (colorMode == COLOR_TRUE) {
    // True color with subtle depth ambient occlusion rim
    float depthOcclusion = mix(0.75, 1.05, depth);
    rgb = clamp(rgb * depthOcclusion, 0.0, 1.0);
  }
  else if (colorMode == COLOR_NEGATIVE) {
    // Film negative inversion with high-contrast luminance curve
    vec3 inverted = vec3(1.0) - rgb;
    float lum = getLuminance(inverted);
    // S-curve contrast boost
    inverted = pow(inverted, vec3(1.2));
    // Subtle cool cyan/amber tinting in negative shadows
    inverted += vec3(0.02, 0.05, 0.08) * (1.0 - lum);
    rgb = clamp(inverted, 0.0, 1.0);
  }
  else if (colorMode == COLOR_ON_WHITE) {
    // Elegant Sumi ink / charcoal on white paper
    float lum = getLuminance(rgb);
    // Invert luminance: dark image regions produce dense dark ink particles
    float inkDensity = 1.0 - lum;
    // Enhanced tone curve for rich blacks and delicate midtones
    inkDensity = smoothstep(0.05, 0.95, inkDensity);

    // Deep warm charcoal ink tone
    vec3 inkColor = vec3(0.06, 0.07, 0.09);
    // Sepia/warm undertone in lighter washes
    vec3 washColor = vec3(0.22, 0.20, 0.19);
    vec3 targetInk = mix(washColor, inkColor, inkDensity);

    rgb = targetInk;
    // Light areas become faint / transparent on white background
    alpha *= clamp(inkDensity * 1.25, 0.15, 1.0);
  }

  return vec4(rgb, alpha);
}

/**
 * Computes circular disc soft alpha for gl_PointCoord
 */
float computePointDiscAlpha(vec2 coord, float softness) {
  float dist = length(coord - vec2(0.5));
  return 1.0 - smoothstep(0.5 - softness, 0.5, dist);
}
`;
