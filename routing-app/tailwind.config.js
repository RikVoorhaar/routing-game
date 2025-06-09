import daisyui from "daisyui";

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["dark"], // Only enable dark theme
    darkTheme: "dark", // Set dark as the default theme
    base: true, // Apply background color and foreground color for root element
    styled: true, // Include daisyUI colors and design decisions for all components
    utils: true, // Add responsive and modifier utility classes
  },
} 