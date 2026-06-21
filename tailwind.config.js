/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'hsl(var(--color-primary))',
        foreground: 'hsl(var(--color-foreground))',
        'muted-foreground': 'hsl(var(--color-muted-foreground))',
        border: 'hsl(var(--color-border))',
        'ring': 'hsl(var(--color-ring) / <alpha-value>)',
        'outline-ring': 'hsl(var(--color-ring) / 0.5)',
        accent: 'hsl(var(--color-accent))',
        secondary: 'hsl(var(--color-secondary))',
      },
    },
  },
  plugins: [],
};
