module.exports = {
  darkMode: "class",
  content: [
    "./templates/**/*.html",
    "./templates/*.html",
    "./static/js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        "on-secondary-fixed": "#111c2d",
        "surface-container": "#e5eeff",
        "primary": "#1d9e75",
        "on-error-container": "#93000a",
        "on-primary-fixed": "#002115",
        "surface-dim": "#cbdbf5",
        "secondary": "#545f73",
        "on-primary-fixed-variant": "#00513a",
        "outline-variant": "#bccac1",
        "primary-container": "#d4f8e6",
        "on-surface-variant": "#3d4943",
        "tertiary-fixed": "#d8e2ff",
        "secondary-fixed": "#d8e3fb",
        "surface-container-lowest": "#ffffff",
        "primary-fixed-dim": "#68dbae",
        "inverse-primary": "#68dbae",
        "on-tertiary-container": "#fefcff",
        "on-secondary-container": "#586377",
        "on-secondary-fixed-variant": "#3c475a",
        "tertiary-container": "#2170e4",
        "inverse-on-surface": "#eaf1ff",
        "outline": "#6d7a73",
        "tertiary-fixed-dim": "#adc6ff",
        "on-primary": "#ffffff",
        "on-primary-container": "#002115",
        "primary-fixed": "#86f8c9",
        "surface": "#f8f9ff",
        "on-tertiary-fixed": "#001a42",
        "background": "#f8f9ff",
        "surface-container-high": "#dce9ff",
        "on-tertiary": "#ffffff",
        "on-tertiary-fixed-variant": "#004395",
        "on-secondary": "#ffffff",
        "surface-container-low": "#eff4ff",
        "on-error": "#ffffff",
        "surface-bright": "#f8f9ff",
        "on-surface": "#0b1c30",
        "surface-variant": "#d3e4fe",
        "surface-tint": "#1d9e75",
        "error-container": "#ffdad6",
        "secondary-fixed-dim": "#bcc7de",
        "tertiary": "#0058be",
        "surface-container-highest": "#d3e4fe",
        "error": "#ba1a1a",
        "secondary-container": "#d5e0f8",
        "on-background": "#0b1c30",
        "inverse-surface": "#213145"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px",
        "2xl": "1rem"
      },
      spacing: {
        "sm": "12px",
        "lg": "24px",
        "md": "16px",
        "margin-desktop": "40px",
        "xxl": "48px",
        "xs": "4px",
        "xl": "32px",
        "base": "8px",
        "margin-mobile": "16px",
        "gutter": "24px"
      },
      fontFamily: {
        "body-md": ["Inter"],
        "headline-md": ["Inter"],
        "label-md": ["Inter"],
        "headline-lg-mobile": ["Inter"],
        "label-sm": ["Inter"],
        "body-sm": ["Inter"],
        "body-lg": ["Inter"],
        "headline-lg": ["Inter"],
        "display-lg": ["Inter"],
        "headline-sm": ["Inter"]
      },
      fontSize: {
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "label-md": ["14px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "label-sm": ["12px", { "lineHeight": "16px", "fontWeight": "500" }],
        "body-sm": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "headline-lg": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "display-lg": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "headline-sm": ["20px", { "lineHeight": "28px", "fontWeight": "600" }]
      }
    }
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries")
  ]
}
